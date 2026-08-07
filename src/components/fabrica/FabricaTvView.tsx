import { useMemo, type ReactNode } from 'react';
import { format } from 'date-fns';
import { usePaginaKiosk } from '@/contexts/KioskRotationContext';
import { Card } from '@/components/ui/card';
import { QualidadePorFabricaCharts } from '@/components/fabrica/QualidadePorFabricaCharts';
import { DailyProgressCard } from '@/components/fabrica/DailyProgressCard';
import { UsoCruzadoCard } from '@/components/fabrica/UsoCruzadoCard';
import { DesempenhoTrendChart, COR_SERIE } from '@/components/fabrica/DesempenhoTrendChart';
import { RankingFabricasCard } from '@/components/fabrica/RankingFabricasCard';
import { pctDe, type ItemLive } from '@/lib/fabricaTvSeries';
import { classificaDemanda, contaCategorias, ehPriorizado } from '@/lib/fabricaClassificacao';
import { ehEstadoDone } from '@/lib/fabricaEstados';
import { calcRitmoSprint, corEntrega } from '@/lib/fabricaMetas';

/**
 * Blocos densos demais para uma tela só — numa página única nada fica legível
 * a distância. Alternando 2 páginas, cada bloco ganha ~2x a altura e nada sai
 * do telão. O ritmo da troca vem do kiosk (sequência única), não daqui.
 */
const PAGES = 2;

/**
 * TV-2 — no telão só as 3 últimas sprints (qualidade por fábrica na página 2
 * e mini-gráficos do ranking na página 1). A distância, 6 sprints × 4 fábricas
 * viram um emaranhado ilegível. A aba Executiva (uso de perto, com scroll)
 * mantém a janela maior — por isso o valor é passado aqui, não no default do
 * componente.
 */
const TV_MAX_SPRINTS = 3;

/**
 * A linha de evolução GERAL aguenta mais pontos que os gráficos por fábrica:
 * é um gráfico só, em toda a largura do canvas — mesma janela que a aba
 * Executiva já usa (aprovado no mock de 07/08/2026 pelo teste do zoom-out).
 */
const TREND_MAX_SPRINTS = 8;

// Paleta de status dos cards do topo — mesma semântica das telas de mesa
// (GerenciaTab/KpiCard): cor só para status, nunca decoração.
const COR_VERDE = 'hsl(142,71%,42%)';
const COR_ENTREGUE = 'hsl(210,80%,52%)';
const COR_EM_DEV = 'hsl(28,90%,52%)';
const COR_AMBAR = 'hsl(38,92%,50%)';
const COR_VERMELHO = 'hsl(0,72%,52%)';
const COR_PRIORIZADO = 'hsl(211,76%,56%)';
const COR_TRANSBORDO = 'hsl(247,68%,72%)';
const COR_AVIAO = 'hsl(199,89%,48%)';

// `items` e `fabricaByItemId` saíram do contrato em 07/08/2026: eram insumos da
// matriz fábrica × sprint, que deixou a página 1 — declará-los sugeriria ao
// chamador que a TV ainda precisa deles.
type FabKpisTv = {
  total: number;
  done: number;
  inProgress: number; // inclui "entregue"
  entregue: number;
  toDo: number;
  isLoading: boolean;
  /** Itens da régua do gestor (sem Tasks duplicadas) — base dos cards Priorizado/Não Priorizado. */
  kpiItems?: ItemLive[];
  horasPorFabricaFull?: Array<{ key: string; collaborators: { name: string; minutes: number }[] }>;
};

type FabricaTvViewProps = {
  fab: FabKpisTv;
  sprintCode?: string | null;
  periodLabel?: string;
  dateFrom?: Date | null;
  dateTo?: Date | null;
};

/**
 * Modo TV da Fábrica — 2 páginas que se alternam sozinhas:
 *   1) Visão Geral da sprint: Itens no escopo + Priorizado × Não Priorizado,
 *      evolução por sprint e ranking por fábrica — a MESMA língua das telas
 *      de mesa (Visão Geral / aba Executiva), sem divergência TV × desktop.
 *   2) Qualidade & capacidade: faixa de KPIs + qualidade por sprint + evolução
 *      diária + uso cruzado.
 *
 * Página 1 refeita em 07/08/2026 (mock MOCK_TV_FABRICA_P1_VISAOGERAL_07-08).
 * O que saiu e por quê: a faixa de KPIs (os 3 cards do topo JÁ SÃO o resumo da
 * sprint — ritmo e data de sela migraram para o rodapé do card de escopo), os
 * painéis de meta (as metas viraram linhas tracejadas no gráfico único de
 * evolução) e a matriz fábrica × sprint (o ranking da aba Executiva recupera o
 * histórico com medalha + score + linhas por fábrica). A faixa continua na
 * página 2, intacta — lá os blocos não repetem os números dela.
 *
 * Histórico: página 1 anterior era de 26/07/2026 (mock MOCK_TV_FABRICA_EXEC_26-07,
 * painéis de meta + matriz). Concluído = done + entregue em toda a tela (régua
 * do gerencial) segue valendo.
 */
export function FabricaTvView({ fab, sprintCode, periodLabel, dateFrom, dateTo }: FabricaTvViewProps) {
  /**
   * TV-1 — a página vem da sequência única do kiosk. Esta view não tem mais
   * relógio próprio: antes eram 25s fixos, invisíveis para a barra superior,
   * que continuavam girando mesmo com a rotação desligada.
   * Fora do modo TV (sem provider) fica parada na página 1.
   */
  const page = usePaginaKiosk(PAGES);

  /**
   * Classificação pela régua canônica e sobre `kpiItems` — o MESMO conjunto do
   * número grande "Itens no escopo". É a mesma base do `allManagerItems` da
   * Visão Geral (GerenciaTab), então os cards Priorizado / Não Priorizado
   * batem número a número com a tela de mesa.
   */
  const cats = useMemo(() => contaCategorias(fab.kpiItems ?? []), [fab.kpiItems]);
  const categoria = { bug: cats.bug, retorno: cats.retornoQa, aviao: cats.aviaoSprint + cats.aviaoTransbordado };

  /**
   * Sub-régua do Priorizado — copiada da Visão Geral (liveMetrics do
   * GerenciaTab): "Entregue/Done" conta SOMENTE done (done/closed/resolved);
   * o priorizado ENTREGUE (em teste/deploy/homologação) fica em "Em dev",
   * apesar do rótulo. A inconsistência é preservada de propósito — o telão tem
   * que bater com a Visão Geral e com a foto selada, e é assim que elas contam.
   */
  const priorizadoPorEstado = useMemo(() => {
    let done = 0;
    let emDev = 0;
    for (const item of fab.kpiItems ?? []) {
      if (!ehPriorizado(classificaDemanda(item))) continue;
      if (ehEstadoDone(item.state)) done += 1;
      else emDev += 1;
    }
    return { done, emDev };
  }, [fab.kpiItems]);

  // Concluído = Done + Entregue (regra do gestor). "em dev" exclui os entregues.
  const concluido = fab.done + fab.entregue;
  const emDev = Math.max(0, fab.inProgress - fab.entregue);
  const faltam = Math.max(0, fab.total - concluido);
  const sprintLabel = (sprintCode ?? '').split('-')[0] || null;

  const ritmo = useMemo(() => {
    if (!dateFrom || !dateTo) return null;
    return calcRitmoSprint({ total: fab.total, encerrados: concluido, from: dateFrom, to: dateTo });
  }, [dateFrom, dateTo, fab.total, concluido]);

  const pctConcluido = pctDe(concluido, fab.total);
  const emAtraso = ritmo != null && pctConcluido < ritmo.esperadoPct;

  /**
   * Semáforo do % concluído em sprint EM CURSO: régua contra o esperado do dia
   * (esperadoPct), não contra a meta absoluta — contra 88% qualquer começo de
   * sprint seria vermelho mesmo em dia. Sem datas (ritmo nulo), cai na régua
   * absoluta da meta.
   */
  const corConcluido = ritmo
    ? (pctConcluido >= ritmo.esperadoPct
      ? COR_VERDE
      : pctConcluido >= ritmo.esperadoPct - 10 ? COR_AMBAR : COR_VERMELHO)
    : corEntrega(pctConcluido);

  return (
    <div className="w-full h-full flex flex-col gap-2.5 overflow-hidden">
      {page === 0 ? (
        <>
          {/* ─── Página 1 — Visão Geral da sprint ─── */}
          <div className="flex-none grid gap-2.5" style={{ gridTemplateColumns: '1.25fr 1fr 1.3fr' }}>
            {/* Itens no escopo — anatomia do card da Visão Executiva. Ritmo e
                data de sela, que moravam na faixa antiga, vivem no rodapé para
                o alerta "dá ou não dá" não sair da parede. */}
            <Card className="px-4 py-2.5 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <p className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground leading-none">Itens no escopo</p>
                {(sprintLabel || periodLabel) && (
                  <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-primary/15 text-primary border border-primary/30 leading-none">
                    {sprintLabel ?? periodLabel}
                    {ritmo && ` · dia ${ritmo.diasDecorridos} de ${ritmo.diasUteis}`}
                  </span>
                )}
              </div>
              <div className="flex items-end justify-between gap-3">
                <p className="text-[40px] font-black font-mono leading-none">
                  {fab.isLoading ? '—' : fab.total}
                  <span className="text-[13px] font-semibold text-muted-foreground ml-2 font-sans">itens na sprint</span>
                </p>
                <div className="text-right">
                  <p className="text-[30px] font-black font-mono leading-none" style={{ color: corConcluido }}>
                    {fab.isLoading ? '—' : `${Math.round(pctConcluido)}%`}
                  </p>
                  <p className="text-[10.5px] text-muted-foreground mt-0.5">concluído · Done + Entregue</p>
                </div>
              </div>
              {/* Barra segmentada done → entregue → em dev; o resto (a fazer)
                  fica no fundo escuro. Cores idênticas às dos minis abaixo —
                  os minis são a legenda da barra. */}
              <div className="flex flex-none h-[9px] rounded-[5px] overflow-hidden bg-black/35">
                <span style={{ width: `${pctDe(fab.done, fab.total)}%`, background: COR_VERDE }} />
                <span style={{ width: `${pctDe(fab.entregue, fab.total)}%`, background: COR_ENTREGUE }} />
                <span style={{ width: `${pctDe(emDev, fab.total)}%`, background: COR_EM_DEV }} />
              </div>
              <div className="grid grid-cols-4 gap-1.5 border-t border-border pt-1.5 text-center">
                <Mini valor={fab.isLoading ? '—' : emDev} rotulo="em dev" cor={COR_EM_DEV} />
                <Mini valor={fab.isLoading ? '—' : fab.toDo} rotulo="a fazer" cor={COR_AMBAR} />
                <Mini valor={fab.isLoading ? '—' : fab.entregue} rotulo="entregue" cor={COR_ENTREGUE} />
                <Mini valor={fab.isLoading ? '—' : fab.done} rotulo="done" cor={COR_VERDE} />
              </div>
              <p className="text-[11.5px] text-muted-foreground mt-auto">
                {dateTo && <>sela <b className="font-mono text-foreground/80">{format(dateTo, 'dd/MM')}</b> · </>}
                ritmo atual{' '}
                <b className="font-mono" style={{ color: emAtraso ? COR_VERMELHO : COR_VERDE }}>
                  {ritmo ? fmt1(ritmo.ritmoAtual) : '—'}
                </b>{' '}
                itens/dia · necessário p/ meta{' '}
                <b className="font-mono text-foreground/80">{ritmo ? fmt1(ritmo.ritmoNecessario) : '—'}</b>/dia
              </p>
            </Card>

            {/* Priorizado — mesmo KpiCard da Visão Geral: % dos sub-itens sobre
                o próprio bloco (28), valor grande sobre o escopo. */}
            <Card className="px-4 py-2.5 flex flex-col gap-1.5">
              <p className="text-[11.5px] font-bold uppercase tracking-wider leading-none" style={{ color: COR_PRIORIZADO }}>Priorizado</p>
              <p className="text-[40px] font-black font-mono leading-none" style={{ color: COR_PRIORIZADO }}>
                {fab.isLoading ? '—' : cats.priorizado}
                <span className="text-[17px] font-bold text-muted-foreground ml-2">| {pctTexto(cats.priorizado, fab.total)}</span>
              </p>
              <div className="border-t border-border pt-1.5 flex flex-col gap-1 mt-auto">
                <SubKpi valor={priorizadoPorEstado.done} base={cats.priorizado} rotulo="Entregue/Done" cor={COR_VERDE} />
                <SubKpi valor={priorizadoPorEstado.emDev} base={cats.priorizado} rotulo="Em dev" cor={COR_EM_DEV} />
                <SubKpi valor={cats.priorizadoTransbordo} base={cats.priorizado} rotulo="Transbordo" cor={COR_TRANSBORDO} />
              </div>
            </Card>

            {/* Não Priorizado — % dos sub-itens sobre o ESCOPO (régua do guia de
                indicadores) + share do bloco em tom fraco, como na Visão Geral.
                "Avião" soma os dois sub-itens de lá (sprint + transbordado). */}
            <Card className="px-4 py-2.5 flex flex-col gap-1.5">
              <p className="text-[11.5px] font-bold uppercase tracking-wider leading-none" style={{ color: COR_VERMELHO }}>Não Priorizado</p>
              <p className="text-[40px] font-black font-mono leading-none" style={{ color: COR_VERMELHO }}>
                {fab.isLoading ? '—' : cats.naoPriorizado}
                <span className="text-[17px] font-bold text-muted-foreground ml-2">| {pctTexto(cats.naoPriorizado, fab.total)}</span>
              </p>
              <div className="border-t border-border pt-1.5 flex flex-col gap-1 mt-auto">
                <SubKpi valor={cats.bug} base={fab.total} bloco={cats.naoPriorizado} rotulo="Bug" cor={COR_VERMELHO} />
                <SubKpi valor={cats.retornoQa} base={fab.total} bloco={cats.naoPriorizado} rotulo="Retorno QA" cor={COR_AMBAR} />
                <SubKpi valor={categoria.aviao} base={fab.total} bloco={cats.naoPriorizado} rotulo="Avião" cor={COR_AVIAO} />
              </div>
            </Card>
          </div>

          {/* Evolução geral por sprint — mesma janela da aba Executiva; as metas
              dos painéis antigos viram linhas tracejadas para a régua não sumir
              da parede. Legenda própria no cabeçalho (a interna sai). */}
          <Card className="flex-1 min-h-0 px-4 py-2.5 flex flex-col gap-1">
            <div className="flex-none flex items-center gap-2">
              <p className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground leading-none">Desempenho · evolução por sprint</p>
              <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
                <Legenda cor={COR_SERIE['Entrega']} rotulo="Entrega ↑" />
                <Legenda cor={COR_SERIE['Bug']} rotulo="Bug ↓" />
                <Legenda cor={COR_SERIE['Retorno QA']} rotulo="Retorno QA ↓" />
                <span>fotos seladas · {sprintLabel ?? 'sprint'} em curso sem ponto</span>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <DesempenhoTrendChart maxSprints={TREND_MAX_SPRINTS} height="100%" showLegend={false} showMetas />
            </div>
          </Card>

          {/* Ranking na MESMA visão da aba Executiva (fill=false): medalha +
              score + linhas por fábrica, tudo numa linha (columns=4). TV-2 vale
              aqui também: 3 sprints por gráfico, senão vira emaranhado a
              distância. ATENÇÃO: maxSprints também é a janela do SCORE — o
              pódio do telão (3 sprints) pode divergir do da mesa (6). Decisão
              do mock aprovado; o rodapé do card declara a janela. chartHeight
              ="100%" estica os mini-gráficos sem mexer no uso de mesa (px fixos). */}
          <div className="flex-[1.08] min-h-0">
            <RankingFabricasCard columns={4} maxSprints={TV_MAX_SPRINTS} chartHeight="100%" />
          </div>
        </>
      ) : (
        <>
          {/* ─── Página 2 — Qualidade & capacidade ─── */}
          {/* Faixa de KPIs — só nesta página desde 07/08/2026 (na página 1 os
              cards do topo já são o resumo da sprint). Conteúdo intacto. */}
          <div className="flex-none grid gap-2.5" style={{ gridTemplateColumns: '196px repeat(3, 1fr) 1.5fr' }}>
            <Card className="px-3.5 py-2 flex flex-col justify-center bg-gradient-to-br from-primary/10 to-transparent">
              <p className="text-[24px] font-black leading-none tracking-tight">{sprintLabel ?? periodLabel ?? 'Sprint'}</p>
              <p className="text-[11.5px] text-muted-foreground mt-1">
                {ritmo ? `dia ${ritmo.diasDecorridos} de ${ritmo.diasUteis}` : (periodLabel ?? '')}
                {dateTo && ` · sela ${format(dateTo, 'dd/MM')}`}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5">
                {Array.from({ length: PAGES }, (_, i) => (
                  <span
                    key={i}
                    className="block rounded-full transition-all"
                    style={{
                      width: i === page ? 18 : 6,
                      height: 6,
                      background: i === page ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                      opacity: i === page ? 1 : 0.35,
                    }}
                  />
                ))}
              </div>
            </Card>

            <Heroi rotulo="Escopo" valor={fab.isLoading ? '—' : fab.total} rodape="itens na sprint" />
            <Heroi
              rotulo="Encerrados"
              valor={fab.isLoading ? '—' : concluido}
              cor="hsl(142,71%,42%)"
              rodape={`${fab.done} done · ${fab.entregue} entregue`}
            />
            <Heroi
              rotulo="Faltam"
              valor={fab.isLoading ? '—' : faltam}
              cor="hsl(28,90%,52%)"
              rodape={`${emDev} em dev · ${fab.toDo} a fazer`}
            />

            <Card className="px-3 py-2 grid grid-cols-5 items-center bg-card/60">
              <Apoio valor={categoria.bug} rotulo="bugs" cor="hsl(0,72%,52%)" />
              <Apoio valor={categoria.retorno} rotulo="retorno QA" cor="hsl(38,92%,50%)" />
              <Apoio valor={categoria.aviao} rotulo="aviões" cor="hsl(199,89%,48%)" />
              <Apoio
                valor={ritmo ? fmt1(ritmo.ritmoNecessario) : '—'}
                rotulo="itens/dia p/ meta"
              />
              <Apoio
                valor={ritmo ? fmt1(ritmo.ritmoAtual) : '—'}
                rotulo="ritmo atual"
                cor={emAtraso ? 'hsl(0,72%,52%)' : 'hsl(142,71%,42%)'}
              />
            </Card>
          </div>

          <div className="flex-1 min-h-0">
            <QualidadePorFabricaCharts maxSprints={TV_MAX_SPRINTS} fill />
          </div>

          <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-0">
            <div className="col-span-7 h-full min-h-0">
              <DailyProgressCard sprintCode={sprintCode} fill />
            </div>
            <div className="col-span-5 h-full min-h-0">
              <UsoCruzadoCard fabricaRows={fab.horasPorFabricaFull ?? []} dateFrom={dateFrom} dateTo={dateTo} compact fill />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function fmt1(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/** Mesmo formato do KpiCard da Visão Geral: 1 decimal, vírgula. */
function pctTexto(valor: number, base: number): string {
  if (base <= 0) return '0,0%';
  return `${((valor / base) * 100).toFixed(1).replace('.', ',')}%`;
}

/**
 * Sub-linha no formato do KpiCard da Visão Geral: "N | pct%" + rótulo. `bloco`
 * rende o share DENTRO do bloco em tom fraco, para ninguém somar o % do bloco
 * com o % do escopo e ver divergência onde só há denominador diferente.
 */
function SubKpi({ valor, base, rotulo, cor, bloco }: { valor: number; base: number; rotulo: string; cor?: string; bloco?: number }) {
  return (
    <div className="flex items-baseline gap-2 text-[13.5px] leading-tight">
      <span className="font-mono font-extrabold whitespace-nowrap" style={cor ? { color: cor } : undefined}>
        {valor} | {pctTexto(valor, base)}
      </span>
      <span className="text-muted-foreground">{rotulo}</span>
      {bloco != null && (
        <span className="ml-auto text-[11px] text-muted-foreground/60 font-mono tabular-nums whitespace-nowrap">
          {bloco > 0 ? Math.round((valor / bloco) * 100) : 0}% do bloco
        </span>
      )}
    </div>
  );
}

/** Mini-status do card de escopo: valor colorido + rótulo, tudo visível (regra de TV). */
function Mini({ valor, rotulo, cor }: { valor: ReactNode; rotulo: string; cor: string }) {
  return (
    <div>
      <p className="text-[19px] font-extrabold font-mono leading-none" style={{ color: cor }}>{valor}</p>
      <p className="text-[10.5px] text-muted-foreground mt-0.5 leading-tight">{rotulo}</p>
    </div>
  );
}

/** Chip de legenda sempre visível no cabeçalho do bloco (regra de TV: nada só em hover). */
function Legenda({ cor, rotulo }: { cor: string; rotulo: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: cor }} />
      {rotulo}
    </span>
  );
}

/** KPI-herói: um número por card, legível de longe (≈64px na tela do telão). */
function Heroi({ rotulo, valor, rodape, cor }: { rotulo: string; valor: ReactNode; rodape: string; cor?: string }) {
  return (
    <Card className="px-3.5 py-2 flex flex-col justify-center">
      <p className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground leading-none">{rotulo}</p>
      <p className="text-[44px] font-black leading-none font-mono mt-1" style={cor ? { color: cor } : undefined}>{valor}</p>
      {/* sem truncate: o rodapé carrega dado ("X done · Y entregue") e na TV
          nada essencial pode ser cortado — mesma regra do Heroi da CsTvView */}
      <p className="text-[11.5px] text-muted-foreground mt-1 leading-tight">{rodape}</p>
    </Card>
  );
}

/** KPI de apoio: contexto do herói, metade do tamanho. */
function Apoio({ valor, rotulo, cor }: { valor: ReactNode; rotulo: string; cor?: string }) {
  return (
    <div className="text-center px-1 border-l border-border first:border-l-0">
      <p className="text-[22px] font-extrabold leading-none font-mono" style={cor ? { color: cor } : undefined}>{valor}</p>
      <p className="text-[10.5px] text-muted-foreground mt-1 leading-tight">{rotulo}</p>
    </div>
  );
}
