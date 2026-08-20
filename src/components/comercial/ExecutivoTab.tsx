import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import {
  TrendingDown, Wallet, Package, Smile, AlertTriangle, CheckCircle2, Briefcase, BarChart3,
  Filter as FilterIcon,
} from 'lucide-react';
import { useComercialExecutivo } from '@/hooks/useComercialExecutivo';
import { useComercialFunil } from '@/hooks/useComercialFunil';
import { resolvePeriodo, ymLabel } from '@/lib/comercialPeriodo';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { FunnelBands } from '@/components/comercial/FunnelBands';

function brl(value: number, show: boolean): React.ReactNode {
  if (!show) return <span className="font-mono tracking-widest text-muted-foreground">R$ •••</span>;
  return <span className="font-mono">{value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>;
}

const corPct = (p: number) => (p >= 100 ? '#16a34a' : p >= 70 ? '#f59e0b' : '#ef4444');

function BlocoCard({
  icon: Icon,
  titulo,
  periodo,
  escopoFixo,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  titulo: string;
  /** Janela do dado — exibida ao lado do título (PER-3: nenhum número sem janela). */
  periodo?: string;
  /** Card que NÃO responde ao filtro (foto do estado atual) — ganha selo próprio. */
  escopoFixo?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border bg-muted/40">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{titulo}</p>
        {periodo && (
          <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded border bg-muted/40 text-muted-foreground whitespace-nowrap">
            {periodo}
          </span>
        )}
        {!periodo && escopoFixo && (
          <span
            className="ml-auto text-[10px] px-1.5 py-0.5 rounded border bg-muted/40 text-muted-foreground whitespace-nowrap"
            title={escopoFixo}
          >
            base atual
          </span>
        )}
      </div>
      <div className="flex-1 flex flex-col justify-evenly gap-3">
        {children}
      </div>
    </Card>
  );
}

interface ExecutivoTabProps {
  canViewValues?: boolean;
  showValues?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  periodLabel?: string;
  clientesAtivos: number;
  clientesBloqueados: number;
  isLoadingClientes?: boolean;
}

export function ExecutivoTab({
  canViewValues = false,
  showValues = false,
  dateFrom,
  dateTo,
  periodLabel,
  clientesAtivos,
  clientesBloqueados,
  isLoadingClientes = false,
}: ExecutivoTabProps) {
  // Os numeros vem todos do mesmo hook: telao e mesa nao podem divergir.
  const { movimento, receita, produtos, satisfacao, alertas, isLoading: loading } =
    useComercialExecutivo(dateFrom, dateTo);

  // Periodo e resolvido num lugar so - todo card daqui pra baixo usa este recorte.
  const periodo = useMemo(() => resolvePeriodo(dateFrom, dateTo), [dateFrom, dateTo]);
  // Mes e trimestre usam o rotulo explicito ("Q3 2026 - jul-set"): o preset da
  // pagina diz "3o Trimestre" e nao mostra quais meses sao. Recortes irregulares
  // (90 dias, personalizado) mantem o nome do preset.
  const periodoTitulo = periodo.granularidade === 'multi' ? (periodLabel ?? periodo.label) : periodo.label;

  // PER-2: o funil obedece ao periodo selecionado. Quando o periodo nao tem
  // nenhum lancamento, o hook cai para o ultimo mes com dados e devolve
  // `fallbackDe` - que a tela avisa em vez de trocar o dado em silencio.
  const {
    sdr: funilSdr,
    comercial: funilComercial,
    historico: funilHistoricoMensal,
    historicoTrimestral: funilHistoricoTrimestral,
    meses: funilMeses,
    fallbackDe: funilFallbackDe,
    isLoading: funilLoading,
  } = useComercialFunil(periodo.meses);
  const funilMesLabel = funilFallbackDe ? ymLabel(funilMeses[0]) : periodo.labelCurto;
  const funilHistorico = periodo.granularidade === 'mes' ? funilHistoricoMensal : funilHistoricoTrimestral;


  // ── Cards (compostos por modo: padrão × TV) ───────────────────
  const carteiraMovimentoCard = (
    <BlocoCard icon={Briefcase} titulo="Carteira e Movimento" periodo={periodo.labelCurto}>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-3xl font-bold font-mono">{isLoadingClientes ? '—' : clientesAtivos}</p>
          <p className="text-xs text-muted-foreground mt-0.5" title="Foto da base VDesk — não responde ao filtro de período">
            clientes ativos <span className="opacity-60">· base atual</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold font-mono text-destructive">{isLoadingClientes ? '—' : clientesBloqueados}</p>
          <p className="text-[11px] text-muted-foreground">bloqueados</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 border-t pt-2">
        <div>
          <p className="text-2xl font-bold font-mono text-emerald-600">{loading ? '—' : movimento.ganhos}</p>
          <p className="text-[11px] text-muted-foreground">ganhos</p>
        </div>
        <div>
          <p className="text-2xl font-bold font-mono text-destructive">{loading ? '—' : movimento.perdas}</p>
          <p className="text-[11px] text-muted-foreground">perdas</p>
        </div>
        <div>
          <p
            className="text-2xl font-bold font-mono"
            style={{ color: movimento.saldo > 0 ? '#16a34a' : movimento.saldo < 0 ? '#ef4444' : undefined }}
          >
            {loading ? '—' : `${movimento.saldo > 0 ? '+' : ''}${movimento.saldo}`}
          </p>
          <p className="text-[11px] text-muted-foreground">saldo</p>
        </div>
      </div>
      {canViewValues && movimento.valorPerdido > 0 && (
        <p className="text-[11px] text-muted-foreground border-t pt-2">
          Mensalidade perdida: {brl(movimento.valorPerdido, showValues)}/mês
        </p>
      )}
    </BlocoCard>
  );

  const receitaCard = (
    <BlocoCard icon={Wallet} titulo="Receita realizada" periodo={periodo.labelCurto}>
      <div>
        <p className="text-3xl font-bold">
          {loading ? '—' : canViewValues ? brl(receita.total, showValues) : '—'}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {loading ? '' : `${receita.negocios} negócio${receita.negocios !== 1 ? 's' : ''} · ${receita.orgs} organizaç${receita.orgs !== 1 ? 'ões' : 'ão'}`}
        </p>
      </div>
      <p className="text-[11px] text-muted-foreground border-t pt-2">
        Somente realizado — acompanhamento de metas é por produto (qtd e valor).
      </p>
    </BlocoCard>
  );

  const produtosCard = (
    <BlocoCard icon={Package} titulo="Produtos · meta × realizado" periodo={periodo.labelCurto}>
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : produtos.filter((p) => p.metaQty > 0).length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem metas de produto no período.</p>
      ) : (
        <div className="space-y-2">
          {produtos.filter((p) => p.metaQty > 0).slice(0, 6).map((p) => (
            <div key={p.nome}>
              <div className="flex items-center justify-between gap-2 text-xs mb-0.5">
                <span className="truncate text-foreground" title={p.nome}>{p.nome}</span>
                <span className="font-mono flex-shrink-0" style={{ color: corPct(p.pct) }}>
                  {p.realQty}/{p.metaQty} · {p.pct.toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(p.pct, 100)}%`, backgroundColor: corPct(p.pct) }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </BlocoCard>
  );

  const satisfacaoCard = (
    <BlocoCard icon={Smile} titulo="Satisfação" escopoFixo="Última pesquisa importada — não responde ao filtro de período">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-2xl font-bold font-mono">
            {satisfacao.csat != null ? `${Number(satisfacao.csat).toFixed(0)}%` : '—'}
          </p>
          <p className="text-[11px] text-muted-foreground">CSAT</p>
        </div>
        <div>
          <p className="text-2xl font-bold font-mono">
            {satisfacao.nota != null ? Number(satisfacao.nota).toFixed(1) : '—'}
          </p>
          <p className="text-[11px] text-muted-foreground">nota média</p>
        </div>
        <div>
          <p
            className="text-2xl font-bold font-mono"
            style={{ color: satisfacao.detratores > 0 ? '#ef4444' : '#16a34a' }}
          >
            {satisfacao.detratores}
          </p>
          <p className="text-[11px] text-muted-foreground">detratores</p>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground border-t pt-2">
        Última pesquisa · {satisfacao.respostas} resposta{satisfacao.respostas !== 1 ? 's' : ''}
      </p>
    </BlocoCard>
  );

  // Aviso de fallback: o período pedido não tem lançamento e a tela está
  // mostrando outro mês. Antes isso acontecia sem nenhum sinal.
  const funilFallbackNota = funilFallbackDe ? (
    <p className="text-[11px] text-amber-600 leading-snug">
      Sem lançamento em {funilFallbackDe.map(ymLabel).join(', ')} — exibindo {funilMesLabel}.
    </p>
  ) : null;

  const funilSdrCard = (
    <BlocoCard icon={FilterIcon} titulo="Funil SDR (Geral)" periodo={funilMesLabel}>
      {funilLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          {funilFallbackNota}
          <FunnelBands etapas={funilSdr} animacaoKey={funilMesLabel} />
        </>
      )}
    </BlocoCard>
  );

  const funilComercialCard = (
    <BlocoCard icon={FilterIcon} titulo="Funil Comercial (Geral)" periodo={funilMesLabel}>
      {funilLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          {funilFallbackNota}
          <FunnelBands etapas={funilComercial} animacaoKey={funilMesLabel} />
        </>
      )}
    </BlocoCard>
  );

  const funilHistogramaCard = (
    <BlocoCard
      icon={BarChart3}
      titulo={`Funis · histórico ${periodo.granularidade === 'mes' ? 'mensal' : 'trimestral'}`}
    >
      {funilLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : funilHistorico.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem lançamentos mensais ainda — lance na aba Funil de Vendas.</p>
      ) : (
        <div className="h-[190px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funilHistorico} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="sdr" name="SDR" fill="#0284c7" radius={[3, 3, 0, 0]} />
              <Bar dataKey="comercial" name="Comercial" fill="#9333ea" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </BlocoCard>
  );

  const alertasCard = (
    <BlocoCard icon={AlertTriangle} titulo="Alertas" periodo={periodo.labelCurto}>
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : alertas.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          Nenhum ponto de atenção no período.
        </div>
      ) : (
        <div className="space-y-1.5 overflow-y-auto max-h-[180px] pr-1">
          {alertas.map((a, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              {a.nivel === 'alto' ? (
                <AlertTriangle className="h-3.5 w-3.5 text-destructive flex-shrink-0 mt-0.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
              )}
              <span className="text-foreground leading-snug">{a.texto}</span>
            </div>
          ))}
        </div>
      )}
    </BlocoCard>
  );

  // Aba de mesa apenas. O telao tem view propria (`ComercialTvView`) desde
  // 19/08/2026 - o modo TV daqui foi removido junto, para ninguem manter uma
  // tela que nada renderiza.
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Visão Executiva</h2>
        <p className="text-sm text-muted-foreground">Resumo do comercial · {periodoTitulo}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {carteiraMovimentoCard}
        {receitaCard}
        {produtosCard}
        {funilSdrCard}
        {funilComercialCard}
        {satisfacaoCard}
        {funilHistogramaCard}
        {alertasCard}
      </div>
    </div>
  );
}
