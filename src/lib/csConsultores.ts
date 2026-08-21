/**
 * Consultores de atendimento do Customer Service — escopo do Wilker.
 *
 * Promovido de `HelpdeskExecutivoTab.tsx` (07/08/2026), onde a lista e o filtro
 * viviam como module-level sem export: a view de TV do CS (`CsTvView`) precisa
 * do MESMO recorte e do MESMO dedupe, e `norm` estava duplicado no
 * `ProdutividadeConsultoresCard`. Uma régua só — quem entra ou sai do CS muda
 * aqui e as duas telas acompanham.
 */

/**
 * Os 9 do CS, em TOKENS normalizados (minúsculas, sem acento) — o filtro é por
 * `includes`, então basta o primeiro nome como a fonte grafa.
 *
 * 21/08/2026: 'bruna' saiu e entrou 'lucas' (Lucas Ferreira) — quadro atual do
 * time, confirmado pelo Igor. Trocar aqui move as DUAS telas (mesa e TV) de uma
 * vez, que é o motivo desta lista existir fora dos componentes.
 */
export const CONSULTORES_CS = [
  'ailton', 'italo', 'leandro', 'vagner', 'guimaraes', 'ricardo', 'wilker', 'lucas', 'ronaldo',
];

/**
 * minúsculas + sem acento (faixa combinante U+0300–U+036F) — as fontes grafam
 * o mesmo consultor de jeitos diferentes (VDesk × planilha × techlead).
 */
export const normalizaNome = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const isConsultorCS = (nome: string) => {
  const n = normalizaNome(nome);
  return CONSULTORES_CS.some((t) => n.includes(t));
};

/**
 * Volume por consultor do CS: filtra os 9 e DEDUPLICA por nome somando os
 * registros — a origem pode repetir o consultor e cada duplicata virava uma
 * "segunda barrinha" no gráfico. A chave é o nome NORMALIZADO (não o bruto):
 * "Italo" e "Ítalo" são o mesmo consultor vindo de fontes com grafia diferente,
 * e chavear pelo bruto ressuscitava exatamente o bug que esta função corrige.
 * Exibe a primeira grafia vista. Ordena do maior para o menor.
 */
export function agrupaVolumePorConsultorCS(
  registrosPorConsultor: Array<{ nome: string; totalRegistros: number }>,
): Array<{ nome: string; registros: number }> {
  const map = new Map<string, { nome: string; registros: number }>();
  for (const c of registrosPorConsultor) {
    if (!isConsultorCS(c.nome)) continue;
    const chave = normalizaNome(c.nome);
    const atual = map.get(chave);
    if (atual) atual.registros += c.totalRegistros;
    else map.set(chave, { nome: c.nome, registros: c.totalRegistros });
  }
  return [...map.values()].sort((a, b) => b.registros - a.registros);
}
