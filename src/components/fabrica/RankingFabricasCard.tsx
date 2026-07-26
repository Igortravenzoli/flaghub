import { useMemo } from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSprintSnapshots, type SnapshotScopeBreakdown, type SprintSnapshotRow } from '@/hooks/useSprintSnapshots';
import { cleanFabricaName } from '@/lib/fabricaNames';
import { SQUADS } from '@/lib/fabricaRoster';
import { concluidoDoEscopo } from '@/lib/fabricaTvSeries';
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

const RANKING_FORMULA = 'Ranking = Desempenho − (½·Bug + ½·Retorno QA), somando todas as sprints do período. Desempenho = itens encerrados (done + entregue) ÷ escopo. Maior valor = melhor cruzamento de desempenho e qualidade.';

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

type SprintCell = {
  sprint: string;
  desempenho: number;
  bug: number;
  retorno: number;
  /** Contagem ABSOLUTA de PBIs encerrados — é o que dimensiona a caixinha no TV. */
  doneAbs: number;
};
type FabricaRank = { name: string; score: number; desempenho: number; cells: SprintCell[] };

/**
 * TV-3 — verde proporcional aos PBIs encerrados.
 * Fundo com alfa crescente (não lightness): sobre o tema escuro do kiosk o texto
 * continua legível em qualquer intensidade, sem precisar inverter a cor.
 */
function verdeProporcional(ratio: number): { fundo: string; borda: string } {
  const r = Math.max(0, Math.min(1, ratio));
  return {
    fundo: `hsl(152 62% 42% / ${(0.10 + r * 0.34).toFixed(3)})`,
    borda: `hsl(152 62% 45% / ${(0.35 + r * 0.45).toFixed(3)})`,
  };
}

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

/** Barra fina de qualidade, com rótulo e valor sempre visíveis (regra de TV: sem hover). */
function BarraQualidade({ rotulo, valor, cor }: { rotulo: string; valor: number; cor: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground w-[74px] shrink-0">{rotulo}</span>
      <span className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden min-w-0">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, valor))}%`, background: cor }}
        />
      </span>
      <span className="font-mono font-semibold w-10 text-right shrink-0">{valor}%</span>
    </div>
  );
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
        // Concluído = done + entregue (regra do gerencial, 26/07/2026): o item
        // em teste/aguardando deploy já saiu da mão do dev. Os dois conjuntos
        // são disjuntos na fotografia, então somar não conta duas vezes.
        const encerrados = concluidoDoEscopo(scope);
        agg.cells.push({
          sprint: sprintLabel,
          desempenho: pct(encerrados, scope.total),
          bug: pct(scope.cats.bug, scope.total),
          retorno: pct(scope.cats.retorno_qa, scope.total),
          doneAbs: encerrados,
        });
        agg.done += encerrados;
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

  /**
   * TV-3 — ranking DA SPRINT corrente, pela contagem absoluta de PBIs
   * encerrados (não pelo score do período). O tamanho e o verde saem da razão
   * com o 1º lugar.
   *
   * `flex` vai de 1 a 2: a maior caixinha fica no máximo 2× a menor. Sem esse
   * teto, uma fábrica com 1 PBI ao lado de outra com 20 ficaria estreita demais
   * para caber o nome — e o nome é o que identifica a caixinha.
   */
  const rankingTv = useMemo(() => {
    const ultimos = ranking
      .map((f) => {
        const c = f.cells[f.cells.length - 1];
        return c
          ? { name: f.name, doneAbs: c.doneAbs, bug: c.bug, retorno: c.retorno }
          : { name: f.name, doneAbs: 0, bug: 0, retorno: 0 };
      })
      .sort((a, b) => b.doneAbs - a.doneAbs);

    const maior = ultimos[0]?.doneAbs ?? 0;
    return ultimos.map((f) => {
      const ratio = maior > 0 ? f.doneAbs / maior : 0;
      return { ...f, ratio, flex: 1 + ratio };
    });
  }, [ranking]);

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
            {fill ? 'Desempenho por Fábrica — ranking da sprint' : 'Desempenho por Fábrica — ranking'}
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
        ) : fill ? (
          /* ── TV-3 · caixinha maior e mais verde = mais PBIs encerrados ──────
             No telão o gráfico aninhado de 3 sprints × 4 fábricas fica ilegível
             a distância. Aqui o ranking é da SPRINT corrente e a leitura é
             pré-atentiva: quem encerrou mais ocupa mais espaço e puxa mais
             verde. Qualidade continua presente, em linha compacta. */
          <div className="flex-1 min-h-0 flex items-stretch gap-3">
            {rankingTv.map((f, idx) => {
              const { fundo, borda } = verdeProporcional(f.ratio);
              return (
                <div
                  key={f.name}
                  className="rounded-xl border-2 p-4 flex flex-col justify-between min-w-0 transition-all"
                  style={{ flex: `${f.flex} 1 0%`, background: fundo, borderColor: borda }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-grid place-items-center w-7 h-7 rounded-full text-white font-mono font-bold text-sm shrink-0"
                      style={{ background: medalColor(idx) }}
                    >
                      {idx + 1}
                    </span>
                    {/* Nome nunca trunca: é o rótulo que identifica a caixinha */}
                    <span className="font-bold text-lg leading-tight whitespace-nowrap">{f.name}</span>
                  </div>

                  <div className="text-center py-1">
                    <p className="font-mono font-extrabold leading-none text-6xl">{f.doneAbs}</p>
                    <p className="text-xs text-muted-foreground mt-1.5">PBIs encerrados</p>
                  </div>

                  {/* Qualidade em linha única compacta (mantém Bug e Retorno QA) */}
                  <div className="space-y-1.5">
                    <BarraQualidade rotulo="Retorno QA" valor={f.retorno} cor="hsl(38,92%,50%)" />
                    <BarraQualidade rotulo="Bug" valor={f.bug} cor="hsl(0,72%,55%)" />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
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
          {fill
            ? 'Caixinha maior e mais verde = mais PBIs encerrados na sprint. Barras finas = Qualidade (Retorno QA e Bug, quanto menor melhor).'
            : `Barra maior = Desempenho (% concluído do escopo). Barras finas dentro = Qualidade (Bug e Retorno QA, quanto menor melhor). Medalha cruza os dois. Últimas ${maxSprints} sprints.`}
        </p>
      </CardContent>
    </Card>
  );
}
