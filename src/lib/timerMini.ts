/**
 * O que o mini timer mostra (25/11/2026).
 *
 *  • Parado: a última tarefa escolhida só aparece (com o ▶ de retomar) se a
 *    demanda dela continua ABERTA. Encerrou, some: "Sem timer ativo". Antes o
 *    mini lia só a escolha guardada no navegador e seguia oferecendo o ▶ numa
 *    demanda já encerrada.
 *  • Com timers em paralelo: mostra um por vez, com "1/2"; o clique passa ao
 *    próximo. Pausar e Encerrar valem para o que está à vista.
 */

interface ComItem {
  work_item_id: number;
}

/**
 * A escolha guardada vale? Só com a demanda aberta. `demandasAbertas` nulo =
 * o estado ainda não chegou do servidor: não oferece nada.
 */
export function selecaoAberta<S extends { id: number }>(sel: S | null, demandasAbertas: ComItem[] | null): S | null {
  if (!sel || !demandasAbertas) return null;
  return demandasAbertas.some((d) => d.work_item_id === sel.id) ? sel : null;
}

/** Qual dos que rodam o mini mostra: o preferido, se ainda roda; senão o mais recente (o primeiro). */
export function timerExibido<T extends ComItem>(rodando: T[], preferido: number | null): { item: T | null; posicao: number } {
  if (rodando.length === 0) return { item: null, posicao: -1 };
  const i = preferido == null ? 0 : rodando.findIndex((r) => r.work_item_id === preferido);
  const posicao = i < 0 ? 0 : i;
  return { item: rodando[posicao], posicao };
}

/** O próximo da roda (volta ao primeiro depois do último). */
export function proximoExibido(rodando: ComItem[], atual: number | null): number | null {
  if (rodando.length === 0) return null;
  const i = rodando.findIndex((r) => r.work_item_id === atual);
  return rodando[(i + 1) % rodando.length].work_item_id;
}

/** Começou um timer que não rodava antes? (aí o mini passa a mostrar o novo) */
export function entrouTimerNovo(antes: number[], agora: number[]): boolean {
  return agora.some((id) => !antes.includes(id));
}

/** Dica do "1/2": todos os que rodam, um por linha. */
export function dicaParalelos(rodando: (ComItem & { titulo: string })[]): string {
  return [`${rodando.length} timers em paralelo (clique para ver o próximo):`, ...rodando.map((r) => `#${r.work_item_id} ${r.titulo}`)].join('\n');
}
