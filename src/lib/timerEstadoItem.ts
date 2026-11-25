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

/** O destino sugerido: o estado de conclusão; sem ele entre as opções, manter. */
export function destinoPadrao(info: InfoEstados): string {
  const opcoes = opcoesDeDestino(info);
  const alvo = info.concluido?.trim().toLowerCase();
  return opcoes.find((n) => n.toLowerCase() === alvo) ?? MANTER_ESTADO;
}
