import { useMemo } from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSprintSnapshots, type SnapshotScopeBreakdown, type SprintSnapshotRow } from '@/hooks/useSprintSnapshots';
import { cleanFabricaName } from '@/lib/fabricaNames';
import { SQUADS } from '@/lib/fabricaRoster';
import { fabricaColor, medalColor } from '@/lib/chartColors';

type RankingFabricasCardProps = {
  /** Quantas sprints mais recentes considerar (barras aninhadas + agregado do score). */
  maxSprints?: number;
  /** Colunas do grid de fábricas (4 no modo TV = tudo numa linha). */
  columns?: number;
  /** Altura renderizada do gráfico aninhado (px). Menor no modo TV. */
  svgHeight?: number;
  /** Preenche a altura do card (modo TV) em vez de usar altura fixa. */
  fill?: boolean;
};

const RANKING_FORMULA = 'Ranking = Desempenho − (½·Bug + ½·Retorno QA), somando todas as sprints do período. Maior valor = melhor cruzamento de desempenho e qualidade.';

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

type SprintCell = { sprint: string; desempenho: number; bug: number; retorno: number };
type FabricaRank = { name: string; score: number; desempenho: number; cells: SprintCell[] };

// Geometria do gráfico aninhado (coordenadas do viewBox).
const CHART_TOP = 10;
const CHART_BOTTOM = 104;
const CHART_H = CHART_BOTTOM - CHART_TOP;
// Geometria: no TV (fill) as barras são maiores e mais espaçadas (menos sprints,
// leitura a distância); no painel, mais compactas.
const GEO_TV = { GROUP_W: 92, OUTER_W: 58, INNER_W: 17 };
const GEO_PANEL = { GROUP_W: 62, OUTER_W: 40, INNER_W: 13 };

function y(value: number): number {
  return CHART_BOTTOM - (Math.max(0, Math.min(100, value)) / 100) * CHART_H;
}

export function RankingFabricasCard({ maxSprints = 6, columns = 2, svgHeight = 126, fill = false }: RankingFabricasCardProps) {
  const { data: snapshots = {}, isLoading } = useSprintSnapshots();
  const anoVigente = new Date().getFullYear();

  const ranking = useMemo<FabricaRank[]>(() => {
    const reAno = new RegExp(`^S\\d+-${anoVigente}$`);
    const rows = Object.values(snapshots)
      .filter((s) => reAno.test(s.sprint_code) && s.category_breakdown)
      .sort((a, b) => sprintNum(a.sprint_code) - sprintNum(b.sprint_code))
      .slice(-maxSprints);

    const byFabrica = new Map<string, { cells: SprintCell[]; done: number; scope: number; bug: number; retorno: number }>();
    for (const s of rows) {
      const sprintLabel = s.sprint_code.split('-')[0];
      for (const [name, scope] of Object.entries(normalizedFabricas(s))) {
        // Só as squads reais. Sem esse filtro entram "Sem fábrica", "DESIGN", "FLG" —
        // que, por não terem dado, ficam com score 0 e passam NA FRENTE das squads
        // reais (score negativo), invertendo o pódio.
        if (!SQUADS.includes(name)) continue;
        const agg = byFabrica.get(name) ?? { cells: [], done: 0, scope: 0, bug: 0, retorno: 0 };
        agg.cells.push({
          sprint: sprintLabel,
          desempenho: pct(scope.done.total, scope.total),
          bug: pct(scope.cats.bug, scope.total),
          retorno: pct(scope.cats.retorno_qa, scope.total),
        });
        agg.done += scope.done.total;
        agg.scope += scope.total;
        agg.bug += scope.cats.bug;
        agg.retorno += scope.cats.retorno_qa;
        byFabrica.set(name, agg);
      }
    }

    return [...byFabrica.entries()]
      .filter(([, a]) => a.scope > 0) // sem escopo não há o que ranquear
      .map(([name, a]) => {
        const desempenho = pct(a.done, a.scope);
        return {
          name,
          desempenho,
          score: Math.round((desempenho - 0.5 * pct(a.bug, a.scope) - 0.5 * pct(a.retorno, a.scope)) * 10) / 10,
          cells: a.cells,
        };
      })
      .sort((x, y2) => y2.score - x.score);
  }, [snapshots, anoVigente, maxSprints]);

  return (
    <Card className={fill ? 'h-full flex flex-col' : undefined}>
      {/* Barras "crescem" da base ao montar (e a cada rotação do TV, que remonta o card). */}
      <style>{`
        @keyframes fabBarGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        .fab-bar { transform-box: fill-box; transform-origin: 50% 100%; animation: fabBarGrow .7s cubic-bezier(.22,1,.36,1) both; }
        @media (prefers-reduced-motion: reduce) { .fab-bar { animation: none; } }
      `}</style>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            Desempenho por Fábrica — ranking
            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" aria-label={RANKING_FORMULA}>
              <title>{RANKING_FORMULA}</title>
            </Info>
          </CardTitle>
          <div className="flex gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'hsl(0,72%,55%)' }} /> Bug</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'hsl(38,92%,50%)' }} /> Retorno QA</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className={fill ? 'flex-1 min-h-0 flex flex-col' : undefined}>
        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-8">Carregando fotografias de sprint…</p>
        ) : ranking.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">Sem fotografias de sprint para o ranking por fábrica.</p>
        ) : (
          <div className={`grid gap-3 ${fill ? 'flex-1 min-h-0' : ''}`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {ranking.map((f, idx) => {
              const color = fabricaColor(f.name, idx);
              const { GROUP_W, OUTER_W, INNER_W } = fill ? GEO_TV : GEO_PANEL;
              const vbW = Math.max(GROUP_W * f.cells.length, GROUP_W);
              return (
                <div key={f.name} className={`border rounded-lg p-3 ${fill ? 'flex flex-col min-h-0' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="inline-grid place-items-center w-6 h-6 rounded-full text-white font-mono font-bold text-xs shrink-0"
                      style={{ background: medalColor(idx) }}
                    >
                      {idx + 1}
                    </span>
                    <span className="font-semibold" style={{ color }}>{f.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      score <span className="font-mono font-semibold text-foreground">{f.score}</span>
                    </span>
                  </div>
                  <svg
                    viewBox={`0 0 ${vbW} 126`}
                    width="100%"
                    height={fill ? '100%' : svgHeight}
                    className={fill ? 'flex-1 min-h-0' : undefined}
                    preserveAspectRatio="xMidYMid meet"
                    role="img"
                    aria-label={`Desempenho aninhado de ${f.name}`}
                  >
                    <line x1="0" y1={CHART_BOTTOM} x2={vbW} y2={CHART_BOTTOM} stroke="hsl(var(--border))" />
                    {f.cells.map((c, i) => {
                      const cx = i * GROUP_W + GROUP_W / 2;
                      const outerX = cx - OUTER_W / 2;
                      const outerY = y(c.desempenho);
                      const delay = { animationDelay: `${i * 90}ms` };
                      return (
                        <g key={c.sprint + i}>
                          {/* Barra externa = Desempenho */}
                          <rect
                            className="fab-bar" style={delay}
                            x={outerX} y={outerY} width={OUTER_W} height={CHART_BOTTOM - outerY}
                            rx="3" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.5"
                          />
                          {/* Barras internas = Qualidade (Bug, Retorno QA) */}
                          <rect className="fab-bar" style={{ animationDelay: `${i * 90 + 120}ms` }} x={cx - INNER_W - 1} y={y(c.bug)} width={INNER_W} height={CHART_BOTTOM - y(c.bug)} fill="hsl(0,72%,55%)" />
                          <rect className="fab-bar" style={{ animationDelay: `${i * 90 + 120}ms` }} x={cx + 1} y={y(c.retorno)} width={INNER_W} height={CHART_BOTTOM - y(c.retorno)} fill="hsl(38,92%,50%)" />
                          {/* No TV, o número (grande) só na sprint atual — evita encavalar; as anteriores mostram a tendência pela altura. */}
                          {(!fill || i === f.cells.length - 1) && (
                            <text x={cx} y={outerY - 4} textAnchor="middle" fontSize={fill ? 22 : 11} fontFamily="monospace" fontWeight={fill ? 800 : 700} fill="hsl(var(--foreground))">{c.desempenho}</text>
                          )}
                          <text x={cx} y="120" textAnchor="middle" fontSize={fill ? 11 : 9} fill="hsl(var(--muted-foreground))">{c.sprint}</text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-2">
          Barra maior = Desempenho (% concluído do escopo). Barras finas dentro = Qualidade (Bug e Retorno QA, quanto menor melhor). Medalha cruza os dois. Últimas {maxSprints} sprints.
        </p>
      </CardContent>
    </Card>
  );
}
