import { useMemo, type ReactNode } from 'react';
import { format } from 'date-fns';
import { usePaginaKiosk } from '@/contexts/KioskRotationContext';
import { Card } from '@/components/ui/card';
import { EntregaSprintReguaCard } from '@/components/fabrica/EntregaSprintReguaCard';
import { MatrizFabricaSprintCard } from '@/components/fabrica/MatrizFabricaSprintCard';
import { QualidadePorFabricaCharts } from '@/components/fabrica/QualidadePorFabricaCharts';
import { DailyProgressCard } from '@/components/fabrica/DailyProgressCard';
import { UsoCruzadoCard } from '@/components/fabrica/UsoCruzadoCard';
import { isDone, isFabricaEntregue } from '@/hooks/useFabricaKpis';
import { SQUADS } from '@/lib/fabricaRoster';
import { agregaLivePorFabrica, pctDe, type ItemLive } from '@/lib/fabricaTvSeries';
import { calcRitmoSprint } from '@/lib/fabricaMetas';

/**
 * São 6 blocos densos — numa tela só nenhum fica legível a distância.
 * Alternando 2 páginas, cada bloco ganha ~2x a altura e nada sai do telão.
 * O ritmo da troca vem do kiosk (sequência única), não daqui.
 */
const PAGES = 2;

/**
 * TV-2 — no telão só as 3 últimas sprints.
 * A distância, 8 pontos na tendência e 6 sprints × 4 fábricas na qualidade
 * viram um emaranhado ilegível. A aba Executiva (uso de perto, com scroll)
 * mantém a janela maior — por isso o valor é passado aqui, não no default do
 * componente.
 */
const TV_MAX_SPRINTS = 3;

type FabKpisTv = {
  total: number;
  done: number;
  inProgress: number; // inclui "entregue"
  entregue: number;
  toDo: number;
  isLoading: boolean;
  items?: Array<{ work_item_type?: string | null; tags?: string | null }>;
  /** Itens da régua do gestor (sem Tasks duplicadas) — base da visão por fábrica ao vivo. */
  kpiItems?: ItemLive[];
  /** Épico raiz por item, de onde sai a fábrica. */
  fabricaByItemId?: Record<number, string>;
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
 *   1) Desempenho: régua de entrega por sprint + matriz fábrica × sprint.
 *   2) Qualidade & capacidade: qualidade por sprint + evolução diária + uso cruzado.
 *
 * A faixa de KPIs fica fixa nas duas, então o número principal nunca some da parede.
 *
 * Página 1 refeita em 26/07/2026 (mock MOCK_TV_FABRICA_EXEC_26-07). O que saiu e
 * por quê: o gráfico cartesiano gastava ~85% da área com 3 barras de 56px e
 * empilhava entrega (79–91%) e qualidade (12–33%) no mesmo eixo 0–100%; o
 * ranking por caixinha repetia, em outra linguagem, o dado que a matriz já
 * mostra por sprint. Concluído = done + entregue em toda a tela (régua do
 * gerencial), então a faixa de KPI e os blocos não divergem mais.
 */
export function FabricaTvView({ fab, sprintCode, periodLabel, dateFrom, dateTo }: FabricaTvViewProps) {
  /**
   * TV-1 — a página vem da sequência única do kiosk. Esta view não tem mais
   * relógio próprio: antes eram 25s fixos, invisíveis para a barra superior,
   * que continuavam girando mesmo com a rotação desligada.
   * Fora do modo TV (sem provider) fica parada na página 1.
   */
  const page = usePaginaKiosk(PAGES);

  const categoria = useMemo(() => {
    let bug = 0, retorno = 0, aviao = 0;
    for (const i of fab.items ?? []) {
      if (!['Product Backlog Item', 'Bug', 'User Story'].includes(i.work_item_type || '')) continue;
      const t = (i.tags || '').toLowerCase();
      if (/retorno\s*(de\s*)?qa/.test(t)) retorno++;
      else if (/avi[aã]o/.test(t)) aviao++;
      else if (i.work_item_type === 'Bug' || /(^|;)\s*bug\s*(;|$)/.test(t)) bug++;
    }
    return { bug, retorno, aviao };
  }, [fab.items]);

  // Concluído = Done + Entregue (regra do gestor). "em dev" exclui os entregues.
  const concluido = fab.done + fab.entregue;
  const emDev = Math.max(0, fab.inProgress - fab.entregue);
  const faltam = Math.max(0, fab.total - concluido);
  const sprintLabel = (sprintCode ?? '').split('-')[0] || null;

  const ritmo = useMemo(() => {
    if (!dateFrom || !dateTo) return null;
    return calcRitmoSprint({ total: fab.total, encerrados: concluido, from: dateFrom, to: dateTo });
  }, [dateFrom, dateTo, fab.total, concluido]);

  /** Fábrica de cada item vivo (Épico raiz → squad do roster) para a coluna da sprint em curso. */
  const liveFabricas = useMemo(
    () => agregaLivePorFabrica(
      fab.kpiItems ?? [],
      fab.fabricaByItemId ?? {},
      SQUADS,
      (state) => isDone(state) || isFabricaEntregue(state),
    ),
    [fab.kpiItems, fab.fabricaByItemId],
  );

  const live = useMemo(() => {
    if (!sprintLabel || fab.total <= 0) return null;
    return {
      sprint: sprintLabel,
      porFabrica: liveFabricas,
      geral: { total: fab.total, concluido, bug: categoria.bug, retorno: categoria.retorno },
    };
  }, [sprintLabel, liveFabricas, fab.total, concluido, categoria.bug, categoria.retorno]);

  const atualRegua = useMemo(() => {
    if (!sprintLabel || fab.total <= 0) return null;
    return {
      sprint: sprintLabel,
      total: fab.total,
      concluido,
      bugPct: pctDe(categoria.bug, fab.total),
      retornoPct: pctDe(categoria.retorno, fab.total),
      diaAtual: ritmo?.diasDecorridos,
      diasUteis: ritmo?.diasUteis,
      ritmoNecessario: ritmo?.ritmoNecessario,
    };
  }, [sprintLabel, fab.total, concluido, categoria.bug, categoria.retorno, ritmo]);

  const emAtraso = ritmo != null && pctDe(concluido, fab.total) < ritmo.esperadoPct;

  return (
    <div className="w-full h-full flex flex-col gap-2.5 overflow-hidden">
      {/* ── Faixa de KPIs — fixa nas duas páginas ── */}
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

      {page === 0 ? (
        <>
          {/* ─── Página 1 — Desempenho ─── */}
          <div className="flex-1 min-h-0">
            <EntregaSprintReguaCard maxSprints={TV_MAX_SPRINTS} atual={atualRegua} />
          </div>
          <div className="flex-[1.2] min-h-0">
            <MatrizFabricaSprintCard maxSprints={TV_MAX_SPRINTS} live={live} />
          </div>
        </>
      ) : (
        <>
          {/* ─── Página 2 — Qualidade & capacidade ─── */}
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

/** KPI-herói: um número por card, legível de longe (≈64px na tela do telão). */
function Heroi({ rotulo, valor, rodape, cor }: { rotulo: string; valor: ReactNode; rodape: string; cor?: string }) {
  return (
    <Card className="px-3.5 py-2 flex flex-col justify-center">
      <p className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground leading-none">{rotulo}</p>
      <p className="text-[44px] font-black leading-none font-mono mt-1" style={cor ? { color: cor } : undefined}>{valor}</p>
      <p className="text-[11.5px] text-muted-foreground mt-1 truncate">{rodape}</p>
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
