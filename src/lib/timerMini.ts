/**
 * O que o mini timer mostra (25/11/2026).
 *
 *  • Parado: o ▶ de retomar a última tarefa escolhida só existe se a demanda
 *    dela continua ABERTA, e a pílula diz "Retomar: <tarefa>"; sem isso, diz
 *    "Sem timer ativo". Antes o mini lia só a escolha guardada no navegador e
 *    seguia oferecendo o ▶ numa demanda já encerrada.
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

/**
 * Dica do ▶ com o mini parado: diz o que será retomado. O nome da tarefa não
 * aparece na pílula sem timer rodando (parecia um timer aberto nela).
 */
export function rotuloRetomar(sel: { id: number; title?: string | null }): string {
  const titulo = (sel.title ?? '').trim();
  return titulo ? `Retomar #${sel.id} ${titulo}` : `Retomar #${sel.id}`;
}

/**
 * O texto da pílula sem timer rodando: o que o ▶ vai retomar, ou "Sem timer
 * ativo" quando não há nada a retomar. O "Retomar:" na frente é o que separa
 * isto de um timer aberto na tarefa.
 */
export function textoDoMiniParado(retomavel: { id: number; title?: string | null } | null): string {
  if (!retomavel) return 'Sem timer ativo';
  const titulo = (retomavel.title ?? '').trim();
  return `Retomar: ${titulo || `#${retomavel.id}`}`;
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
