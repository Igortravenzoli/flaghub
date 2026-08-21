import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { FunnelBands } from '@/components/comercial/FunnelBands';
import { useComercialFunil, type FunilEtapa } from '@/hooks/useComercialFunil';
import { useComercialExecutivo, type AlertaComercial, type ProdutoMetaRealizado } from '@/hooks/useComercialExecutivo';
import {
  qKeyAnterior, qKeyDoMes, qKeyProximo, qLabel, visoesDoTrimestreKey, ymLabel, ymOf,
} from '@/lib/comercialPeriodo';

/**
 * Comercial no telão — TUDO numa tela (19/08/2026, decisão do Igor).
 *
 * Histórico curto desta tela: o funil dividia uma coluna da Visão Executiva em
 * modo compacto (ilegível a 4 m) → ganhou tela própria e o setor passou a ter
 * 2 páginas na rotação → as duas páginas viraram uma só → em 20/08/2026 a faixa
 * de comparativo (Julho · Agosto · Acumulado · Taxa de conversão) SAIU, a
 * pedido do Igor; a altura dela ficou com a linha de operação, que passou a
 * mostrar mais produtos e alertas. No mesmo dia a aba de período passou a
 * governar a tela toda (antes só o funil — ver comentário no corpo) e o selo
 * do trimestre ganhou setas ‹ › — o trimestre exibido virou escolha do
 * operador, com teto no vigente.
 *
 * Anatomia, de cima para baixo:
 *   cabeçalho .... título · abas do trimestre (clicáveis) · seletor ‹ selo ›
 *   funis ........ SDR e Comercial, largura toda, ocupam a folga da tela
 *   grade 4 × 1 .. foto da operação: carteira, produtos, satisfação, alertas
 *
 * O que a densidade custa, medido no mock e aceito na decisão: produto e alerta
 * ficam em 10,5 px de canvas — leitura de 2 m, não de 4 m. Se algum dia a tela
 * voltar a ser só de telão, esses dois blocos são os primeiros a sair.
 *
 * Nada aqui escreve o trimestre: as visões e o selo saem do calendário, então a
 * virada do Q4 não pede build novo. E nenhum valor monetário — regra do telão.
 */

interface ComercialTvViewProps {
  /** Foto da base VDesk (já sem os clientes internos). */
  clientesAtivos: number;
  clientesBloqueados: number;
  isLoadingClientes?: boolean;
  /** Trimestre inicial ('2026-Q3') — default: o vigente. */
  qKeyInicial?: string;
  /** Visão inicial — default: o acumulado (ou o único mês, no começo do trimestre). */
  visaoInicial?: string;
  /** Relógio injetável (testes) — default: agora. Decide quais meses já iniciaram. */
  hoje?: Date;
}

/** Última etapa do funil = o que de fato fechou/chegou ao fim. */
const base = (etapas: FunilEtapa[]) => etapas[etapas.length - 1]?.quantidade ?? 0;
const topo = (etapas: FunilEtapa[]) => etapas[0]?.quantidade ?? 0;

/** Conversão do próprio funil: base ÷ topo. É o número do selo de cada card. */
function conversaoPropria(etapas: FunilEtapa[]): number | null {
  const t = topo(etapas);
  return t > 0 ? (base(etapas) / t) * 100 : null;
}

const num = (v: number) => v.toLocaleString('pt-BR');
const dec = (v: number, casas = 1) => v.toFixed(casas).replace('.', ',');
const corPct = (p: number) => (p >= 100 ? '#3fbe86' : p >= 70 ? '#e0a33c' : '#f4796d');

/** Caixa única da grade inferior — mesmo padding, mesmo título, sempre.
 *  O miolo centraliza com `safe center`: conteúdo maior que a área deixa de
 *  centralizar (alinha ao topo) em vez de vazar por CIMA do título — foi o bug
 *  de 20/08 no bloco de produtos. O overflow-hidden segura o que ainda passar
 *  (os tetos *_MAX continuam sendo quem decide o corte com aviso "+N"). */
function Bloco({ titulo, children }: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="px-4 py-3 flex flex-col min-h-0">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-muted-foreground flex-none">
        {titulo}
      </p>
      <div className="flex-1 min-h-0 flex flex-col [justify-content:safe_center] gap-1 mt-1 overflow-hidden">{children}</div>
    </Card>
  );
}

function FunilCard({ titulo, subtitulo, etapas, carregando, recorte }: {
  titulo: string;
  subtitulo: string;
  etapas: FunilEtapa[];
  carregando: boolean;
  /** Recorte no ar — troca ⇒ a cascata das faixas roda de novo. */
  recorte: string;
}) {
  const conversao = conversaoPropria(etapas);
  return (
    <Card className="px-4 py-3 flex flex-col gap-2.5 min-h-0 overflow-hidden">
      <div className="flex items-center gap-3 flex-none">
        <div className="min-w-0">
          <p className="text-[18px] font-bold leading-tight">{titulo}</p>
          <p className="text-[11.5px] text-muted-foreground leading-tight truncate">{subtitulo}</p>
        </div>
        {conversao !== null && (
          <div className="ml-auto text-right flex-shrink-0">
            <p className="text-[20px] leading-none font-mono font-extrabold tabular-nums">{dec(conversao)}%</p>
            <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">conversão</p>
          </div>
        )}
      </div>
      {carregando ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <FunnelBands
          etapas={etapas}
          variante="tv"
          animacaoKey={recorte}
          textoVazio="Sem lançamento no período — lance na aba Funil de Vendas."
        />
      )}
    </Card>
  );
}

export function ComercialTvView({
  clientesAtivos,
  clientesBloqueados,
  isLoadingClientes = false,
  qKeyInicial,
  visaoInicial,
  hoje,
}: ComercialTvViewProps) {
  // Relógio estável por montagem: decide o trimestre vigente (teto do seletor)
  // e quais meses do trimestre exibido já iniciaram.
  const [hojeRef] = useState(() => hoje ?? new Date());
  const qVigente = qKeyDoMes(ymOf(hojeRef));

  // ── Seletor de trimestre (20/08/2026, pedido do Igor): ‹ › ao lado do selo
  // navegam trimestres; para frente o teto é o vigente. As abas de mês saem do
  // calendário do trimestre exibido (trimestre passado = 3 meses + acumulado).
  const [qKey, setQKey] = useState(qKeyInicial ?? qVigente);
  const visoes = useMemo(() => visoesDoTrimestreKey(qKey, hojeRef), [qKey, hojeRef]);
  const trimestreLabel = qLabel(qKey);
  const noVigente = qKey === qVigente;

  const [visaoKey, setVisaoKey] = useState<string>(() => visaoInicial ?? visoes[visoes.length - 1].key);
  // Fallback por identidade, não por índice: ao trocar de trimestre (ou o
  // trimestre virar com o telão ligado) a chave selecionada some da lista e a
  // tela cai no acumulado do trimestre exibido em vez de renderizar vazio.
  const visao = visoes.find(v => v.key === visaoKey) ?? visoes[visoes.length - 1];

  const { sdr, comercial, fallbackDe, isLoading: funilLoading } = useComercialFunil(visao.meses);

  // 20/08/2026 — decisão do Igor, revendo a regra de 30/07: a aba de período
  // governa a TELA TODA (funil E operação), não só o funil. O bug de 30/07 era
  // cada card ler uma janela DIFERENTE sem rótulo; aqui a janela é UMA — a da
  // aba ativa — derivada de `visao.meses`. Só a foto da base (clientes ativos/
  // bloqueados, via props) segue atemporal: é retrato do ERP, não agregado.
  const opJanela = useMemo(() => {
    const meses = visao.meses;
    const [y0, m0] = meses[0].split('-').map(Number);
    const [y1, m1] = meses[meses.length - 1].split('-').map(Number);
    return { from: new Date(y0, m0 - 1, 1), to: new Date(y1, m1, 0, 23, 59, 59) };
  }, [visao]);
  const { movimento, produtos, satisfacao, alertas, isLoading: opLoading } =
    useComercialExecutivo(opJanela.from, opJanela.to);

  // Tetos declarados: o container é overflow-hidden, então linha excedente
  // sumiria EM SILÊNCIO. Cortar é decisão; sumir sem avisar é defeito.
  // 20/08: com a faixa de comparativo removida, a linha de operação ficou com
  // os 288px inteiros (~245px úteis por bloco) — cabem 8 produtos e 6 alertas
  // com a linha "+N"; era 4 (e a 4ª linha sobrepunha o título na faixa dupla).
  const PRODUTOS_MAX = 8;
  const ALERTAS_MAX = 6;
  const produtosComMeta = produtos.filter((p: ProdutoMetaRealizado) => p.metaQty > 0);
  const produtosVisiveis = produtosComMeta.slice(0, PRODUTOS_MAX);
  const produtosOcultos = produtosComMeta.length - produtosVisiveis.length;
  const alertasVisiveis = alertas.slice(0, ALERTAS_MAX);
  const alertasOcultos = alertas.length - alertasVisiveis.length;

  const subtituloFunil = (padrao: string) =>
    visao.tipo === 'acumulado' ? `Soma de ${visao.meses.map(ymLabel).join(' + ')}` : padrao;

  return (
    <div className="w-full h-full flex flex-col gap-3 overflow-hidden">
      {/* ── Cabeçalho ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-none">
        <h2 className="text-[25px] font-bold leading-none whitespace-nowrap">
          Comercial <span className="text-muted-foreground font-medium">· visão completa</span>
        </h2>

        <div className="flex items-center gap-2" aria-label="Visão exibida">
          {visoes.map(v => {
            const ativa = v.key === visao.key;
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => setVisaoKey(v.key)}
                aria-current={ativa ? 'true' : undefined}
                className={`text-[15px] font-semibold rounded-full px-4 py-1 border whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  ativa
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                }`}
              >
                {v.label}
              </button>
            );
          })}
        </div>

        {/* Seletor de trimestre: ‹ selo › — para frente o teto é o vigente */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setQKey(qKeyAnterior(qKey))}
            aria-label="Trimestre anterior"
            title="Trimestre anterior"
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-[17px] font-bold font-mono px-3 py-1 rounded-lg border-2 border-primary/60 bg-primary/10 text-primary whitespace-nowrap">
            {trimestreLabel}
          </span>
          <button
            type="button"
            onClick={() => setQKey(qKeyProximo(qKey))}
            disabled={noVigente}
            aria-label="Próximo trimestre"
            title={noVigente ? 'Já está no trimestre vigente' : 'Próximo trimestre'}
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {fallbackDe && (
        <p className="text-[12px] text-amber-500 text-center leading-none flex-none">
          Sem lançamento em {fallbackDe.map(ymLabel).join(', ')} — exibindo o último mês lançado.
        </p>
      )}

      {/* ── Funis: ficam com a folga da tela ─────────────────────── */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3">
        <FunilCard
          titulo="Funil SDR"
          subtitulo={subtituloFunil('Da captação do lead à transferência para o Comercial')}
          etapas={sdr}
          carregando={funilLoading}
          recorte={visao.key}
        />
        <FunilCard
          titulo="Funil Comercial"
          subtitulo={subtituloFunil('Da oportunidade recebida ao fechamento')}
          etapas={comercial}
          carregando={funilLoading}
          recorte={visao.key}
        />
      </div>

      {/* ── Faixa única de operação (o comparativo saiu em 20/08 — decisão do
             Igor): os 288px que eram divididos em duas linhas agora são só
             desta, e Produtos/Alertas mostram mais itens. ─────────────── */}
      <div className="flex-none h-[288px] max-h-[45%] grid grid-cols-4 gap-3">
        <Bloco titulo="Carteira e movimento">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[34px] leading-none font-mono font-extrabold tabular-nums">
                {isLoadingClientes ? '—' : num(clientesAtivos)}
              </p>
              <p className="text-[11px] text-muted-foreground">clientes ativos</p>
            </div>
            <div className="text-right">
              <p className="text-[22px] leading-none font-mono font-extrabold tabular-nums text-destructive">
                {isLoadingClientes ? '—' : num(clientesBloqueados)}
              </p>
              <p className="text-[11px] text-muted-foreground">bloqueados</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1 border-t pt-1.5 mt-1">
            <div>
              <p className="text-[21px] leading-none font-mono font-extrabold tabular-nums text-emerald-500">
                {opLoading ? '—' : movimento.ganhos}
              </p>
              <p className="text-[10px] text-muted-foreground">ganhos</p>
            </div>
            <div>
              <p className="text-[21px] leading-none font-mono font-extrabold tabular-nums text-destructive">
                {opLoading ? '—' : movimento.perdas}
              </p>
              <p className="text-[10px] text-muted-foreground">perdas</p>
            </div>
            <div>
              <p
                className="text-[21px] leading-none font-mono font-extrabold tabular-nums"
                style={{ color: movimento.saldo > 0 ? '#3fbe86' : movimento.saldo < 0 ? '#f4796d' : undefined }}
              >
                {opLoading ? '—' : `${movimento.saldo > 0 ? '+' : ''}${movimento.saldo}`}
              </p>
              <p className="text-[10px] text-muted-foreground">saldo</p>
            </div>
          </div>
        </Bloco>

        {/* Título carrega a janela ativa (regra de ouro do comercialPeriodo) e a
            linha mostra realizado/meta — sem isso, períodos com números iguais
            (caso real de 20/08: metas jul = ago, realizado 0) pareciam "aba não
            reflete" quando a janela estava certa. */}
        <Bloco titulo={`Produtos · meta × realizado · ${visao.labelCurto}`}>
          {opLoading ? (
            <p className="text-[11px] text-muted-foreground">Carregando…</p>
          ) : produtosVisiveis.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Sem metas de produto no período.</p>
          ) : (
            <div className="flex flex-col gap-1.5 justify-start">
              {produtosVisiveis.map(p => (
                <div key={p.nome} className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-2 text-[10.5px]">
                    <span className="truncate" title={p.nome}>{p.nome}</span>
                    <span className="flex-shrink-0 flex items-baseline gap-1.5">
                      <span className="font-mono tabular-nums text-muted-foreground">{num(p.realQty)}/{num(p.metaQty)}</span>
                      <span className="font-mono tabular-nums" style={{ color: corPct(p.pct) }}>
                        {p.pct.toFixed(0)}%
                      </span>
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(p.pct, 100)}%`, backgroundColor: corPct(p.pct) }}
                    />
                  </div>
                </div>
              ))}
              {produtosOcultos > 0 && (
                <p className="text-[10px] text-muted-foreground">+{produtosOcultos} produto{produtosOcultos !== 1 ? 's' : ''}</p>
              )}
            </div>
          )}
        </Bloco>

        <Bloco titulo="Satisfação">
          <div className="grid grid-cols-3 gap-1">
            <div>
              <p className="text-[21px] leading-none font-mono font-extrabold tabular-nums">
                {satisfacao.csat != null ? `${Number(satisfacao.csat).toFixed(0)}%` : '—'}
              </p>
              <p className="text-[10px] text-muted-foreground">CSAT</p>
            </div>
            <div>
              <p className="text-[21px] leading-none font-mono font-extrabold tabular-nums">
                {satisfacao.nota != null ? dec(Number(satisfacao.nota)) : '—'}
              </p>
              <p className="text-[10px] text-muted-foreground">nota média</p>
            </div>
            <div>
              <p
                className="text-[21px] leading-none font-mono font-extrabold tabular-nums"
                style={{ color: satisfacao.detratores > 0 ? '#f4796d' : '#3fbe86' }}
              >
                {satisfacao.detratores}
              </p>
              <p className="text-[10px] text-muted-foreground">detratores</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-1.5 mt-1">
            Última pesquisa · {satisfacao.respostas} resposta{satisfacao.respostas !== 1 ? 's' : ''}
          </p>
        </Bloco>

        <Bloco titulo={`Alertas · ${visao.labelCurto}`}>
          {opLoading ? (
            <p className="text-[11px] text-muted-foreground">Carregando…</p>
          ) : alertasVisiveis.length === 0 ? (
            <p className="text-[11px] text-emerald-500">Nenhum ponto de atenção no período.</p>
          ) : (
            <div className="flex flex-col gap-1.5 justify-start">
              {alertasVisiveis.map((a: AlertaComercial, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[10.5px] leading-snug">
                  <span
                    className="h-1.5 w-1.5 rounded-full flex-shrink-0 mt-1"
                    style={{ backgroundColor: a.nivel === 'alto' ? '#f4796d' : '#e0a33c' }}
                  />
                  <span className="line-clamp-2">{a.texto}</span>
                </div>
              ))}
              {alertasOcultos > 0 && (
                <p className="text-[10px] text-muted-foreground">+{alertasOcultos} ponto{alertasOcultos !== 1 ? 's' : ''} de atenção</p>
              )}
            </div>
          )}
        </Bloco>
      </div>
    </div>
  );
}
