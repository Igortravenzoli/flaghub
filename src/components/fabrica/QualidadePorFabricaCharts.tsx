import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSprintSnapshots, type SnapshotScopeBreakdown, type SprintSnapshotRow } from '@/hooks/useSprintSnapshots';
import { cleanFabricaName } from '@/lib/fabricaNames';
import { SQUADS } from '@/lib/fabricaRoster';
import { fabricaColor } from '@/lib/chartColors';
import { quarterLabel } from '@/lib/sprintCalendar';
import { concluidoDoEscopo } from '@/lib/fabricaTvSeries';

type GroupBy = 'sprint' | 'quarter';

type QualidadePorFabricaChartsProps = {
  maxSprints?: number;
  /** Altura de cada mini-gráfico (px). Menor no modo TV. */
  chartHeight?: number;
  /** Preenche a altura do card (modo TV) em vez de usar altura fixa. */
  fill?: boolean;
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

type RawSums = { encerrados: number; scope: number; bug: number; retorno: number };
const emptySums = (): RawSums => ({ encerrados: 0, scope: 0, bug: 0, retorno: 0 });
function addScope(acc: RawSums, scope: SnapshotScopeBreakdown): void {
  // Encerrados = done + entregue — MESMA régua do gerencial/ranking (26/07/2026).
  // Até 06/08/2026 somava só `done.total`, o que deixava as Entregas deste card
  // artificialmente baixas em relação ao ranking e à evolução por sprint.
  acc.encerrados += concluidoDoEscopo(scope);
  acc.scope += scope.total;
  acc.bug += scope.cats.bug;
  acc.retorno += scope.cats.retorno_qa;
}

/** Linha do detalhamento (popup): contribuição de UMA sprint para a coluna clicada. */
export type SprintDetalhe = { sprint: string; escopo: number; encerrados: number; bug: number; retorno: number };

type MetricKey = 'entrega' | 'bug' | 'retorno';

const METRICA_INFO: Record<MetricKey, { titulo: string; campo: 'encerrados' | 'bug' | 'retorno'; numerador: string }> = {
  entrega: { titulo: 'Entregas', campo: 'encerrados', numerador: 'itens encerrados (done + entregue)' },
  bug: { titulo: 'Bug', campo: 'bug', numerador: 'bugs no escopo' },
  retorno: { titulo: 'Retorno QA', campo: 'retorno', numerador: 'retornos de QA no escopo' },
};

type TooltipPayload = Array<{ payload: Record<string, string | number | undefined> }> | undefined;

export type CelulaFabricaMetricas = { entrega: number; bug: number; retorno: number };

/**
 * Fábricas de uma coluna (sprint/quarter) ordenadas por "melhor primeiro":
 * Entregas do maior para o menor; Bug e Retorno QA do menor para o maior.
 * Fábrica sem escopo na coluna fica de fora — como 0% ela apareceria em
 * primeiro lugar em Bug/Retorno QA, invertendo a leitura.
 */
export function ordenaColuna(
  cells: Record<string, CelulaFabricaMetricas>,
  fabricas: string[],
  metric: keyof CelulaFabricaMetricas,
  maiorPrimeiro: boolean,
): Array<{ f: string; v: number }> {
  return fabricas
    .filter((f) => cells[f] !== undefined)
    .map((f) => ({ f, v: cells[f][metric] }))
    .sort((a, b) => (maiorPrimeiro ? b.v - a.v : a.v - b.v));
}

/**
 * Como as barras trocam de posição a cada coluna, o tooltip padrão (que fala em
 * "v0/v1/v2") não serve: aqui ele lista as fábricas da coluna na ordem em que
 * aparecem, com nome e cor.
 */
function TooltipQualidade({ active, label, payload, cor }: {
  active?: boolean;
  label?: string;
  payload: TooltipPayload;
  cor: (fabrica: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const itens: Array<{ fabrica: string; valor: number }> = [];
  for (let i = 0; i < SQUADS.length; i++) {
    const fabrica = row[`f${i}`];
    const valor = row[`v${i}`];
    if (typeof fabrica !== 'string' || !fabrica || typeof valor !== 'number') continue;
    itens.push({ fabrica, valor });
  }
  if (itens.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-semibold mb-1">{label}</p>
      {itens.map((it, i) => (
        <p key={it.fabrica} className="flex items-center gap-1.5 leading-relaxed">
          <span className="text-muted-foreground w-3">{i + 1}º</span>
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: cor(it.fabrica) }} />
          <span className="flex-1">{it.fabrica}</span>
          <span className="font-mono font-semibold tabular-nums ml-2">{it.valor}%</span>
        </p>
      ))}
    </div>
  );
}

export type ColunaQualidade = { label: string; cells: Record<string, CelulaFabricaMetricas> };

/**
 * Agregação pura das fotografias em colunas (sprint ou quarter) — exportada para
 * os testes exercitarem a regra sem Supabase (mesmo padrão de fabricaTvSeries).
 *
 * Regras que os testes cravam (validação pedida pelo gestor, 06/08/2026):
 *  - Entregas = encerrados (done + entregue) ÷ escopo;
 *  - sprint entra no quarter pelo mês em que TERMINA;
 *  - no quarter soma-se tudo ANTES de dividir (não é média das sprints);
 *  - quarter agrega o ano inteiro; por sprint, últimas N;
 *  - `detalhes` guarda a composição por sprint de cada barra (popup).
 */
export function montaColunasQualidade(
  snapshots: Record<string, SprintSnapshotRow>,
  opts: { groupBy: GroupBy; maxSprints: number; anoVigente: number },
): { columns: ColunaQualidade[]; fabricasOrdenadas: string[]; detalhes: Record<string, SprintDetalhe[]> } {
  const { groupBy, maxSprints, anoVigente } = opts;
  const reAno = new RegExp(`^S\\d+-${anoVigente}$`);
  const todas = Object.values(snapshots)
    .filter((s) => reAno.test(s.sprint_code) && s.category_breakdown)
    .sort((a, b) => sprintNum(a.sprint_code) - sprintNum(b.sprint_code));
  // No quarter, agrega o ANO INTEIRO (várias colunas Q); por sprint, últimas N.
  const rows = groupBy === 'quarter' ? todas : todas.slice(-maxSprints);

  const colOrder: string[] = [];
  const raw = new Map<string, Map<string, RawSums>>();
  const agg: Record<string, RawSums> = {};
  // Composição de cada barra (chave `coluna::fábrica`), para o popup de detalhe.
  const detalhes: Record<string, SprintDetalhe[]> = {};

  for (const s of rows) {
    const colKey = groupBy === 'quarter'
      ? (quarterLabel(s.sprint_code) ?? s.sprint_code.split('-')[0])
      : s.sprint_code.split('-')[0];
    if (!raw.has(colKey)) { raw.set(colKey, new Map()); colOrder.push(colKey); }
    const colMap = raw.get(colKey)!;
    for (const [name, scope] of Object.entries(normalizedFabricas(s))) {
      // Só as squads reais — "Sem fábrica"/"DESIGN"/"FLG" viravam séries extras
      // e deixavam as barras ilegíveis (7 séries em vez de 4).
      if (!SQUADS.includes(name)) continue;
      const c = colMap.get(name) ?? emptySums();
      addScope(c, scope);
      colMap.set(name, c);
      const a = (agg[name] ??= emptySums());
      addScope(a, scope);
      (detalhes[`${colKey}::${name}`] ??= []).push({
        sprint: s.sprint_code.split('-')[0],
        escopo: scope.total,
        encerrados: concluidoDoEscopo(scope),
        bug: scope.cats.bug,
        retorno: scope.cats.retorno_qa,
      });
    }
  }

  const columns = colOrder.map((key) => {
    const colMap = raw.get(key)!;
    const cells: Record<string, CelulaFabricaMetricas> = {};
    for (const [name, c] of colMap) {
      cells[name] = { entrega: pct(c.encerrados, c.scope), bug: pct(c.bug, c.scope), retorno: pct(c.retorno, c.scope) };
    }
    return { label: key, cells };
  });

  // Score = Desempenho − (½·Bug + ½·RetornoQA); maior primeiro (melhor → pior).
  const fabricasOrdenadas = Object.entries(agg)
    .filter(([, a]) => a.scope > 0)
    .map(([name, a]) => ({ name, score: pct(a.encerrados, a.scope) - 0.5 * pct(a.bug, a.scope) - 0.5 * pct(a.retorno, a.scope) }))
    .sort((x, y) => y.score - x.score)
    .map((x) => x.name);

  return { columns, fabricasOrdenadas, detalhes };
}

/**
 * "Qualidade das Fábricas" (slides 1 e 3): Entregas, Bug e Retorno QA por sprint,
 * uma barra por fábrica. Alternância Sprint ⇄ Quarter — no acumulado por quarter
 * os totais das sprints são somados ANTES de dividir (não é média de sprints), e
 * a sprint entra no quarter pelo mês em que TERMINA. Quarter é a visão default
 * no painel (pedido do gestor, 06/08/2026); no TV fica por sprint.
 * Entregas = encerrados (done + entregue) ÷ escopo — mesma régua do gerencial.
 * Clicar numa barra abre o detalhamento: quais sprints compõem a coluna e as
 * contagens por trás do percentual.
 * Fábricas ordenadas da melhor para a pior cruzando Desempenho × Qualidade.
 * Fonte = fotografias de fim de sprint (a sprint em curso não entra).
 */
export function QualidadePorFabricaCharts({ maxSprints = 6, chartHeight = 190, fill = false }: QualidadePorFabricaChartsProps) {
  const { data: snapshots = {}, isLoading } = useSprintSnapshots();
  const [groupBy, setGroupBy] = useState<GroupBy>(fill ? 'sprint' : 'quarter');
  const [detalhe, setDetalhe] = useState<{ coluna: string; fabrica: string; metrica: MetricKey } | null>(null);
  const anoVigente = new Date().getFullYear();

  const { columns, fabricasOrdenadas, detalhes } = useMemo(
    () => montaColunasQualidade(snapshots, { groupBy, maxSprints, anoVigente }),
    [snapshots, anoVigente, maxSprints, groupBy],
  );

  // Linhas e totais do popup de composição (recalculados só quando abre/muda).
  const detalheRows = detalhe ? (detalhes[`${detalhe.coluna}::${detalhe.fabrica}`] ?? []) : [];
  const detalheTot = detalheRows.reduce(
    (acc, r) => ({
      escopo: acc.escopo + r.escopo,
      encerrados: acc.encerrados + r.encerrados,
      bug: acc.bug + r.bug,
      retorno: acc.retorno + r.retorno,
    }),
    { escopo: 0, encerrados: 0, bug: 0, retorno: 0 },
  );

  /** Cor fixa por fábrica (a mesma da legenda), independente da posição da barra. */
  const corDaFabrica = useMemo(() => {
    const mapa = new Map<string, string>();
    fabricasOrdenadas.forEach((f, i) => mapa.set(f, fabricaColor(f, i)));
    return (f: string) => mapa.get(f) ?? 'hsl(var(--muted-foreground))';
  }, [fabricasOrdenadas]);

  /**
   * Uma linha por coluna (sprint/quarter) com as fábricas em SLOTS posicionais
   * já ordenados pelo valor daquela coluna: `v0` é sempre a melhor barra do
   * grupo, `f0` a fábrica dela. É o que permite ordenar dentro de cada grupo —
   * com uma série fixa por fábrica, a ordem seria a mesma em todas as colunas.
   * Fábrica sem escopo na coluna fica de fora (slot vazio), em vez de virar uma
   * barra de 0% que apareceria como "melhor" em Bug/Retorno QA.
   */
  const dataFor = (metric: 'entrega' | 'bug' | 'retorno', maiorPrimeiro: boolean) =>
    columns.map((col) => {
      const itens = ordenaColuna(col.cells, fabricasOrdenadas, metric, maiorPrimeiro);
      const row: Record<string, number | string | undefined> = { label: col.label };
      for (let i = 0; i < SQUADS.length; i++) {
        row[`v${i}`] = itens[i]?.v;
        row[`f${i}`] = itens[i]?.f ?? '';
      }
      return row;
    });

  // maiorPrimeiro segue o "melhor primeiro": entrega ↑ é bom, bug/retorno ↓ é bom.
  const charts: Array<{ key: 'entrega' | 'bug' | 'retorno'; title: string; hint: string; maiorPrimeiro: boolean }> = [
    { key: 'entrega', title: 'Entregas', hint: '↑ melhor', maiorPrimeiro: true },
    { key: 'bug', title: 'Bug', hint: '↓ melhor', maiorPrimeiro: false },
    { key: 'retorno', title: 'Retorno QA', hint: '↓ melhor', maiorPrimeiro: false },
  ];

  return (
    <Card className={fill ? 'h-full flex flex-col' : undefined}>
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
            {/* No TV (fill) ninguém clica — esconde o toggle e mantém a visão por sprint. */}
            {!fill && (
              <div className="flex gap-1">
                <Button variant={groupBy === 'sprint' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setGroupBy('sprint')}>Sprint</Button>
                <Button variant={groupBy === 'quarter' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setGroupBy('quarter')}>Quarter</Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className={fill ? 'flex-1 min-h-0 flex flex-col' : undefined}>
        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-8">Carregando fotografias de sprint…</p>
        ) : columns.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">Sem fotografias de sprint para comparação por fábrica.</p>
        ) : (
          <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${fill ? 'flex-1 min-h-0' : ''}`}>
            {charts.map((c) => {
              const dados = dataFor(c.key, c.maiorPrimeiro);
              return (
                <div key={c.key} className={fill ? 'flex flex-col min-h-0' : undefined}>
                  <p className="text-xs font-medium mb-1">
                    {c.title} <span className="text-muted-foreground font-normal">· {c.hint}</span>
                  </p>
                  <div className={fill ? 'flex-1 min-h-0' : undefined} style={fill ? undefined : { height: chartHeight }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dados} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} unit="%" />
                        <RechartsTooltip
                          cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                          content={(props) => (
                            <TooltipQualidade
                              active={props.active}
                              label={props.label as string}
                              payload={props.payload as TooltipPayload}
                              cor={corDaFabrica}
                            />
                          )}
                        />
                        {Array.from({ length: SQUADS.length }, (_, slot) => (
                          <Bar
                            key={slot}
                            dataKey={`v${slot}`}
                            maxBarSize={12}
                            radius={[2, 2, 0, 0]}
                            className="cursor-pointer"
                            onClick={(entry: unknown) => {
                              // O onClick do Bar entrega os props da barra; a linha original fica em `payload`.
                              const p = (entry && typeof entry === 'object' && 'payload' in entry
                                ? (entry as { payload: Record<string, unknown> }).payload
                                : entry) as Record<string, unknown> | undefined;
                              const fabrica = typeof p?.[`f${slot}`] === 'string' ? (p[`f${slot}`] as string) : '';
                              const coluna = typeof p?.label === 'string' ? (p.label as string) : '';
                              if (fabrica && coluna) setDetalhe({ coluna, fabrica, metrica: c.key });
                            }}
                          >
                            {dados.map((row, ri) => (
                              <Cell key={ri} fill={corDaFabrica(String(row[`f${slot}`] ?? ''))} />
                            ))}
                          </Bar>
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-2">
          % sobre o escopo de cada fábrica{groupBy === 'quarter' ? ' no quarter (soma das sprints do trimestre)' : ' na sprint'}.
          Entregas = <b>encerrados (done + entregue) ÷ escopo</b>, mesma régua do gerencial.
          Em cada {groupBy === 'quarter' ? 'quarter' : 'sprint'} a <b>primeira barra é a melhor</b>:
          Entregas do maior para o menor; Bug e Retorno QA do menor para o maior.
          A legenda segue a ordem do ranking Desempenho × Qualidade.
          {groupBy === 'quarter' && ' Sprint entra no quarter pelo mês em que termina.'}
          {!fill && <b> Clique numa barra para ver a composição do número.</b>}
        </p>

        {/* Popup de composição — o que está por trás da barra clicada (06/08/2026). */}
        <Dialog open={detalhe !== null} onOpenChange={(v) => !v && setDetalhe(null)}>
          <DialogContent className="sm:max-w-[560px]">
            {detalhe && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-sm flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: corDaFabrica(detalhe.fabrica) }} />
                    {detalhe.fabrica} · {detalhe.coluna} — {METRICA_INFO[detalhe.metrica].titulo}
                  </DialogTitle>
                </DialogHeader>
                <div className="max-h-[55vh] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Sprint</TableHead>
                        <TableHead className="text-xs text-right">Escopo</TableHead>
                        <TableHead className={`text-xs text-right ${detalhe.metrica === 'entrega' ? 'text-foreground font-semibold' : ''}`}>Encerrados</TableHead>
                        <TableHead className={`text-xs text-right ${detalhe.metrica === 'bug' ? 'text-foreground font-semibold' : ''}`}>Bug</TableHead>
                        <TableHead className={`text-xs text-right ${detalhe.metrica === 'retorno' ? 'text-foreground font-semibold' : ''}`}>Retorno QA</TableHead>
                        <TableHead className="text-xs text-right">% {METRICA_INFO[detalhe.metrica].titulo}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalheRows.map((r) => (
                        <TableRow key={r.sprint}>
                          <TableCell className="text-xs font-medium">{r.sprint}</TableCell>
                          <TableCell className="text-xs text-right font-mono tabular-nums">{r.escopo}</TableCell>
                          <TableCell className={`text-xs text-right font-mono tabular-nums ${detalhe.metrica === 'entrega' ? 'font-semibold' : 'text-muted-foreground'}`}>{r.encerrados}</TableCell>
                          <TableCell className={`text-xs text-right font-mono tabular-nums ${detalhe.metrica === 'bug' ? 'font-semibold' : 'text-muted-foreground'}`}>{r.bug}</TableCell>
                          <TableCell className={`text-xs text-right font-mono tabular-nums ${detalhe.metrica === 'retorno' ? 'font-semibold' : 'text-muted-foreground'}`}>{r.retorno}</TableCell>
                          <TableCell className="text-xs text-right font-mono tabular-nums">{pct(r[METRICA_INFO[detalhe.metrica].campo], r.escopo)}%</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2">
                        <TableCell className="text-xs font-semibold">Total {detalhe.coluna}</TableCell>
                        <TableCell className="text-xs text-right font-mono tabular-nums font-semibold">{detalheTot.escopo}</TableCell>
                        <TableCell className="text-xs text-right font-mono tabular-nums font-semibold">{detalheTot.encerrados}</TableCell>
                        <TableCell className="text-xs text-right font-mono tabular-nums font-semibold">{detalheTot.bug}</TableCell>
                        <TableCell className="text-xs text-right font-mono tabular-nums font-semibold">{detalheTot.retorno}</TableCell>
                        <TableCell className="text-xs text-right font-mono tabular-nums font-semibold">
                          {pct(detalheTot[METRICA_INFO[detalhe.metrica].campo], detalheTot.escopo)}%
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                <p className="border-t pt-2 text-[11px] text-muted-foreground">
                  {METRICA_INFO[detalhe.metrica].titulo} de {detalhe.coluna} = {detalheTot[METRICA_INFO[detalhe.metrica].campo]} {METRICA_INFO[detalhe.metrica].numerador} ÷ {detalheTot.escopo} itens
                  de escopo = <b>{pct(detalheTot[METRICA_INFO[detalhe.metrica].campo], detalheTot.escopo)}%</b>.
                  {detalhe.coluna.startsWith('Q') && ' A soma é feita ANTES de dividir (não é média das sprints); a sprint entra no quarter pelo mês em que termina.'}
                  {' '}Fonte: fotografias seladas de fim de sprint — a sprint em curso não entra.
                </p>
              </>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
