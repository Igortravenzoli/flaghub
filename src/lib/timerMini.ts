/**
 * O que o mini timer mostra (25/11/2026).
 *
 *  • Parado: a pílula diz "Sem timer ativo", sem nome de tarefa. O ▶ retoma a
 *    última tarefa trabalhada cuja demanda continua ABERTA (`ultimaTrabalhada`,
 *    pelo estado do servidor); a dica do botão diz qual é. Antes o mini lia a
 *    escolha guardada no navegador e oferecia o ▶ numa demanda já encerrada ou
 *    numa tarefa anterior à que acabou de ser pausada.
 *  • Com timers em paralelo: mostra um por vez, com "1/2"; o clique passa ao
 *    próximo. Pausar e Encerrar valem para o que está à vista.
 */

interface ComItem {
  work_item_id: number;
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
 * A última tarefa trabalhada que ainda dá para retomar: entre as demandas
 * ABERTAS, a do trecho que parou por último; sem trecho fechado à vista (dia
 * novo, por exemplo), a demanda mexida por último. Vem do estado do servidor,
 * então vale também para o que foi iniciado por outro caminho (anotação que
 * virou Task, reunião, outra janela), que a escolha guardada no navegador não
 * via. Sem demanda aberta, null.
 */
export function ultimaTrabalhada<D extends ComItem & { ultima_atividade_em: string }>(
  demandasAbertas: D[],
  trechos: (ComItem & { encerrado_em: string; descartado?: boolean })[],
): D | null {
  if (demandasAbertas.length === 0) return null;
  let melhor: D | null = null;
  let quando = -Infinity;
  for (const t of trechos) {
    if (t.descartado) continue;
    const fim = Date.parse(t.encerrado_em);
    if (!(fim > quando)) continue;
    const d = demandasAbertas.find((x) => x.work_item_id === t.work_item_id);
    if (d) {
      melhor = d;
      quando = fim;
    }
  }
  if (melhor) return melhor;
  return demandasAbertas.reduce((a, b) => (Date.parse(b.ultima_atividade_em) > Date.parse(a.ultima_atividade_em) ? b : a));
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
