import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { FunnelBands } from '@/components/comercial/FunnelBands';
import { useComercialFunil, type FunilEtapa } from '@/hooks/useComercialFunil';
import { useComercialExecutivo, type AlertaComercial, type ProdutoMetaRealizado } from '@/hooks/useComercialExecutivo';
import {
  mesesDoTrimestre, qKeyAnterior, qLabel, ymAnterior, ymLabel,
  type VisaoTrimestre,
} from '@/lib/comercialPeriodo';

/**
 * Comercial no telão — TUDO numa tela (19/08/2026, decisão do Igor).
 *
 * Histórico curto desta tela: o funil dividia uma coluna da Visão Executiva em
 * modo compacto (ilegível a 4 m) → ganhou tela própria e o setor passou a ter
 * 2 páginas na rotação → agora as duas páginas viraram uma só.
 *
 * Anatomia, de cima para baixo:
 *   cabeçalho .... título · abas do trimestre (clicáveis) · selo do período
 *   funis ........ SDR e Comercial, largura toda, ocupam a folga da tela
 *   grade 4 × 2 .. linha 1 = foto da operação (carteira, produtos, satisfação,
 *                  alertas) · linha 2 = comparativo do trimestre, com destaque
 *
 * O que a densidade custa, medido no mock e aceito na decisão: produto e alerta
 * ficam em 10,5 px de canvas — leitura de 2 m, não de 4 m. Se algum dia a tela
 * voltar a ser só de telão, esses dois blocos são os primeiros a sair.
 *
 * Nada aqui escreve o trimestre: as visões e o selo saem do calendário, então a
 * virada do Q4 não pede build novo. E nenhum valor monetário — regra do telão.
 */

interface ComercialTvViewProps {
  /** Visões do trimestre — viram as abas clicáveis. */
  visoes: VisaoTrimestre[];
  /** Rótulo completo do trimestre ('Q3 2026 · jul–set'), derivado do calendário. */
  trimestreLabel: string;
  /** Chave do trimestre vigente ('2026-Q3'), derivada do calendário. */
  qKey: string;
  /** Janela do trimestre — recorte dos cards de operação. */
  dateFrom: Date;
  dateTo: Date;
  /** Foto da base VDesk (já sem os clientes internos). */
  clientesAtivos: number;
  clientesBloqueados: number;
  isLoadingClientes?: boolean;
  /** Visão inicial — default: o acumulado (ou o único mês, no começo do trimestre). */
  visaoInicial?: string;
}

/** Última etapa do funil = o que de fato fechou/chegou ao fim. */
const base = (etapas: FunilEtapa[]) => etapas[etapas.length - 1]?.quantidade ?? 0;
const topo = (etapas: FunilEtapa[]) => etapas[0]?.quantidade ?? 0;

/** Conversão do próprio funil: base ÷ topo. É o número do selo de cada card. */
function conversaoPropria(etapas: FunilEtapa[]): number | null {
  const t = topo(etapas);
  return t > 0 ? (base(etapas) / t) * 100 : null;
}

/** Conversão ponta a ponta: lead captado (topo do SDR) → fechado (base do Comercial). */
function conversaoTotal(sdr: FunilEtapa[], comercial: FunilEtapa[]): number | null {
  const t = topo(sdr);
  return t > 0 ? (base(comercial) / t) * 100 : null;
}

/** Variação percentual — null quando não há base de comparação (divisão por 0). */
function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

const num = (v: number) => v.toLocaleString('pt-BR');
const dec = (v: number, casas = 1) => v.toFixed(casas).replace('.', ',');
const corPct = (p: number) => (p >= 100 ? '#3fbe86' : p >= 70 ? '#e0a33c' : '#f4796d');

function DeltaChip({ valor, sufixo, referencia }: { valor: number | null; sufixo: string; referencia: string }) {
  if (valor === null) {
    return <span className="text-[11px] text-muted-foreground">sem base em {referencia}</span>;
  }
  const positivo = valor >= 0;
  return (
    <span
      className={`text-[11px] font-mono font-bold tabular-nums px-1.5 py-0.5 rounded whitespace-nowrap ${
        positivo ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
      }`}
    >
      {positivo ? '+' : '−'}{dec(Math.abs(valor))}{sufixo} vs {referencia}
    </span>
  );
}

/** Caixa única da grade inferior — mesmo padding, mesmo título, sempre. */
function Bloco({ titulo, children, destaque = false }: {
  titulo: string;
  children: React.ReactNode;
  destaque?: boolean;
}) {
  return (
    <Card className={`px-4 py-3 flex flex-col min-h-0 ${destaque ? 'border-primary/50 bg-primary/5' : ''}`}>
      <p className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-muted-foreground flex-none">
        {titulo}
      </p>
      <div className="flex-1 min-h-0 flex flex-col justify-center gap-1 mt-1">{children}</div>
    </Card>
  );
}

function KpiBloco({ titulo, valor, legenda, delta }: {
  titulo: string;
  valor: string;
  legenda: string;
  delta: React.ReactNode;
}) {
  return (
    <Bloco titulo={titulo} destaque>
      <p className="text-[34px] leading-none font-mono font-extrabold tabular-nums">{valor}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-muted-foreground">{legenda}</span>
        {delta}
      </div>
    </Bloco>
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
  visoes,
  trimestreLabel,
  qKey,
  dateFrom,
  dateTo,
  clientesAtivos,
  clientesBloqueados,
  isLoadingClientes = false,
  visaoInicial,
}: ComercialTvViewProps) {
  const [visaoKey, setVisaoKey] = useState<string>(() => visaoInicial ?? visoes[visoes.length - 1].key);
  // Fallback por identidade, não por índice: se o trimestre virar com o telão
  // ligado, a chave selecionada some da lista e a tela cai no acumulado novo
  // em vez de renderizar vazio.
  const visao = visoes.find(v => v.key === visaoKey) ?? visoes[visoes.length - 1];

  const { sdr, comercial, etapasDe, fallbackDe, isLoading: funilLoading } = useComercialFunil(visao.meses);

  // Os cards de operação seguem a janela do TRIMESTRE, não a da aba: trocar de
  // mês no filtro muda o funil, não a foto da carteira. Misturar as duas janelas
  // foi o bug de 30/07/2026 e não vai voltar por descuido de layout.
  const { movimento, produtos, satisfacao, alertas, isLoading: opLoading } =
    useComercialExecutivo(dateFrom, dateTo);

  // ── Comparativo do trimestre — igual em todas as visões ─────────────
  const mesesAcumulados = visoes.find(v => v.tipo === 'acumulado')?.meses
    ?? visoes.flatMap(v => (v.tipo === 'mes' ? v.meses : []));

  const kpisMes = visoes
    .filter(v => v.tipo === 'mes')
    .map(v => {
      const mes = v.meses[0];
      const atual = base(etapasDe([mes]).comercial);
      const anterior = base(etapasDe([ymAnterior(mes)]).comercial);
      return { key: mes, rotulo: v.label, valor: atual, delta: variacao(atual, anterior), referencia: ymLabel(ymAnterior(mes)) };
    });

  const acumulado = etapasDe(mesesAcumulados);
  const qAnterior = qKeyAnterior(qKey);
  const anteriorTrimestre = etapasDe(mesesDoTrimestre(qAnterior));
  const acumuladoBase = base(acumulado.comercial);
  const deltaAcumulado = variacao(acumuladoBase, base(anteriorTrimestre.comercial));

  const conversaoAcumulada = conversaoTotal(acumulado.sdr, acumulado.comercial);
  const conversaoAnterior = conversaoTotal(anteriorTrimestre.sdr, anteriorTrimestre.comercial);
  const deltaConversao =
    conversaoAcumulada !== null && conversaoAnterior !== null ? conversaoAcumulada - conversaoAnterior : null;

  // Só o comparativo cita o trimestre anterior ('vs Q2') — e sai do calendário.
  const qAnteriorCurto = qLabel(qAnterior, false).split(' ')[0];

  // Tetos declarados: o container é overflow-hidden, então linha excedente
  // sumiria EM SILÊNCIO. Cortar é decisão; sumir sem avisar é defeito.
  const PRODUTOS_MAX = 4;
  const ALERTAS_MAX = 3;
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

        <span className="text-[17px] font-bold font-mono px-3 py-1 rounded-lg border-2 border-primary/60 bg-primary/10 text-primary whitespace-nowrap">
          {trimestreLabel}
        </span>
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

      {/* ── Duas faixas de blocos: operação em cima, comparativo embaixo.
             Faixas separadas, e não um grid 4×2 único, porque a de baixo tem
             largura variável: o trimestre ganha um mês por vez (jul → jul+ago
             → jul+ago+set). Num grid fixo de 4 colunas, setembro empurraria um
             card para uma terceira linha que não existe — e o container é
             overflow-hidden, então ele sumiria sem avisar. ───────────── */}
      <div className="flex-none h-[288px] max-h-[45%] flex flex-col gap-3">
      <div className="flex-1 min-h-0 grid grid-cols-4 gap-3">
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

        <Bloco titulo="Produtos · meta × realizado">
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
                    <span className="font-mono tabular-nums flex-shrink-0" style={{ color: corPct(p.pct) }}>
                      {p.pct.toFixed(0)}%
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

        <Bloco titulo="Alertas">
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

      <div
        className="flex-1 min-h-0 grid gap-3"
        style={{ gridTemplateColumns: `repeat(${kpisMes.length + 2}, minmax(0, 1fr))` }}
      >
        {kpisMes.map(k => (
          <KpiBloco
            key={k.key}
            titulo={k.rotulo}
            valor={funilLoading ? '—' : num(k.valor)}
            legenda="fechadas"
            delta={<DeltaChip valor={k.delta} sufixo="%" referencia={k.referencia} />}
          />
        ))}
        <KpiBloco
          titulo="Acumulado"
          valor={funilLoading ? '—' : num(acumuladoBase)}
          legenda="fechadas"
          delta={<DeltaChip valor={deltaAcumulado} sufixo="%" referencia={qAnteriorCurto} />}
        />
        <KpiBloco
          titulo="Taxa de conversão"
          valor={funilLoading || conversaoAcumulada === null ? '—' : `${dec(conversaoAcumulada)}%`}
          legenda="lead → fechado"
          delta={<DeltaChip valor={deltaConversao} sufixo=" p.p." referencia={qAnteriorCurto} />}
        />
      </div>
      </div>
    </div>
  );
}
