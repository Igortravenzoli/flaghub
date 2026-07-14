import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSprintSnapshots, type SnapshotScopeBreakdown, type SprintSnapshotRow } from '@/hooks/useSprintSnapshots';
import { cleanFabricaName } from '@/lib/fabricaNames';
import { fabricaColor } from '@/lib/chartColors';
import { quarterLabel } from '@/lib/sprintCalendar';

type GroupBy = 'sprint' | 'quarter';

type QualidadePorFabricaChartsProps = {
  maxSprints?: number;
};

function sprintNum(code: string): number {
  return Number(code.match(/\d+/)?.[0] ?? 0);
}
function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function normalizedFabricas(snap: SprintSnapshotRow): Record<string, SnapshotScopeBreakdown> {
  const out: Record<string, SnapshotScopeBreakdown> = {};
  for (const [raw, scope] of Object.entries(snap.category_breakdown?.fabricas ?? {})) {
    out[cleanFabricaName(raw)] = scope;
  }
  return out;
}

type RawSums = { done: number; scope: number; bug: number; retorno: number };
const emptySums = (): RawSums => ({ done: 0, scope: 0, bug: 0, retorno: 0 });
function addScope(acc: RawSums, scope: SnapshotScopeBreakdown): void {
  acc.done += scope.done.total;
  acc.scope += scope.total;
  acc.bug += scope.cats.bug;
  acc.retorno += scope.cats.retorno_qa;
}

/**
 * "Qualidade das Fábricas" (slides 1 e 3): Entregas, Bug e Retorno QA por sprint,
 * uma barra por fábrica. Alternância Sprint ⇄ Quarter — no acumulado por quarter
 * os totais das sprints são somados ANTES de dividir (não é média de sprints).
 * Fábricas ordenadas da melhor para a pior cruzando Desempenho × Qualidade.
 * Fonte = fotografias de fim de sprint.
 */
export function QualidadePorFabricaCharts({ maxSprints = 6 }: QualidadePorFabricaChartsProps) {
  const { data: snapshots = {}, isLoading } = useSprintSnapshots();
  const [groupBy, setGroupBy] = useState<GroupBy>('sprint');
  const anoVigente = new Date().getFullYear();

  const { columns, fabricasOrdenadas } = useMemo(() => {
    const reAno = new RegExp(`^S\\d+-${anoVigente}$`);
    // No quarter, agrega o ano inteiro (várias colunas Q); por sprint, últimas N.
    const limit = groupBy === 'quarter' ? 24 : maxSprints;
    const rows = Object.values(snapshots)
      .filter((s) => reAno.test(s.sprint_code) && s.category_breakdown)
      .sort((a, b) => sprintNum(a.sprint_code) - sprintNum(b.sprint_code))
      .slice(-limit);

    const colOrder: string[] = [];
    const raw = new Map<string, Map<string, RawSums>>();
    const agg: Record<string, RawSums> = {};

    for (const s of rows) {
      const colKey = groupBy === 'quarter'
        ? (quarterLabel(s.sprint_code) ?? s.sprint_code.split('-')[0])
        : s.sprint_code.split('-')[0];
      if (!raw.has(colKey)) { raw.set(colKey, new Map()); colOrder.push(colKey); }
      const colMap = raw.get(colKey)!;
      for (const [name, scope] of Object.entries(normalizedFabricas(s))) {
        const c = colMap.get(name) ?? emptySums();
        addScope(c, scope);
        colMap.set(name, c);
        const a = (agg[name] ??= emptySums());
        addScope(a, scope);
      }
    }

    const columns = colOrder.map((key) => {
      const colMap = raw.get(key)!;
      const cells: Record<string, { entrega: number; bug: number; retorno: number }> = {};
      for (const [name, c] of colMap) {
        cells[name] = { entrega: pct(c.done, c.scope), bug: pct(c.bug, c.scope), retorno: pct(c.retorno, c.scope) };
      }
      return { label: key, cells };
    });

    // Score = Desempenho − (½·Bug + ½·RetornoQA); maior primeiro (melhor → pior).
    const ordered = Object.entries(agg)
      .map(([name, a]) => ({ name, score: pct(a.done, a.scope) - 0.5 * pct(a.bug, a.scope) - 0.5 * pct(a.retorno, a.scope) }))
      .sort((x, y) => y.score - x.score)
      .map((x) => x.name);

    return { columns, fabricasOrdenadas: ordered };
  }, [snapshots, anoVigente, maxSprints, groupBy]);

  const dataFor = (metric: 'entrega' | 'bug' | 'retorno') =>
    columns.map((col) => {
      const out: Record<string, number | string> = { label: col.label };
      for (const f of fabricasOrdenadas) {
        out[f] = col.cells[f]?.[metric] ?? 0;
      }
      return out;
    });

  const charts: Array<{ key: 'entrega' | 'bug' | 'retorno'; title: string; hint: string }> = [
    { key: 'entrega', title: 'Entregas', hint: '↑ melhor' },
    { key: 'bug', title: 'Bug', hint: '↓ melhor' },
    { key: 'retorno', title: 'Retorno QA', hint: '↓ melhor' },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Qualidade das Fábricas — {groupBy === 'quarter' ? 'por quarter' : 'por sprint'}
          </CardTitle>
          <div className="flex items-center gap-3 flex-wrap">
            {fabricasOrdenadas.length > 0 && (
              <div className="flex gap-3 flex-wrap text-xs">
                {fabricasOrdenadas.map((f, i) => (
                  <span key={f} className="inline-flex items-center gap-1.5 font-medium">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: fabricaColor(f, i) }} />
                    {f}
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-1">
              <Button variant={groupBy === 'sprint' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setGroupBy('sprint')}>Sprint</Button>
              <Button variant={groupBy === 'quarter' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setGroupBy('quarter')}>Quarter</Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-8">Carregando fotografias de sprint…</p>
        ) : columns.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">Sem fotografias de sprint para comparação por fábrica.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {charts.map((c) => (
              <div key={c.key}>
                <p className="text-xs font-medium mb-1">
                  {c.title} <span className="text-muted-foreground font-normal">· {c.hint}</span>
                </p>
                <div className="h-[190px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dataFor(c.key)} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} unit="%" />
                      <RechartsTooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                        formatter={(v: number, name: string) => [`${v}%`, name]}
                      />
                      {fabricasOrdenadas.map((f, i) => (
                        <Bar key={f} dataKey={f} fill={fabricaColor(f, i)} maxBarSize={12} radius={[2, 2, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-2">
          % sobre o escopo de cada fábrica{groupBy === 'quarter' ? ' no quarter (soma das sprints do trimestre)' : ' na sprint'}.
          Fábricas ordenadas da melhor para a pior cruzando Desempenho × Qualidade.
          {groupBy === 'quarter' && ' Sprint entra no quarter pelo mês em que termina.'}
        </p>
      </CardContent>
    </Card>
  );
}
