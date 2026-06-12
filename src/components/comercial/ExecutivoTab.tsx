import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import {
  Users, TrendingUp, TrendingDown, Wallet, Package, Smile, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { useComercialMovimentacao } from '@/hooks/useComercialMovimentacao';
import { useComercialMetas } from '@/hooks/useComercialMetas';
import { useComercialVendas } from '@/hooks/useComercialVendas';
import { useSurveyResponses, useSurveyAggregates } from '@/hooks/useSurveyImport';

const PT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function getMesDate(mes: string): Date | null {
  const m = mes.toLowerCase().match(/^([a-z]{3})-(\d{4})$/);
  if (!m) return null;
  const idx = PT_MONTHS.indexOf(m[1]);
  if (idx === -1) return null;
  return new Date(parseInt(m[2]), idx, 1);
}

function brl(value: number, show: boolean): React.ReactNode {
  if (!show) return <span className="font-mono tracking-widest text-muted-foreground">R$ •••</span>;
  return <span className="font-mono">{value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>;
}

// 0-5: ≥4.5 promotor · ≥3.5 neutro · <3.5 detrator (mesma régua da Pesquisa)
function classifyNps(avg: number | null): 'promoter' | 'neutral' | 'detractor' | null {
  if (avg == null) return null;
  if (avg >= 4.5) return 'promoter';
  if (avg >= 3.5) return 'neutral';
  return 'detractor';
}

const corPct = (p: number) => (p >= 100 ? '#16a34a' : p >= 70 ? '#f59e0b' : '#ef4444');

function BlocoCard({
  icon: Icon,
  titulo,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border bg-muted/40">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{titulo}</p>
      </div>
      {children}
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
  const { items: movItems, isLoading: movLoading } = useComercialMovimentacao('todos', dateFrom, dateTo);
  const { data: metas = [], isLoading: metasLoading } = useComercialMetas();
  const { items: vendasItems, isLoading: vendasLoading } = useComercialVendas();
  const { data: responses = [] } = useSurveyResponses();
  const { data: aggregates = [] } = useSurveyAggregates();

  const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const fromYm = dateFrom ? ymOf(dateFrom) : null;
  const toYm = dateTo ? ymOf(dateTo) : null;

  // ── Vendas do período ─────────────────────────────────────────
  const vendasPeriodo = useMemo(() => {
    return vendasItems.filter((v) => {
      const ym = v.period_month?.slice(0, 7) || v.closed_date?.slice(0, 7);
      if (!ym) return false;
      if (fromYm && ym < fromYm) return false;
      if (toYm && ym > toYm) return false;
      return true;
    });
  }, [vendasItems, fromYm, toYm]);

  // ── Movimento (ganhos × perdas × saldo) ───────────────────────
  const movimento = useMemo(() => {
    const ganhos = movItems.filter((i) => i.tipo === 'ganho');
    const perdas = movItems.filter((i) => i.tipo === 'perda');
    const valorPerdido = perdas.reduce((s, i) => s + (i.valor_mensal ?? 0), 0);
    return { ganhos: ganhos.length, perdas: perdas.length, saldo: ganhos.length - perdas.length, valorPerdido };
  }, [movItems]);

  // ── Receita (somente realizado — não há meta de receita) ──────
  const receita = useMemo(() => {
    const total = vendasPeriodo.reduce((s, v) => s + (v.deal_value ?? 0), 0);
    const orgs = new Set(vendasPeriodo.map((v) => v.organization || 'Outros')).size;
    return { total, negocios: vendasPeriodo.length, orgs };
  }, [vendasPeriodo]);

  // ── Produtos: meta × realizado (qtd, consolidado no período) ──
  const produtos = useMemo(() => {
    // qty vendida por produto+mês (itens de venda)
    const vendaQty = new Map<string, number>();
    for (const v of vendasPeriodo) {
      const ym = v.period_month?.slice(0, 7) || v.closed_date?.slice(0, 7);
      if (!ym) continue;
      for (const it of v.itens ?? []) {
        const k = `${it.produto}|${ym}`;
        vendaQty.set(k, (vendaQty.get(k) ?? 0) + (it.quantidade || 0));
      }
    }
    const map = new Map<string, { metaQty: number; realQty: number; semRealizado: boolean }>();
    for (const m of metas) {
      if (m.tipo === 'faturamento') continue;
      const d = getMesDate(m.mes);
      if (!d) continue;
      const ym = ymOf(d);
      if (fromYm && ym < fromYm) continue;
      if (toYm && ym > toYm) continue;
      const acc = map.get(m.nome_indicador) ?? { metaQty: 0, realQty: 0, semRealizado: true };
      acc.metaQty += parseFloat(m.valor) || 0;
      acc.realQty += (parseInt(m.realizado) || 0) + (vendaQty.get(`${m.nome_indicador}|${ym}`) ?? 0);
      map.set(m.nome_indicador, acc);
    }
    return [...map.entries()]
      .map(([nome, a]) => ({
        nome,
        metaQty: a.metaQty,
        realQty: a.realQty,
        pct: a.metaQty > 0 ? Math.round((a.realQty / a.metaQty) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.metaQty - a.metaQty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metas, vendasPeriodo, fromYm, toYm]);

  // ── Satisfação (última pesquisa) ──────────────────────────────
  const satisfacao = useMemo(() => {
    const summary = aggregates[0]?.payload?.summary;
    let detratores = 0;
    const detratoresNomes: string[] = [];
    for (const r of responses) {
      if (classifyNps(r.derived?.avg_score ?? null) === 'detractor') {
        detratores++;
        if (r.client_name) detratoresNomes.push(r.client_name);
      }
    }
    return {
      nota: summary?.nota_media_geral ?? null,
      csat: summary?.csat_geral ?? null,
      respostas: summary?.total_clientes_pesquisados ?? responses.length,
      detratores,
      detratoresNomes,
    };
  }, [aggregates, responses]);

  // ── Alertas (produtos/clientes que exigem atenção) ────────────
  const alertas = useMemo(() => {
    const list: { texto: string; nivel: 'alto' | 'medio' }[] = [];
    for (const p of produtos) {
      if (p.metaQty > 0 && p.pct < 70) {
        list.push({
          texto: `${p.nome}: ${p.pct.toFixed(0)}% da meta (${p.realQty}/${p.metaQty})`,
          nivel: p.pct < 30 ? 'alto' : 'medio',
        });
      }
    }
    if (movimento.perdas > 0) {
      list.push({ texto: `${movimento.perdas} perda${movimento.perdas !== 1 ? 's' : ''} de cliente no período`, nivel: 'alto' });
    }
    if (satisfacao.detratores > 0) {
      const nomes = satisfacao.detratoresNomes.slice(0, 3).join(', ');
      list.push({
        texto: `${satisfacao.detratores} cliente${satisfacao.detratores !== 1 ? 's' : ''} detrator${satisfacao.detratores !== 1 ? 'es' : ''} na pesquisa${nomes ? ` (${nomes}${satisfacao.detratores > 3 ? '…' : ''})` : ''}`,
        nivel: 'alto',
      });
    }
    return list.sort((a, b) => (a.nivel === 'alto' ? -1 : 1) - (b.nivel === 'alto' ? -1 : 1));
  }, [produtos, movimento.perdas, satisfacao]);

  const loading = movLoading || metasLoading || vendasLoading;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Visão Executiva</h2>
        <p className="text-sm text-muted-foreground">Resumo do comercial · {periodLabel ?? 'período selecionado'}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* 1 — Carteira */}
        <BlocoCard icon={Users} titulo="Carteira">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold font-mono">{isLoadingClientes ? '—' : clientesAtivos}</p>
              <p className="text-xs text-muted-foreground mt-0.5">clientes ativos</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold font-mono text-destructive">{isLoadingClientes ? '—' : clientesBloqueados}</p>
              <p className="text-[11px] text-muted-foreground">bloqueados</p>
            </div>
          </div>
        </BlocoCard>

        {/* 2 — Movimento */}
        <BlocoCard icon={TrendingUp} titulo="Movimento">
          <div className="grid grid-cols-3 gap-2">
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

        {/* 3 — Receita (somente realizado; metas são por produto) */}
        <BlocoCard icon={Wallet} titulo="Receita realizada">
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

        {/* 4 — Produtos: meta × realizado */}
        <BlocoCard icon={Package} titulo="Produtos · meta × realizado">
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

        {/* 5 — Satisfação */}
        <BlocoCard icon={Smile} titulo="Satisfação">
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

        {/* 6 — Alertas */}
        <BlocoCard icon={AlertTriangle} titulo="Alertas">
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
      </div>
    </div>
  );
}
