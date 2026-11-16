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
