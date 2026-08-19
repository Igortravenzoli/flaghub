/**
 * Contrato único de período do setor Comercial.
 *
 * Antes deste arquivo cada aba recortava o período à mão (ExecutivoTab, MetasTab,
 * FunilVendasTab) com regras ligeiramente diferentes — era a raiz da incoerência
 * entre a Visão Executiva, a aba de Metas e o modo TV.
 *
 * Regra de ouro: **nenhum número sem janela declarada ao lado**. Todo card que
 * agrega por período usa `label`/`labelCurto` daqui, nunca um rótulo próprio.
 */

export const PT_MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;

export const PT_MESES_LONGOS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const;

/** Mês corrente no formato 'YYYY-MM'. */
export function ymNow(): string {
  return ymOf(new Date());
}

/** Date → 'YYYY-MM'. */
export function ymOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 'YYYY-MM' → 'jul/26'. */
export function ymLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${PT_MESES[parseInt(m, 10) - 1] ?? m}/${y.slice(2)}`;
}

/** 'YYYY-MM' → 1..4 */
export function trimestreDoMes(ym: string): number {
  const m = parseInt(ym.split('-')[1], 10);
  return Math.floor((m - 1) / 3) + 1;
}

/** 'YYYY-MM' → '2026-Q3' */
export function qKeyDoMes(ym: string): string {
  return `${ym.slice(0, 4)}-Q${trimestreDoMes(ym)}`;
}

/** '2026-Q3' → ['2026-07','2026-08','2026-09'] */
export function mesesDoTrimestre(qKey: string): string[] {
  const [y, q] = qKey.split('-Q');
  const start = (parseInt(q, 10) - 1) * 3;
  return [0, 1, 2].map(i => `${y}-${String(start + i + 1).padStart(2, '0')}`);
}

/** '2026-Q3' → 'Q3 2026 · jul–set' */
export function qLabel(qKey: string, comMeses = true): string {
  const [y, q] = qKey.split('-Q');
  if (!comMeses) return `Q${q} ${y}`;
  const start = (parseInt(q, 10) - 1) * 3;
  return `Q${q} ${y} · ${PT_MESES[start]}–${PT_MESES[start + 2]}`;
}

/** '2026-01' → '2025-12' */
export function ymAnterior(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** '2026-Q1' → '2025-Q4' */
export function qKeyAnterior(qKey: string): string {
  const [y, q] = qKey.split('-Q').map(Number);
  return q === 1 ? `${y - 1}-Q4` : `${y}-Q${q - 1}`;
}

/** Lista de meses 'YYYY-MM' de `from` até `to`, inclusive. */
export function mesesEntre(from: Date, to: Date): string[] {
  const out: string[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  // Guarda-corpo: período invertido devolve só o mês inicial em vez de laço infinito.
  if (cur > end) return [ymOf(cur)];
  while (cur <= end) {
    out.push(ymOf(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

export type Granularidade = 'mes' | 'trimestre' | 'multi';

export interface PeriodoComercial {
  /** Meses cobertos pelo período, em ordem crescente ('YYYY-MM'). Nunca vazio. */
  meses: string[];
  /** Trimestres tocados pelo período ('YYYY-Q3'). */
  trimestres: string[];
  granularidade: Granularidade;
  /** Rótulo completo — usar em headers e no telão. Ex.: 'Q3 2026 · jul–set'. */
  label: string;
  /** Rótulo curto — usar em título de card. Ex.: 'Q3 2026'. */
  labelCurto: string;
}

/**
 * Traduz o filtro de data da página no recorte que as abas realmente usam.
 * Sem argumentos → mês corrente.
 */
export function resolvePeriodo(dateFrom?: Date, dateTo?: Date): PeriodoComercial {
  const hoje = new Date();
  const from = dateFrom ?? new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const to = dateTo ?? hoje;
  const meses = mesesEntre(from, to);
  const trimestres = [...new Set(meses.map(qKeyDoMes))];

  if (meses.length === 1) {
    return { meses, trimestres, granularidade: 'mes', label: ymLabel(meses[0]), labelCurto: ymLabel(meses[0]) };
  }

  // Trimestre "cheio": 3 meses, todos do mesmo trimestre.
  if (meses.length === 3 && trimestres.length === 1 && mesesDoTrimestre(trimestres[0]).every(m => meses.includes(m))) {
    return {
      meses,
      trimestres,
      granularidade: 'trimestre',
      label: qLabel(trimestres[0]),
      labelCurto: qLabel(trimestres[0], false),
    };
  }

  const l = `${ymLabel(meses[0])} – ${ymLabel(meses[meses.length - 1])}`;
  return { meses, trimestres, granularidade: 'multi', label: l, labelCurto: l };
}

/**
 * Uma visão do filtro do funil: um mês do trimestre ou o acumulado dele.
 *
 * É o "modelo reutilizável para as 3 visões" do material da reunião quinzenal:
 * na mesa cada visão é uma aba clicável; no telão cada visão é uma página da
 * rotação (não há operador para clicar num filtro).
 */
export interface VisaoTrimestre {
  /** '2026-07' para mês · '2026-Q3' para o acumulado. */
  key: string;
  /**
   * Rótulo da aba: 'Julho' · 'Acumulado'.
   *
   * O acumulado NÃO carrega o trimestre no nome. Qual trimestre está no ar já
   * está no selo do topo da tela ('Q3 2026 · jul–set'), que sai do calendário;
   * repetir "Q3" na aba só cria mais um lugar para envelhecer na virada do Q4.
   */
  label: string;
  /** Rótulo curto para selo/badge: 'jul/26' · 'Q3 2026'. */
  labelCurto: string;
  /** Meses cobertos — o que vai para `useComercialFunil`. */
  meses: string[];
  tipo: 'mes' | 'acumulado';
}

/**
 * Visões do trimestre vigente: uma por mês JÁ INICIADO, mais o acumulado.
 *
 * Em ago/2026 (Q3) devolve Julho · Agosto · Acumulado Q3 — exatamente o que o
 * modelo pede. Em setembro entra Setembro sozinho; em janeiro (Q1, mês 1) sai
 * só Janeiro. A lista sai do calendário, nunca de constante no código.
 *
 * O acumulado só aparece com 2+ meses: no primeiro mês do trimestre ele seria
 * uma cópia idêntica da aba do mês — aba que não muda nada é ruído no telão.
 */
export function visoesDoTrimestre(ref: Date = new Date()): VisaoTrimestre[] {
  const qKey = qKeyDoMes(ymOf(ref));
  const doTrimestre = mesesDoTrimestre(qKey);
  const atual = ymOf(ref);
  // Guarda-corpo: `ref` sempre cai dentro do próprio trimestre, então o filtro
  // nunca devolve vazio — mas se devolvesse, o primeiro mês segura a tela.
  const iniciados = doTrimestre.filter(m => m <= atual);
  const meses = iniciados.length > 0 ? iniciados : [doTrimestre[0]];

  const visoes: VisaoTrimestre[] = meses.map(m => ({
    key: m,
    label: PT_MESES_LONGOS[parseInt(m.split('-')[1], 10) - 1],
    labelCurto: ymLabel(m),
    meses: [m],
    tipo: 'mes',
  }));

  if (meses.length > 1) {
    visoes.push({
      key: qKey,
      label: 'Acumulado',
      labelCurto: qLabel(qKey, false),
      meses,
      tipo: 'acumulado',
    });
  }

  return visoes;
}

/** Trimestre vigente — usado pelo modo TV (escopo fixo, sem operador no telão). */
export function trimestreVigente(ref: Date = new Date()): {
  from: Date;
  to: Date;
  qKey: string;
  label: string;
  labelCurto: string;
} {
  const y = ref.getFullYear();
  const q = Math.floor(ref.getMonth() / 3) + 1;
  const qKey = `${y}-Q${q}`;
  const startMo = (q - 1) * 3;
  return {
    from: new Date(y, startMo, 1, 0, 0, 0),
    to: new Date(y, startMo + 3, 0, 23, 59, 59),
    qKey,
    label: qLabel(qKey),
    labelCurto: qLabel(qKey, false),
  };
}
