import { useMemo, useRef, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import { ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSprintSnapshots, type SnapshotScopeBreakdown } from '@/hooks/useSprintSnapshots';
import { useWorkItemsByIds } from '@/hooks/useWorkItemsByIds';
import { cleanFabricaName } from '@/lib/fabricaNames';
import { META_ENTREGA_PCT, TETO_BUG_PCT } from '@/lib/fabricaMetas';
import { concluidoDoEscopo, idsDaSerie, type SerieSprint } from '@/lib/fabricaTvSeries';

type DesempenhoTrendChartProps = {
  /** Fábrica (rótulo normalizado, ex.: "K8") para escopar; null/ausente = geral. */
  fabrica?: string | null;
  /** Quantas sprints mais recentes exibir. */
  maxSprints?: number;
  /** Altura do gráfico; use "100%" para preencher o card (o pai precisa ter altura). */
  height?: number | string;
  /** Mostra o número dentro da bolinha de cada ponto (e habilita o drill-down). */
  showValues?: boolean;
  /** Oculta a legenda interna (quando o card pai já tem legenda própria). */
  showLegend?: boolean;
  /**
   * Desenha as metas do gestor como linhas de referência tracejadas (piso de
   * entrega e teto de bug/retorno). Ligado só no telão (07/08/2026): os
   * painéis de meta saíram da página 1 da TV e a régua não podia sumir da
   * parede. Na mesa fica desligado — a leitura de meta mora nos painéis.
   */
  showMetas?: boolean;
};

// Semântica das cores: Entrega ↑ é bom (verde), Bug ↓ é ruim (vermelho),
// Retorno QA fica no âmbar (alerta) — definido pelo gestor.
const COR_ENTREGA = 'hsl(142,71%,42%)';
const COR_RETORNO = 'hsl(38,92%,50%)';
const COR_BUG = 'hsl(0,72%,52%)';

type Serie = SerieSprint;

/** Exportado para os cards que replicam a legenda fora do gráfico (ex.: ranking por fábrica). */
export const COR_SERIE: Record<Serie, string> = {
  'Entrega': COR_ENTREGA,
  'Retorno QA': COR_RETORNO,
  'Bug': COR_BUG,
};
const COR = COR_SERIE;

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

type Ponto = {
  sprint: string;
  code: string;
  num: number;
  escopo: number;
  temIds: boolean;
  ids: Record<Serie, number[]>;
  'Entrega': number;
  'Retorno QA': number;
  'Bug': number;
};

type Foco = { ponto: Ponto; serie: Serie; cx: number; cy: number };

/** Lista de itens do DevOps — usada no hover (recortada) e no diálogo (completa). */
function ListaItens({ ids, limite, onVerTodos }: { ids: number[]; limite?: number; onVerTodos?: () => void }) {
  const { data: itens = [], isLoading } = useWorkItemsByIds(ids);

  if (isLoading) return <p className="text-[11px] text-muted-foreground">Carregando itens…</p>;
  if (itens.length === 0) return <p className="text-[11px] text-muted-foreground">Nenhum item.</p>;

  const visiveis = limite ? itens.slice(0, limite) : itens;
  const restante = itens.length - visiveis.length;

  return (
    <>
      <ul className="space-y-1">
        {visiveis.map((it) => {
          const rotuloTipo = it.work_item_type === 'Bug' ? 'BUG' : 'PBI';
          const conteudo = (
            <>
              <span
                className={`shrink-0 rounded px-1 text-[9px] font-semibold leading-4 ${
                  it.work_item_type === 'Bug'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-primary/10 text-primary'
                }`}
              >
                {rotuloTipo}
              </span>
              <span className="truncate">{it.title || `#${it.id}`}</span>
            </>
          );

          return (
            <li key={it.id} className="text-[11px] leading-tight">
              {it.web_url ? (
                <a
                  href={it.web_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted hover:underline"
                  title={`${it.title ?? ''} · ${it.state ?? ''} — abrir no DevOps`}
                >
                  {conteudo}
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                </a>
              ) : (
                <span className="flex items-center gap-1.5 px-1 py-0.5">{conteudo}</span>
              )}
            </li>
          );
        })}
      </ul>
      {restante > 0 && (
        onVerTodos ? (
          <button
            type="button"
            onClick={onVerTodos}
            className="mt-1 text-[10px] text-primary hover:underline"
          >
            +{restante} {restante === 1 ? 'item' : 'itens'} · ver todos
          </button>
        ) : (
          <p className="mt-1 text-[10px] text-muted-foreground">
            +{restante} {restante === 1 ? 'item' : 'itens'}
          </p>
        )
      )}
    </>
  );
}

/**
 * Tendência dos indicadores de Desempenho & Qualidade por sprint (visão do slide 1):
 * % Entrega (↑ melhor) em verde, % Retorno QA (âmbar) e % Bug (vermelho, ↓ melhor).
 * Fonte = fotografias de fim de sprint (sprint_indicator_snapshots).
 *
 * Entrega = itens ENCERRADOS (done + entregue) ÷ escopo — mesma régua do
 * gerencial e da faixa de KPI (decisão de 26/07/2026).
 *
 * Escopo da foto = o QUADRO da sprint (PBI + User Story + Bug pelo
 * iteration_path no corte), igual ao card "Itens no escopo" — SN-7, 03/08/2026.
 *
 * Drill-down (03/08/2026): passar o mouse na bolinha lista os itens por trás do
 * indicador, cada um com link para o DevOps — o painel é interativo, e o
 * fechamento fica em carência de 240 ms para o cursor conseguir atravessar a
 * folga até ele. Clicar na bolinha (ou em "ver todos") abre a lista completa.
 *
 * Uso de perto (aba Executiva). O telão tem composição própria — ver
 * `EntregaSprintReguaCard`, que substituiu o antigo modo `tv` daqui.
 */
export function DesempenhoTrendChart({
  fabrica,
  maxSprints = 8,
  height = 220,
  showValues = true,
  showLegend = true,
  showMetas = false,
}: DesempenhoTrendChartProps) {
  const { data: snapshots = {}, isLoading } = useSprintSnapshots();
  const anoVigente = new Date().getFullYear();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [foco, setFoco] = useState<Foco | null>(null);
  const [aberto, setAberto] = useState<{ ponto: Ponto; serie: Serie } | null>(null);

  /**
   * O painel de hover carrega links clicáveis, então não pode sumir no instante
   * em que o cursor sai da bolinha — o mouse precisa atravessar a folga até
   * ele. Fechamento fica em carência; entrar no painel cancela.
   */
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelaFechamento = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  const agendaFechamento = () => {
    cancelaFechamento();
    timerRef.current = setTimeout(() => setFoco(null), 240);
  };

  const data = useMemo<Ponto[]>(() => {
    const reAno = new RegExp(`^S\\d+-${anoVigente}$`);
    return Object.values(snapshots)
      .filter((s) => reAno.test(s.sprint_code) && s.category_breakdown)
      .map((s) => {
        const scope = scopeFor(s.category_breakdown, fabrica);
        if (!scope) return null;
        return {
          sprint: s.sprint_code.split('-')[0],
          code: s.sprint_code,
          num: sprintNum(s.sprint_code),
          escopo: scope.total,
          temIds: Boolean(scope.ids),
          ids: {
            'Entrega': idsDaSerie(scope, 'Entrega'),
            'Retorno QA': idsDaSerie(scope, 'Retorno QA'),
            'Bug': idsDaSerie(scope, 'Bug'),
          },
          'Entrega': pct(concluidoDoEscopo(scope), scope.total),
          'Retorno QA': pct(scope.cats.retorno_qa, scope.total),
          'Bug': pct(scope.cats.bug, scope.total),
        } satisfies Ponto;
      })
      .filter((r): r is Ponto => r !== null)
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

  /**
   * Bolinha com o número dentro. Bug e Retorno QA costumam andar próximos; quando
   * a distância é pequena, afasta uma p/ cima e outra p/ baixo para não sobrepor.
   */
  const dotFor = (serie: Serie) => {
    if (!showValues) return { r: 3 };
    const color = COR[serie];
    return function Dot({ cx, cy, value, index, payload }: {
      cx?: number; cy?: number; value?: number; index?: number; payload?: Ponto;
    }) {
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
        <g
          key={`${serie}-${index}`}
          style={{ cursor: payload?.temIds ? 'pointer' : 'default' }}
          onMouseEnter={() => {
            cancelaFechamento();
            if (payload) setFoco({ ponto: payload, serie, cx, cy: cy + dy });
          }}
          onMouseLeave={agendaFechamento}
          onClick={() => payload?.temIds && setAberto({ ponto: payload, serie })}
        >
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
  };

  const larguraPainel = 268;
  const larguraCaixa = wrapperRef.current?.clientWidth ?? 640;
  const meio = larguraPainel / 2 + 8;

  return (
    /**
     * `height="100%"` exige que ESTE wrapper também preencha o pai — sem
     * `h-full` ele colapsa para a altura do conteúdo e o ResponsiveContainer
     * mede zero. Altura numérica (uso de mesa) segue como sempre foi.
     */
    <div ref={wrapperRef} className={height === '100%' ? 'relative h-full' : 'relative'}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 18, right: 18, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="sprint" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
          {showLegend && <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />}
          {/* Metas tracejadas: bug e retorno QA compartilham o teto (30%), então
              uma linha neutra serve os dois; se as constantes divergirem um dia,
              separar. Rótulo sempre visível — regra de TV, nada só em hover. */}
          {showMetas && (
            <ReferenceLine
              y={META_ENTREGA_PCT}
              stroke={COR_ENTREGA}
              strokeDasharray="7 5"
              strokeOpacity={0.55}
              label={{ value: `piso entrega ${META_ENTREGA_PCT}%`, position: 'insideTopRight', fill: COR_ENTREGA, fontSize: 11, opacity: 0.8 }}
            />
          )}
          {showMetas && (
            <ReferenceLine
              y={TETO_BUG_PCT}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="7 5"
              strokeOpacity={0.45}
              label={{ value: `teto bug · retorno ${TETO_BUG_PCT}%`, position: 'insideBottomRight', fill: 'hsl(var(--muted-foreground))', fontSize: 11, opacity: 0.8 }}
            />
          )}
          <Line type="monotone" dataKey="Entrega" stroke={COR_ENTREGA} strokeWidth={2.5} dot={dotFor('Entrega')} activeDot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="Retorno QA" stroke={COR_RETORNO} strokeWidth={2} dot={dotFor('Retorno QA')} activeDot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="Bug" stroke={COR_BUG} strokeWidth={2} dot={dotFor('Bug')} activeDot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>

      {foco && (
        <div
          className="absolute z-30 rounded-lg border border-border bg-card p-2.5 shadow-md"
          style={{
            width: larguraPainel,
            left: Math.min(Math.max(foco.cx, meio), Math.max(larguraCaixa - meio, meio)),
            top: foco.cy,
            transform: foco.cy > 110 ? 'translate(-50%, calc(-100% - 10px))' : 'translate(-50%, 10px)',
          }}
          onMouseEnter={cancelaFechamento}
          onMouseLeave={() => setFoco(null)}
        >
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold" style={{ color: COR[foco.serie] }}>
              {foco.serie} · {foco.ponto.sprint}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {foco.ponto[foco.serie]}% de {foco.ponto.escopo}
            </span>
          </div>
          {foco.ponto.temIds ? (
            <ListaItens
              ids={foco.ponto.ids[foco.serie]}
              limite={8}
              onVerTodos={() => { setAberto({ ponto: foco.ponto, serie: foco.serie }); setFoco(null); }}
            />
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Detalhamento indisponível: foto selada antes de 03/08/2026.
            </p>
          )}
        </div>
      )}

      <Dialog open={aberto !== null} onOpenChange={(v) => !v && setAberto(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {aberto && (
                <span className="flex items-baseline gap-2">
                  <span style={{ color: COR[aberto.serie] }}>{aberto.serie}</span>
                  <span className="text-muted-foreground">
                    · {aberto.ponto.code} · {aberto.ponto.ids[aberto.serie].length} de {aberto.ponto.escopo} itens
                    ({aberto.ponto[aberto.serie]}%)
                  </span>
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {aberto && <ListaItens ids={aberto.ponto.ids[aberto.serie]} />}
          </div>
          <p className="border-t pt-2 text-[11px] text-muted-foreground">
            Composição congelada na fotografia da sprint; título e estado vêm do DevOps agora.
            Clique para abrir o item.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
