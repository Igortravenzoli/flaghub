/**
 * A tarefa escolhida no Timer, guardada por navegador (conveniência: sobrevive
 * ao recarregar). A partir da fase do cronômetro, o que vale é o timer no
 * servidor; isto é só a pré-seleção da tela.
 */
export interface TarefaSelecionada {
  id: number;
  title: string | null;
  work_item_type: string | null;
  /** "Epic › Feature › PBI", para a pessoa saber onde está. */
  caminho: string | null;
  web_url: string | null;
  /** Team project no Azure DevOps (só para exibir; o servidor confere ao lançar). */
  projeto?: string | null;
}

const CHAVE = 'timer-flag:tarefa-selecionada';

/** Só Task, PBI e Bug recebem hora (Epic e Feature são guarda-chuva). */
export const TIPOS_SELECIONAVEIS = new Set(['Task', 'Product Backlog Item', 'Bug']);

export function lerSelecao(storage: Pick<Storage, 'getItem'> | null = local()): TarefaSelecionada | null {
  try {
    const bruto = storage?.getItem(CHAVE);
    if (!bruto) return null;
    const v = JSON.parse(bruto) as Partial<TarefaSelecionada>;
    if (typeof v.id !== 'number' || !Number.isInteger(v.id) || v.id <= 0) return null;
    return {
      id: v.id,
      title: typeof v.title === 'string' ? v.title : null,
      work_item_type: typeof v.work_item_type === 'string' ? v.work_item_type : null,
      caminho: typeof v.caminho === 'string' ? v.caminho : null,
      web_url: typeof v.web_url === 'string' && v.web_url.startsWith('https://dev.azure.com/') ? v.web_url : null,
      projeto: typeof v.projeto === 'string' ? v.projeto : null,
    };
  } catch {
    return null;
  }
}

export function gravarSelecao(
  sel: TarefaSelecionada | null,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = local(),
): void {
  try {
    if (!storage) return;
    if (sel) storage.setItem(CHAVE, JSON.stringify(sel));
    else storage.removeItem(CHAVE);
  } catch {
    // storage bloqueado: a seleção vale só nesta tela
  }
}

function local(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

interface ComPai {
  id: number;
  title: string | null;
  parent_id: number | null;
}

/** "Epic › Feature › PBI" a partir do item, subindo pelos ancestrais conhecidos. */
export function caminhoDe(item: ComPai, conhecidos: Map<number, ComPai>): string | null {
  const nomes: string[] = [];
  let cur = item.parent_id != null ? conhecidos.get(item.parent_id) : undefined;
  for (let n = 0; cur && n < 6; n++) {
    nomes.unshift(cur.title ?? `#${cur.id}`);
    cur = cur.parent_id != null ? conhecidos.get(cur.parent_id) : undefined;
  }
  return nomes.length > 0 ? nomes.join(' › ') : null;
}

// ─── anotação → Task: os PBIs da sprint corrente ─────────────────────────────

const FECHADOS = new Set(['Done', 'Closed', 'Removed']);
const PAIS_DE_TASK = new Set(['Product Backlog Item', 'Bug']);

interface ItemSprint {
  id: number;
  state: string | null;
  work_item_type: string | null;
  parent_id: number | null;
  iteration_path: string | null;
}

const sprintDe = (iterationPath: string | null) => iterationPath?.match(/S\d+-\d{4}/i)?.[0].toUpperCase() ?? null;

/**
 * Onde a anotação pode virar Task sem descer a árvore (pedido do Igor,
 * 17/11/2026): os PBIs/Bugs abertos da sprint corrente que são da pessoa —
 * atribuídos a ela, ou pai de uma Task dela aberta na sprint. Primeiro os
 * atribuídos, depois os mais novos.
 */
export function pbisDaSprint<T extends ItemSprint>(itens: T[], ancestrais: T[], sprint: string): T[] {
  const alvo = sprint.toUpperCase();
  const porId = new Map<number, T>();
  for (const i of [...ancestrais, ...itens]) porId.set(i.id, i);
  const meus = new Set(itens.map((i) => i.id));
  const aberto = (i: T) => !FECHADOS.has(i.state ?? '');

  const ids = new Set<number>();
  for (const i of itens) {
    if (!aberto(i) || sprintDe(i.iteration_path) !== alvo) continue;
    if (PAIS_DE_TASK.has(i.work_item_type ?? '')) ids.add(i.id);
    else if (i.work_item_type === 'Task' && i.parent_id != null) ids.add(i.parent_id);
  }
  return [...ids]
    .map((id) => porId.get(id))
    .filter((p): p is T => !!p && PAIS_DE_TASK.has(p.work_item_type ?? '') && aberto(p))
    .sort((a, b) => Number(meus.has(b.id)) - Number(meus.has(a.id)) || b.id - a.id);
}
