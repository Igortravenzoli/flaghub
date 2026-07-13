import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, Legend,
} from 'recharts';
import { useSprintSnapshots, type SnapshotScopeBreakdown } from '@/hooks/useSprintSnapshots';
import { cleanFabricaName } from '@/lib/fabricaNames';

type DesempenhoTrendChartProps = {
  /** Fábrica (rótulo normalizado, ex.: "K8") para escopar; null/ausente = geral. */
  fabrica?: string | null;
  /** Quantas sprints mais recentes exibir. */
  maxSprints?: number;
  height?: number;
};

function sprintNum(code: string): number {
  return Number(code.match(/\d+/)?.[0] ?? 0);
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

/** Escopo geral ou de uma fábrica dentro da fotografia da sprint. */
function scopeFor(
  breakdown: { geral: SnapshotScopeBreakdown; fabricas: Record<string, SnapshotScopeBreakdown> } | null,
  fabrica?: string | null,
): SnapshotScopeBreakdown | null {
  if (!breakdown) return null;
  if (!fabrica) return breakdown.geral;
  const entry = Object.entries(breakdown.fabricas).find(([raw]) => cleanFabricaName(raw) === fabrica);
  return entry?.[1] ?? null;
}

/**
 * Tendência dos indicadores de Desempenho & Qualidade por sprint (visão do slide 1):
 * % Entrega (↑ melhor), % Retorno QA e % Bug (↓ melhor). Fonte = fotografias de
 * fim de sprint (sprint_indicator_snapshots).
 */
export function DesempenhoTrendChart({ fabrica, maxSprints = 8, height = 220 }: DesempenhoTrendChartProps) {
  const { data: snapshots = {}, isLoading } = useSprintSnapshots();
  const anoVigente = new Date().getFullYear();

  const data = useMemo(() => {
    const reAno = new RegExp(`^S\\d+-${anoVigente}$`);
    return Object.values(snapshots)
      .filter((s) => reAno.test(s.sprint_code) && s.category_breakdown)
      .map((s) => {
        const scope = scopeFor(s.category_breakdown, fabrica);
        if (!scope) return null;
        return {
          sprint: s.sprint_code.split('-')[0],
          num: sprintNum(s.sprint_code),
          'Entrega': pct(scope.done.total, scope.total),
          'Retorno QA': pct(scope.cats.retorno_qa, scope.total),
          'Bug': pct(scope.cats.bug, scope.total),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.num - b.num)
      .slice(-maxSprints);
  }, [snapshots, fabrica, anoVigente, maxSprints]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-10 text-center">Carregando evolução…</p>;
  }
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground py-10 text-center">Sem fotografias de sprint para a evolução.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="sprint" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
        <RTooltip
          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
          formatter={(v: number, name: string) => [`${v}%`, name]}
        />
        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
        <Line type="monotone" dataKey="Entrega" stroke="hsl(210,80%,52%)" strokeWidth={2.5} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="Retorno QA" stroke="hsl(38,92%,50%)" strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="Bug" stroke="hsl(142,71%,45%)" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
