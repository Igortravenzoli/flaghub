/**
 * Encerrar um PBI ou Bug pelo Timer (25/11/2026): para onde o item vai no
 * Azure DevOps. A tela oferece os estados do tipo (lidos do DevOps pela edge)
 * e sugere o de conclusão; a pessoa pode escolher um passo intermediário
 * (ex.: Aguardando Teste) ou manter como está. Quem grava é a edge, que
 * confere de novo o estado e se o item é da pessoa.
 */

/** Valor do seletor para "não mexer no estado". */
export const MANTER_ESTADO = '__manter__';

interface InfoEstados {
  estado: string;
  estados: { nome: string; categoria: string }[];
  concluido: string | null;
}

/** Os destinos possíveis: os estados do tipo, na ordem do fluxo, menos o de hoje. */
export function opcoesDeDestino(info: InfoEstados): string[] {
  const atual = info.estado.trim().toLowerCase();
  const vistos = new Set<string>();
  const nomes: string[] = [];
  for (const e of info.estados) {
    const nome = e.nome.trim();
    const chave = nome.toLowerCase();
    if (!nome || chave === atual || vistos.has(chave)) continue;
    vistos.add(chave);
    nomes.push(nome);
  }
  return nomes;
}

/**
 * Por que este destino não pode ser escolhido agora, ou null se pode. PBI e
 * Bug só vão para um estado de conclusão sem filho aberto (regra do Igor,
 * 26/11/2026); os passos intermediários seguem livres. A edge barra de novo.
 */
export function bloqueioDoDestino(
  info: { estados: { nome: string; categoria: string }[]; filhosAbertos?: number[] | null },
  destino: string,
): string | null {
  const abertos = info.filhosAbertos ?? [];
  if (abertos.length === 0) return null;
  const alvo = destino.trim().toLowerCase();
  const conclui = info.estados.some((e) => e.categoria === 'Completed' && e.nome.trim().toLowerCase() === alvo);
  if (!conclui) return null;
  const lista = abertos.slice(0, 4).map((id) => `#${id}`).join(', ') + (abertos.length > 4 ? ` e mais ${abertos.length - 4}` : '');
  return abertos.length === 1 ? `1 filho aberto (${lista})` : `${abertos.length} filhos abertos (${lista})`;
}

/** O destino sugerido: o estado de conclusão; sem ele entre as opções, manter. */
export function destinoPadrao(info: InfoEstados): string {
  const opcoes = opcoesDeDestino(info);
  const alvo = info.concluido?.trim().toLowerCase();
  return opcoes.find((n) => n.toLowerCase() === alvo) ?? MANTER_ESTADO;
}
