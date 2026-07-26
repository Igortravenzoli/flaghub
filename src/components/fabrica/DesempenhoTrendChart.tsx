import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip as RTooltip, Legend,
} from 'recharts';
import { useSprintSnapshots, type SnapshotScopeBreakdown } from '@/hooks/useSprintSnapshots';
import { cleanFabricaName } from '@/lib/fabricaNames';
import { concluidoDoEscopo } from '@/lib/fabricaTvSeries';

type DesempenhoTrendChartProps = {
  /** Fábrica (rótulo normalizado, ex.: "K8") para escopar; null/ausente = geral. */
  fabrica?: string | null;
  /** Quantas sprints mais recentes exibir. */
  maxSprints?: number;
  /** Altura do gráfico; use "100%" para preencher o card (o pai precisa ter altura). */
  height?: number | string;
  /** Mostra o número dentro da bolinha de cada ponto. */
  showValues?: boolean;
};

// Semântica das cores: Entrega ↑ é bom (verde), Bug ↓ é ruim (vermelho),
// Retorno QA fica no âmbar (alerta) — definido pelo gestor.
const COR_ENTREGA = 'hsl(142,71%,42%)';
const COR_RETORNO = 'hsl(38,92%,50%)';
const COR_BUG = 'hsl(0,72%,52%)';

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

type DotArgs = {
  cx?: number;
  cy?: number;
  value?: number;
  index?: number;
  payload?: Record<string, number | string>;
};

/**
 * Bolinha com o número dentro. Bug e Retorno QA costumam andar próximos; quando
 * a distância é pequena, afasta uma p/ cima e outra p/ baixo para não sobrepor.
 */
function valueDot(serie: 'Entrega' | 'Retorno QA' | 'Bug', color: string, radius: number) {
  return function Dot({ cx, cy, value, index, payload }: DotArgs) {
    if (cx == null || cy == null || value == null) return null;
    let dy = 0;
    const bug = payload?.['Bug'];
    const ret = payload?.['Retorno QA'];
    if (typeof bug === 'number' && typeof ret === 'number' && Math.abs(bug - ret) < 9) {
      const bugMaisBaixo = bug <= ret; // menor valor = mais embaixo no gráfico
      if (serie === 'Bug') dy = bugMaisBaixo ? radius : -radius;
      else if (serie === 'Retorno QA') dy = bugMaisBaixo ? -radius : radius;
    }
    return (
      <g key={`${serie}-${index}`}>
        <circle cx={cx} cy={cy + dy} r={radius} fill={color} stroke="hsl(var(--card))" strokeWidth={1.5} />
        <text
          x={cx}
          y={cy + dy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={radius * 0.86}
          fontWeight={700}
          fill="#fff"
        >
          {Math.round(Number(value))}
        </text>
      </g>
    );
  };
}

/**
 * Tendência dos indicadores de Desempenho & Qualidade por sprint (visão do slide 1):
 * % Entrega (↑ melhor) em verde, % Retorno QA (âmbar) e % Bug (vermelho, ↓ melhor).
 * Fonte = fotografias de fim de sprint (sprint_indicator_snapshots).
 *
 * Entrega = itens ENCERRADOS (done + entregue) ÷ escopo — mesma régua do
 * gerencial e da faixa de KPI (decisão de 26/07/2026). Antes contava só `done`,
 * e a mesma sprint aparecia com dois números diferentes na mesma tela.
 *
 * Uso de perto (aba Executiva). O telão tem composição própria — ver
 * `EntregaSprintReguaCard`, que substituiu o antigo modo `tv` daqui.
 */
export function DesempenhoTrendChart({
  fabrica,
  maxSprints = 8,
  height = 220,
  showValues = true,
}: DesempenhoTrendChartProps) {
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
          'Entrega': pct(concluidoDoEscopo(scope), scope.total),
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

  // Bolinha maior quando o gráfico é alto.
  const radius = typeof height === 'number' && height >= 240 ? 13 : 11;
  const dotFor = (serie: 'Entrega' | 'Retorno QA' | 'Bug', color: string) =>
    (showValues ? valueDot(serie, color, radius) : { r: 3 });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 18, right: 18, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="sprint" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
        <RTooltip
          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
          formatter={(v: number, name: string) => [`${v}%`, name]}
        />
        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
        <Line type="monotone" dataKey="Entrega" stroke={COR_ENTREGA} strokeWidth={2.5} dot={dotFor('Entrega', COR_ENTREGA)} activeDot={false} />
        <Line type="monotone" dataKey="Retorno QA" stroke={COR_RETORNO} strokeWidth={2} dot={dotFor('Retorno QA', COR_RETORNO)} activeDot={false} />
        <Line type="monotone" dataKey="Bug" stroke={COR_BUG} strokeWidth={2} dot={dotFor('Bug', COR_BUG)} activeDot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
