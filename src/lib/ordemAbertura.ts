/**
 * Ordem das Tasks dentro do PBI (pedido do Igor, 19/11/2026): pela ordem de
 * abertura, com um ícone que alterna. O id do Azure DevOps cresce a cada item
 * criado na organização, então ordenar pelo id é ordenar pela abertura, sem
 * pedir a data de criação à API.
 *
 *   • padrao   — a ordem de antes (urgência da sprint, estado e id);
 *   • recentes — a aberta por último primeiro;
 *   • antigas  — a aberta primeiro primeiro.
 */
export type OrdemTasks = 'padrao' | 'recentes' | 'antigas';

export const ROTULO_ORDEM: Record<OrdemTasks, string> = {
  padrao: 'Ordem padrão',
  recentes: 'Mais novas primeiro',
  antigas: 'Mais antigas primeiro',
};

/** O próximo da volta: com `padrao`, passa por ele; sem, só alterna as duas. */
export function proximaOrdem(atual: OrdemTasks, comPadrao: boolean): OrdemTasks {
  const volta: OrdemTasks[] = comPadrao ? ['padrao', 'recentes', 'antigas'] : ['recentes', 'antigas'];
  const i = volta.indexOf(atual);
  return volta[(i + 1) % volta.length];
}

export function ordenarPorAbertura<T extends { id: number }>(itens: T[], ordem: OrdemTasks): T[] {
  if (ordem === 'padrao') return itens;
  const sinal = ordem === 'recentes' ? -1 : 1;
  return [...itens].sort((a, b) => sinal * (a.id - b.id));
}

const FECHADOS = new Set(['Done', 'Closed', 'Removed']);

/** Só To Do e In Progress (e equivalentes): Done, Closed e Removed não listam. */
export function soAbertos<T extends { state?: string | null }>(itens: T[]): T[] {
  return itens.filter((i) => !FECHADOS.has(i.state ?? ''));
}
