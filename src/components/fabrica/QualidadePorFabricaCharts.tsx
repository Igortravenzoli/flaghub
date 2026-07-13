import { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSprintSnapshots, type SnapshotScopeBreakdown, type SprintSnapshotRow } from '@/hooks/useSprintSnapshots';
import { cleanFabricaName } from '@/lib/fabricaNames';
import { getChartColor } from '@/lib/chartColors';

type QualidadePorFabricaChartsProps = {
  maxSprints?: number;
};

/** Cor fixa por fábrica — identidade consistente entre os 3 gráficos. */
const FABRICA_COLORS: Record<string, string> = {
  K8: 'hsl(43,74%,49%)',
  FLEXX: 'hsl(265,52%,58%)',
  STAGING: 'hsl(205,55%,47%)',
  APP: 'hsl(160,55%,42%)',
};
function fabricaColor(name: string, idx: number): string {
  return FABRICA_COLORS[name] ?? getChartColor(idx);
}

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

/**
 * "Qualidade das Fábricas" (slides 1 e 3): Entregas, Bug e Retorno QA por sprint,
 * uma barra por fábrica. Fábricas ordenadas da melhor para a pior cruzando
 * Desempenho × Qualidade. Fonte = fotografias de fim de sprint.
 */
export function QualidadePorFabricaCharts({ maxSprints = 6 }: QualidadePorFabricaChartsProps) {
  const { data: snapshots = {}, isLoading } = useSprintSnapshots();
  const anoVigente = new Date().getFullYear();

  const { sprints, fabricasOrdenadas } = useMemo(() => {
    const reAno = new RegExp(`^S\\d+-${anoVigente}$`);
    const rows = Object.values(snapshots)
      .filter((s) => reAno.test(s.sprint_code) && s.category_breakdown)
      .sort((a, b) => sprintNum(a.sprint_code) - sprintNum(b.sprint_code))
      .slice(-maxSprints);

    // Métrica por sprint × fábrica + agregados para ordenar as fábricas.
    const agg: Record<string, { done: number; scope: number; bug: number; retorno: number }> = {};
    const sprintRows = rows.map((s) => {
      const fabs = normalizedFabricas(s);
      const cells: Record<string, { entrega: number; bug: number; retorno: number }> = {};
      for (const [name, scope] of Object.entries(fabs)) {
        cells[name] = {
          entrega: pct(scope.done.total, scope.total),
          bug: pct(scope.cats.bug, scope.total),
          retorno: pct(scope.cats.retorno_qa, scope.total),
        };
        const a = (agg[name] ??= { done: 0, scope: 0, bug: 0, retorno: 0 });
        a.done += scope.done.total;
        a.scope += scope.total;
        a.bug += scope.cats.bug;
        a.retorno += scope.cats.retorno_qa;
      }
      return { sprint: s.sprint_code.split('-')[0], cells };
    });

    // Score = Desempenho − (½·Bug + ½·RetornoQA); maior primeiro (melhor → pior).
    const ordered = Object.entries(agg)
      .map(([name, a]) => ({
        name,
        score: pct(a.done, a.scope) - 0.5 * pct(a.bug, a.scope) - 0.5 * pct(a.retorno, a.scope),
      }))
      .sort((x, y) => y.score - x.score)
      .map((x) => x.name);

    return { sprints: sprintRows, fabricasOrdenadas: ordered };
  }, [snapshots, anoVigente, maxSprints]);

  const dataFor = (metric: 'entrega' | 'bug' | 'retorno') =>
    sprints.map((row) => {
      const out: Record<string, number | string> = { sprint: row.sprint };
      for (const f of fabricasOrdenadas) {
        out[f] = row.cells[f]?.[metric] ?? 0;
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
            Qualidade das Fábricas — por sprint
          </CardTitle>
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
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-8">Carregando fotografias de sprint…</p>
        ) : sprints.length === 0 ? (
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
                      <XAxis dataKey="sprint" tick={{ fontSize: 10 }} />
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
          % sobre o escopo de cada fábrica na sprint. Fábricas ordenadas da melhor para a pior cruzando Desempenho × Qualidade.
        </p>
      </CardContent>
    </Card>
  );
}
