import { useMemo } from 'react';
import { useComercialMovimentacao } from '@/hooks/useComercialMovimentacao';
import { useComercialMetas } from '@/hooks/useComercialMetas';
import { useComercialVendas } from '@/hooks/useComercialVendas';
import { useComercialProdutos } from '@/hooks/useComercialProdutos';
import { useSurveyResponses, useSurveyAggregates } from '@/hooks/useSurveyImport';

/**
 * Os números da Visão Executiva do Comercial, num lugar só.
 *
 * Viviam dentro da `ExecutivoTab` como uma pilha de useMemo. Saíram para cá em
 * 19/08/2026, quando o telão virou UMA tela com tudo: sem isto, a tela do telão
 * e a aba de mesa calculariam movimento, produtos, satisfação e alertas por
 * conta própria — que é exatamente a origem do bug de 30/07/2026, em que cada
 * card lia uma janela de período diferente da do vizinho.
 *
 * A regra segue a mesma: quem manda no recorte é o par (dateFrom, dateTo).
 */

const PT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** 'jul-2026' → Date. Formato em que as metas gravam o mês. */
function getMesDate(mes: string): Date | null {
  const m = mes.toLowerCase().match(/^([a-z]{3})-(\d{4})$/);
  if (!m) return null;
  const idx = PT_MONTHS.indexOf(m[1]);
  if (idx === -1) return null;
  return new Date(parseInt(m[2]), idx, 1);
}

// 0-5: ≥4.5 promotor · ≥3.5 neutro · <3.5 detrator (mesma régua da Pesquisa)
function classifyNps(avg: number | null): 'promoter' | 'neutral' | 'detractor' | null {
  if (avg == null) return null;
  if (avg >= 4.5) return 'promoter';
  if (avg >= 3.5) return 'neutral';
  return 'detractor';
}

export interface ProdutoMetaRealizado {
  nome: string;
  metaQty: number;
  realQty: number;
  pct: number;
}

export interface AlertaComercial {
  texto: string;
  nivel: 'alto' | 'medio';
}

export function useComercialExecutivo(dateFrom?: Date, dateTo?: Date) {
  const { items: movItems, isLoading: movLoading } = useComercialMovimentacao('todos', dateFrom, dateTo);
  const { data: metas = [], isLoading: metasLoading } = useComercialMetas();
  // Ordem de apresentação dos produtos: a mesma definida pelo gestor na aba Metas.
  const { produtos: catalogoProdutos, compararPorOrdem } = useComercialProdutos();
  const { items: vendasItems, isLoading: vendasLoading } = useComercialVendas();
  const { data: responses = [] } = useSurveyResponses();
  const { data: aggregates = [] } = useSurveyAggregates();

  const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const fromYm = dateFrom ? ymOf(dateFrom) : null;
  const toYm = dateTo ? ymOf(dateTo) : null;

  // ── Vendas do período ───────────────────────────────────────────────
  const vendasPeriodo = useMemo(() => {
    return vendasItems.filter((v) => {
      const ym = v.period_month?.slice(0, 7) || v.closed_date?.slice(0, 7);
      if (!ym) return false;
      if (fromYm && ym < fromYm) return false;
      if (toYm && ym > toYm) return false;
      return true;
    });
  }, [vendasItems, fromYm, toYm]);

  // ── Movimento (ganhos × perdas × saldo) ─────────────────────────────
  const movimento = useMemo(() => {
    const ganhos = movItems.filter((i) => i.tipo === 'ganho');
    const perdas = movItems.filter((i) => i.tipo === 'perda');
    const valorPerdido = perdas.reduce((s, i) => s + (i.valor_mensal ?? 0), 0);
    return { ganhos: ganhos.length, perdas: perdas.length, saldo: ganhos.length - perdas.length, valorPerdido };
  }, [movItems]);

  // ── Receita (somente realizado — não há meta de receita) ────────────
  const receita = useMemo(() => {
    const total = vendasPeriodo.reduce((s, v) => s + (v.deal_value ?? 0), 0);
    const orgs = new Set(vendasPeriodo.map((v) => v.organization || 'Outros')).size;
    return { total, negocios: vendasPeriodo.length, orgs };
  }, [vendasPeriodo]);

  // ── Produtos: meta × realizado (qtd, consolidado no período) ────────
  const produtos = useMemo<ProdutoMetaRealizado[]>(() => {
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
    const map = new Map<string, { metaQty: number; realQty: number }>();
    for (const m of metas) {
      if (m.tipo === 'faturamento') continue;
      const d = getMesDate(m.mes);
      if (!d) continue;
      const ym = ymOf(d);
      if (fromYm && ym < fromYm) continue;
      if (toYm && ym > toYm) continue;
      const acc = map.get(m.nome_indicador) ?? { metaQty: 0, realQty: 0 };
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
      .sort((a, b) => compararPorOrdem(a.nome, b.nome));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metas, vendasPeriodo, fromYm, toYm, catalogoProdutos]);

  // ── Satisfação (última pesquisa) ────────────────────────────────────
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

  // ── Alertas (produtos/clientes que exigem atenção) ──────────────────
  const alertas = useMemo<AlertaComercial[]>(() => {
    const list: AlertaComercial[] = [];
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

  return {
    movimento,
    receita,
    produtos,
    satisfacao,
    alertas,
    isLoading: movLoading || metasLoading || vendasLoading,
  };
}
