import { useMemo } from 'react';
import {
  ComposedChart, Bar, LabelList, Line, XAxis, YAxis, CartesianGrid, ReferenceLine,
  ResponsiveContainer, Tooltip as RTooltip, Legend,
} from 'recharts';
import { useSprintSnapshots, type SnapshotScopeBreakdown } from '@/hooks/useSprintSnapshots';
import { cleanFabricaName } from '@/lib/fabricaNames';

type DesempenhoTrendChartProps = {
  /** Fábrica (rótulo normalizado, ex.: "K8") para escopar; null/ausente = geral. */
  fabrica?: string | null;
  /** Quantas sprints mais recentes exibir. */
  maxSprints?: number;
  /** Altura do gráfico; use "100%" para preencher o card (o pai precisa ter altura). */
  height?: number | string;
  /** Mostra o número dentro da bolinha de cada ponto. */
  showValues?: boolean;
  /**
   * Modo telão (TV): Entrega vira barra larga, fontes de eixo/legenda crescem e a
   * média de entrega ganha linha de referência rotulada. Default false — a aba
   * executiva continua exatamente como está.
   */
  tv?: boolean;
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
 * Com tv=true, a Entrega vira barra larga e a média de entrega das sprints
 * exibidas ganha linha de referência com rótulo por extenso.
 */
export function DesempenhoTrendChart({
  fabrica,
  maxSprints = 8,
  height = 220,
  showValues = true,
  tv = false,
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

  // Bolinha maior quando o gráfico é alto (TV), menor no painel.
  const radius = tv ? 15 : typeof height === 'number' && height >= 240 ? 13 : 11;
  const dotFor = (serie: 'Entrega' | 'Retorno QA' | 'Bug', color: string) =>
    (showValues ? valueDot(serie, color, radius) : { r: 3 });

  // Média simples do % de entrega (itens Done ÷ escopo) das sprints exibidas —
  // vira linha de referência rotulada no telão.
  const mediaEntrega = Math.round(data.reduce((s, d) => s + d['Entrega'], 0) / data.length * 10) / 10;
  const tickSize = tv ? 15 : 11;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: tv ? 26 : 18, right: 18, left: tv ? -6 : -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="sprint" tick={{ fontSize: tickSize }} />
        <YAxis tick={{ fontSize: tickSize }} unit="%" domain={[0, 100]} />
        <RTooltip
          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: tv ? 14 : 12 }}
          formatter={(v: number, name: string) => [`${v}%`, name]}
        />
        <Legend wrapperStyle={{ fontSize: tv ? '14px' : '11px', paddingTop: '8px' }} />
        {tv ? (
          // No telão a Entrega vira barra larga — a linha fina sumia a distância.
          <Bar dataKey="Entrega" name="Entrega — itens Done ÷ escopo da sprint" fill={COR_ENTREGA} maxBarSize={56} radius={[6, 6, 0, 0]}>
            {showValues && (
              <LabelList
                dataKey="Entrega"
                position="top"
                formatter={(v: number) => `${Math.round(v)}%`}
                style={{ fill: COR_ENTREGA, fontSize: 16, fontWeight: 700 }}
              />
            )}
          </Bar>
        ) : (
          <Line type="monotone" dataKey="Entrega" stroke={COR_ENTREGA} strokeWidth={2.5} dot={dotFor('Entrega', COR_ENTREGA)} activeDot={false} />
        )}
        <Line type="monotone" dataKey="Retorno QA" name={tv ? 'Retorno QA — % do escopo da sprint' : undefined} stroke={COR_RETORNO} strokeWidth={tv ? 3 : 2} dot={dotFor('Retorno QA', COR_RETORNO)} activeDot={false} />
        <Line type="monotone" dataKey="Bug" name={tv ? 'Bug — % do escopo da sprint' : undefined} stroke={COR_BUG} strokeWidth={tv ? 3 : 2} dot={dotFor('Bug', COR_BUG)} activeDot={false} />
        {tv && (
          <ReferenceLine
            y={mediaEntrega}
            stroke={COR_ENTREGA}
            strokeDasharray="6 4"
            strokeWidth={1.5}
            label={{
              value: `média de entrega por sprint (últimas ${data.length}): ${mediaEntrega}%`,
              position: 'insideTopRight',
              fill: 'hsl(var(--foreground))',
              fontSize: 14,
              fontWeight: 600,
            }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
