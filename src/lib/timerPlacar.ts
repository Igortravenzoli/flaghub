import { marcasDeTag, type MarcaTag } from '@/lib/fabricaClassificacao';

/**
 * Placar da coluna "Iniciar demanda" do Timer (pedido do Igor, 25/11/2026):
 * quantos itens abertos atribuídos à pessoa há por tipo (PBI, Bug, Task) e por
 * tag (Avião, Retorno QA, Priorização, Transbordo). Conta no navegador, sobre
 * os itens que a coluna já carregou: nenhuma ida a mais ao DevOps nem ao
 * Supabase. Retorno QA aqui é só a TAG (a régua da QA também olha o histórico,
 * que vive no banco).
 */
export type FiltroPlacar = 'pbi' | 'bug' | 'task' | MarcaTag;

export interface ItemPlacar {
  work_item_type?: string | null;
  state?: string | null;
  tags?: string | null;
}

export const ORDEM_TIPOS: FiltroPlacar[] = ['pbi', 'bug', 'task'];
export const ORDEM_TAGS: FiltroPlacar[] = ['aviao', 'retorno_qa', 'priorizacao', 'transbordo'];

export const ROTULO_PLACAR: Record<FiltroPlacar, [singular: string, plural: string]> = {
  pbi: ['PBI', 'PBIs'],
  bug: ['Bug', 'Bugs'],
  task: ['Task', 'Tasks'],
  aviao: ['com a tag Avião', 'com a tag Avião'],
  retorno_qa: ['com a tag Retorno QA', 'com a tag Retorno QA'],
  priorizacao: ['com a tag Priorização', 'com a tag Priorização'],
  transbordo: ['com a tag Transbordo', 'com a tag Transbordo'],
};

const FECHADOS = new Set(['Done', 'Closed', 'Removed']);

function tipoDo(item: ItemPlacar): FiltroPlacar | null {
  switch (item.work_item_type) {
    case 'Product Backlog Item':
    case 'User Story':
      return 'pbi';
    case 'Bug':
      return 'bug';
    case 'Task':
      return 'task';
    default:
      return null;
  }
}

export function itemAberto(item: ItemPlacar): boolean {
  return !FECHADOS.has(item.state ?? '');
}

/** O item entra no filtro? (só itens abertos entram em qualquer filtro) */
export function bateFiltro(item: ItemPlacar, filtro: FiltroPlacar): boolean {
  if (!itemAberto(item)) return false;
  if (filtro === 'pbi' || filtro === 'bug' || filtro === 'task') return tipoDo(item) === filtro;
  return marcasDeTag(item.tags).includes(filtro);
}

export interface Placar {
  tipos: { chave: FiltroPlacar; n: number }[];
  tags: { chave: FiltroPlacar; n: number }[];
}

/** Só o que tem ao menos 1 aparece, na ordem fixa. */
export function contarPlacar(itens: ItemPlacar[]): Placar {
  const n = new Map<FiltroPlacar, number>();
  for (const i of itens) {
    if (!itemAberto(i)) continue;
    const t = tipoDo(i);
    if (t) n.set(t, (n.get(t) ?? 0) + 1);
    for (const m of marcasDeTag(i.tags)) n.set(m, (n.get(m) ?? 0) + 1);
  }
  const lista = (ordem: FiltroPlacar[]) => ordem.filter((k) => (n.get(k) ?? 0) > 0).map((k) => ({ chave: k, n: n.get(k)! }));
  return { tipos: lista(ORDEM_TIPOS), tags: lista(ORDEM_TAGS) };
}

/** Número curto: acima de 99 vira "99+". */
export const numeroCurto = (n: number) => (n > 99 ? '99+' : String(n));
