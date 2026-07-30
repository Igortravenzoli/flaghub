/**
 * Fonte ÚNICA de classificação de demanda da Fábrica no front.
 *
 * Espelho literal de `public.fn_classifica_demanda(p_type, p_tags)`
 * (migration 20260610100000_snapshot_category_breakdown.sql:17), que é o
 * classificador canônico — é ele que carimba `category_breakdown` das
 * fotografias de sprint. Front e foto DIVERGIAM porque a mesma regra estava
 * reescrita em 4 lugares com desvios diferentes (auditoria de 29/07/2026):
 *
 *   - `GerenciaTab.classifyItem`            — fiel
 *   - `FabricaDashboard.isNaoPrevistoManagerItem` — testava `type === 'Bug'` ANTES
 *     da tag Priorização, então **bug priorizado caía em "não previsto"**; era a
 *     causa medida do 89 × 88 em S15-2026 (1 item)
 *   - `fabricaTvSeries.categoriaDoItem`     — ignorava Priorização e usava regex
 *     sem âncora de segmento (casava substring)
 *   - bloco inline duplicado em `FabricaExecutivoTab` e `FabricaTvView`
 *
 * PRECEDÊNCIA (não reordenar sem mudar o SQL junto):
 *   retorno_qa > avião (sprint/transbordado) > priorização (pura/transbordo,
 *   INCLUI bug priorizado) > bug > priorização.
 *
 * As regexes são ancoradas em SEGMENTO de tag (separador `;`), igual ao SQL.
 * Exceção proposital: `avi[aã]o\b` usa fronteira de palavra (o `\M` do Postgres)
 * para casar variantes compostas legadas — "AVIAO ANTIGO", "AVIAO TRANSBORDADO".
 */

export type CategoriaDemanda =
  | 'priorizacao'
  | 'priorizacao_transbordo'
  | 'bug'
  | 'retorno_qa'
  | 'aviao_sprint'
  | 'aviao_transbordado';

/** Item com o mínimo que a classificação precisa. */
export type ItemClassificavel = {
  work_item_type?: string | null;
  tags?: string | null;
};

const RE_RETORNO_QA = /(^|;)\s*retorno\s*(de\s*)?qa\s*(;|$)/i;
const RE_AVIAO = /(^|;)\s*avi[aã]o\b/i;
const RE_TRANSBORDO = /(^|;)\s*transbord(o|ad[oa])\s*(;|$)/i;
const RE_AVIAO_COMPOSTO = /(^|;)\s*avi[aã]o\s+(antigo|transbordad[oa])\s*(;|$)/i;
const RE_PRIORIZACAO = /(^|;)\s*prioriza[cç][aã]o\s*(;|$)/i;
const RE_TAG_BUG = /(^|;)\s*bug\s*(;|$)/i;

/** Tipos que entram na régua do gestor (Tasks contam horas, não demanda). */
const TIPOS_DE_GESTOR = new Set(['Product Backlog Item', 'User Story', 'Bug']);

export function ehItemDeGestor(workItemType: string | null | undefined): boolean {
  return TIPOS_DE_GESTOR.has(workItemType || '');
}

/** Classificação canônica. Mesma saída de `fn_classifica_demanda`. */
export function classificaDemanda(item: ItemClassificavel): CategoriaDemanda {
  const tags = item.tags || '';

  if (RE_RETORNO_QA.test(tags)) return 'retorno_qa';

  if (RE_AVIAO.test(tags)) {
    return (RE_TRANSBORDO.test(tags) || RE_AVIAO_COMPOSTO.test(tags))
      ? 'aviao_transbordado'
      : 'aviao_sprint';
  }

  if (RE_PRIORIZACAO.test(tags)) {
    return RE_TRANSBORDO.test(tags) ? 'priorizacao_transbordo' : 'priorizacao';
  }

  if (item.work_item_type === 'Bug' || RE_TAG_BUG.test(tags)) return 'bug';

  return 'priorizacao';
}

// ── Projeções ────────────────────────────────────────────────────────────────
// Os consumidores não querem a categoria crua: querem booleanos e rótulo. Elas
// vivem aqui de propósito — foi a ausência delas que fez cada tela reescrever a
// regra. Nenhuma regex de tag deve nascer fora deste arquivo.

export function ehPriorizado(cat: CategoriaDemanda): boolean {
  return cat === 'priorizacao' || cat === 'priorizacao_transbordo';
}

export function ehAviao(cat: CategoriaDemanda): boolean {
  return cat === 'aviao_sprint' || cat === 'aviao_transbordado';
}

/** "Não priorizado" = bug + retorno QA + avião (o que entrou sem ser planejado). */
export function ehNaoPriorizado(cat: CategoriaDemanda): boolean {
  return !ehPriorizado(cat);
}

/** Atalho para quem só quer o booleano a partir do item. */
export function itemEhNaoPriorizado(item: ItemClassificavel): boolean {
  return ehNaoPriorizado(classificaDemanda(item));
}

/** Rótulo de UI, único no produto. */
export function rotuloCategoria(cat: CategoriaDemanda): string {
  switch (cat) {
    case 'retorno_qa': return 'Retorno QA';
    case 'aviao_sprint': return 'Avião';
    case 'aviao_transbordado': return 'Avião Transbordado';
    case 'bug': return 'Bug';
    case 'priorizacao_transbordo': return 'Priorizado (transbordo)';
    case 'priorizacao': return 'Priorizado';
  }
}

/** Contagem por categoria — o formato que os cards consomem. */
export type ContagemCategorias = {
  total: number;
  priorizado: number;
  priorizadoTransbordo: number;
  naoPriorizado: number;
  bug: number;
  retornoQa: number;
  aviaoSprint: number;
  aviaoTransbordado: number;
};

export function contaCategorias(itens: ItemClassificavel[]): ContagemCategorias {
  const c: ContagemCategorias = {
    total: 0, priorizado: 0, priorizadoTransbordo: 0, naoPriorizado: 0,
    bug: 0, retornoQa: 0, aviaoSprint: 0, aviaoTransbordado: 0,
  };
  for (const item of itens) {
    const cat = classificaDemanda(item);
    c.total += 1;
    if (cat === 'priorizacao') c.priorizado += 1;
    else if (cat === 'priorizacao_transbordo') { c.priorizado += 1; c.priorizadoTransbordo += 1; }
    else if (cat === 'bug') c.bug += 1;
    else if (cat === 'retorno_qa') c.retornoQa += 1;
    else if (cat === 'aviao_sprint') c.aviaoSprint += 1;
    else c.aviaoTransbordado += 1;
  }
  c.naoPriorizado = c.bug + c.retornoQa + c.aviaoSprint + c.aviaoTransbordado;
  return c;
}
