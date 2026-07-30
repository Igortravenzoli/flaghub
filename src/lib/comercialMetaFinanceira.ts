/**
 * Meta financeira do Comercial — régua única.
 *
 * Regra fechada com o Miller em 29/07/2026: **o valor da meta é a soma dos
 * valores definidos por produto**, não um número fixo. Até 30/07/2026 o portal
 * usava um default de R$ 110.000/mês hardcoded em três lugares diferentes
 * (MetasTab, PipeDriveTab, useComercialVendas) — quando o mês não tinha meta de
 * faturamento cadastrada, o alvo virava 110k em silêncio.
 *
 * Precedência por mês:
 *   1. meta de faturamento cadastrada (tipo='faturamento') → override explícito do gestor
 *   2. soma das metas de produto do mês → COALESCE(meta_valor_total, valor_meta × valor_unitario)
 *   3. nenhuma das duas → 0, e a tela mostra "meta não definida" (nunca um número inventado)
 */

export interface MetaLike {
  nome_indicador: string;
  tipo: string;
  mes: string;              // 'jul-2026'
  valor: string;            // quantidade da meta
  valor_unitario: string;   // R$/unidade
  meta_valor_total?: string; // meta monetária direta
}

const PT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** 'jul-2026' → '2026-07' (null quando o formato não bate). */
export function mesRefParaYm(mes: string): string | null {
  const m = mes?.toLowerCase().match(/^([a-z]{3})-(\d{4})$/);
  if (!m) return null;
  const idx = PT_MONTHS.indexOf(m[1]);
  if (idx === -1) return null;
  return `${m[2]}-${String(idx + 1).padStart(2, '0')}`;
}

/** Aceita "24,8", "24.800", "24.8k" — o formato que o form já permite digitar. */
export function parseValorMonetario(raw0?: string): number {
  const raw = (raw0 ?? '').trim().toLowerCase();
  if (!raw) return 0;
  const v = raw.endsWith('k')
    ? parseFloat(raw.slice(0, -1).replace(',', '.')) * 1000
    : parseFloat(raw.replace(',', '.'));
  return Number.isFinite(v) ? v : 0;
}

/** Valor monetário da meta de UM produto num mês. */
export function metaValorDoProduto(m: MetaLike): number {
  const direto = parseValorMonetario(m.meta_valor_total);
  if (direto > 0) return direto;
  const qtd = parseFloat(m.valor) || 0;
  const vu = parseFloat(m.valor_unitario) || 0;
  return qtd * vu;
}

export interface MetaFinanceiraMes {
  /** Σ das metas de produto do mês. */
  produtos: number;
  /** Meta de faturamento cadastrada para o mês (0 quando não existe). */
  cadastrada: number;
  /** O alvo efetivo: cadastrada quando existir, senão a soma dos produtos. */
  efetiva: number;
}

/**
 * Meta financeira por mês ('YYYY-MM'), a partir da lista completa de metas.
 * Recebe as metas JÁ filtradas pelo período da página.
 */
export function metaFinanceiraPorMes(metas: MetaLike[]): Map<string, MetaFinanceiraMes> {
  const out = new Map<string, MetaFinanceiraMes>();
  const ensure = (ym: string) => {
    let a = out.get(ym);
    if (!a) { a = { produtos: 0, cadastrada: 0, efetiva: 0 }; out.set(ym, a); }
    return a;
  };

  for (const m of metas) {
    const ym = mesRefParaYm(m.mes);
    if (!ym) continue;
    const acc = ensure(ym);
    if (m.tipo === 'faturamento') acc.cadastrada += parseValorMonetario(m.valor);
    else acc.produtos += metaValorDoProduto(m);
  }

  for (const acc of out.values()) {
    acc.efetiva = acc.cadastrada > 0 ? acc.cadastrada : acc.produtos;
  }
  return out;
}

/** Alvo do mês — 0 significa "meta não definida", nunca um default inventado. */
export function metaDoMes(mapa: Map<string, MetaFinanceiraMes>, ym: string): number {
  return mapa.get(ym)?.efetiva ?? 0;
}
