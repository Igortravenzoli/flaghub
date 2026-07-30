import { describe, it, expect } from 'vitest';
import { contaCategorias, ehItemDeGestor } from '@/lib/fabricaClassificacao';
import { isFabricaCountableState, isFabricaEntregue, isDone } from '@/hooks/useFabricaKpis';

/**
 * Aceite dos números da Fábrica contra o BANCO — fotografia de S15-2026 tirada do
 * PROD em 30/07/2026 (114 itens de gestor no `iteration_path` da sprint, já
 * descontados [INFRA], os épicos fora da Fábrica e os itens com
 * `count_in_kpi = false`).
 *
 * O que este teste trava: dado o MESMO conjunto de itens que a tela recebe, as
 * funções do produto têm de produzir os mesmos totais que o SQL produz com
 * `fn_classifica_demanda`. É a régua que faltava — as divergências de 29/07
 * (Visão Geral 89/19 contra Gerencial 88/20, telão 145 contra 108) só existiram
 * porque nada comparava front e banco sobre os mesmos itens.
 *
 * A fixture NÃO tem nome de pessoa: o recorte do roster entra como booleano, que
 * é tudo de que o cálculo precisa. Não é um teste "ao vivo" — é uma fotografia;
 * quando a sprint virar, os números mudam de propósito e a fixture é reemitida
 * (gerador em Base_Dados_Projeto/FASE4/FABRICA/).
 *
 * Esperado, conferido no PROD em 30/07/2026:
 *   escopo 110 · done 15 · entregue 39 · em dev 42 · a fazer 14
 *   bug 52 · retorno QA 17 · avião 21 · priorizado 20 · não priorizado 90
 */

/** [work_item_type, state, tags, estaNoRosterAtivo, quantidade] */
const GRUPOS: Array<[string, string, string, boolean, number]> = [
  ["Bug", "Em desenvolvimento", "BUG; FLEXX", true, 8],
  ["Product Backlog Item", "Em desenvolvimento", "PRIORIZACAO; TRANSBORDO", true, 6],
  ["Product Backlog Item", "Em Teste", "AVIAO; FLEXX", true, 6],
  ["Bug", "Em Teste", "BUG; FLEXX", true, 5],
  ["Bug", "Em Teste", "BUG; FLEXXGO", true, 3],
  ["Product Backlog Item", "Em Teste", "AVIAO; FLEXXSPEED", true, 3],
  ["Bug", "Em desenvolvimento", "BUG; FLEXXDECISION", true, 3],
  ["Bug", "New", "BUG; FLEXX", true, 3],
  ["Bug", "Em Teste", "BUG; FLEXXGPS", true, 2],
  ["Bug", "Done", "BUG; FLEXXGPS", true, 2],
  ["Bug", "Em desenvolvimento", "BUG; FLEXX; RETORNO QA", true, 2],
  ["Bug", "Em desenvolvimento", "BUG; PORTALBROKER", true, 2],
  ["Product Backlog Item", "New", "AVIAO; PORTALFRONERI", true, 2],
  ["Bug", "New", "BUG; VISUALDESK", true, 2],
  ["Bug", "Done", "BUG; FLEXX", true, 2],
  ["Product Backlog Item", "Done", "AVIAO; FLEXX", true, 2],
  ["Bug", "Em desenvolvimento", "BUG; CONNECTSALES", true, 2],
  ["Product Backlog Item", "Em desenvolvimento", "PRIORIZACAO", true, 2],
  ["Bug", "Em Teste", "BUG; FLEXXSPEED", true, 2],
  ["Bug", "New", "BUG; CONNECTMERCHAN", true, 1],
  ["Bug", "New", "BUG; FLEXX; TRANSBORDO", true, 1],
  ["Bug", "New", "BUG; FLEXXSPEED", true, 1],
  ["Bug", "New", "BUG; SOFIAFLAG", true, 1],
  ["Product Backlog Item", "Aguardando Deploy", "AVIAO; CONNECTMERCHAN", true, 1],
  ["Product Backlog Item", "Aguardando Deploy", "AVIAO; FLEXXPROMO", true, 1],
  ["Product Backlog Item", "Aguardando Deploy", "FLEXXPROMO; MELHORIA; PRIORIZACAO; RETORNO QA", true, 1],
  ["Product Backlog Item", "Aguardando Deploy", "PRIORIZACAO; RETORNO QA", true, 1],
  ["Product Backlog Item", "Done", "AVIAO; CONNECTMERCHAN", true, 1],
  ["Product Backlog Item", "Done", "AVIAO; FLEXX; RETORNO QA", true, 1],
  ["Product Backlog Item", "Done", "FLEXX; MELHORIA; PRIORIZACAO", true, 1],
  ["Product Backlog Item", "Em desenvolvimento", "AVIAO; FLEXX", true, 1],
  ["Product Backlog Item", "Em desenvolvimento", "AVIAO; FLEXXSPEED; MELHORIA", true, 1],
  ["Product Backlog Item", "Em desenvolvimento", "AVIAO; VISUALDESK", true, 1],
  ["Product Backlog Item", "Em desenvolvimento", "ESCOPOPAGO; PRIORIZACAO", true, 1],
  ["Product Backlog Item", "Em desenvolvimento", "FLEXX; MELHORIA; PRIORIZACAO", true, 1],
  ["Product Backlog Item", "Em desenvolvimento", "FLEXXLEAD; PRIORIZACAO; ROADMAP2026", true, 1],
  ["Product Backlog Item", "Em desenvolvimento", "FLEXXPROMO; MELHORIA; PRIORIZACAO; UX/UI", true, 1],
  ["Product Backlog Item", "Em desenvolvimento", "HEINEKEN; MELHORIA; PRIORIZACAO; RETORNO QA", true, 1],
  ["Product Backlog Item", "Em desenvolvimento", "NOVODECISION; ROADMAP2026; UX/UI", false, 1],
  ["Product Backlog Item", "Em desenvolvimento", "PRIORIZACAO; ROADMAP2026", true, 1],
  ["Product Backlog Item", "Em Teste", "AVIAO; FLEXX; MELHORIA; RETORNO QA", true, 1],
  ["Product Backlog Item", "Em Teste", "AVIAO; PORTALBROKER", true, 1],
  ["Product Backlog Item", "Em Teste", "AVIAO; PORTALFRONERI", true, 1],
  ["Product Backlog Item", "Em Teste", "AVIAO; PORTALFRONERI; RETORNO QA", true, 1],
  ["Product Backlog Item", "Em Teste", "ESCOPOPAGO; PRIORIZACAO; RETORNO QA; TRANSBORDO", true, 1],
  ["Product Backlog Item", "Em Teste", "FLEXXGO; MELHORIA; PRIORIZACAO", true, 1],
  ["Product Backlog Item", "Em Teste", "FLEXXGO; MELHORIA; PRIORIZACAO; RETORNO QA; TRANSBORDO", true, 1],
  ["Product Backlog Item", "Em Teste", "PORTAL3.0NESTLE; PRIORIZACAO; RETORNO QA; STAGING; TRANSBORDO", true, 1],
  ["Product Backlog Item", "Em Teste", "PRIORIZACAO; TRANSBORDO", true, 1],
  ["Product Backlog Item", "New", "ESCOPOPAGO; PRIORIZACAO", true, 1],
  ["Product Backlog Item", "New", "FLEXXDECISION; MELHORIA; PRIORIZACAO", true, 1],
  ["Product Backlog Item", "New", "FLEXXGPS; MELHORIA", false, 1],
  ["Product Backlog Item", "New", "PORTAL3.0NESTLE; PRIORIZACAO; UX/UI", false, 1],
  ["Product Backlog Item", "New", "PORTALFRONERI; PRIORIZACAO; TRANSBORDO", true, 1],
  ["Bug", "Aguardando Deploy", "BUG; CONNECTMERCHAN", true, 1],
  ["Product Backlog Item", "New", "PRIORIZACAO; ROADMAP2026; UX/UI", false, 1],
  ["Bug", "Aguardando Deploy", "BUG; CONNECTMERCHAN; RETORNO QA", true, 1],
  ["Bug", "Aguardando Deploy", "BUG; FLEXXPROMO", true, 1],
  ["Bug", "Done", "BUG; CONNECTMERCHAN", true, 1],
  ["Bug", "Done", "BUG; FLEXX; RETORNO QA", true, 1],
  ["Bug", "Done", "BUG; FLEXXDECISION; RETORNO QA", true, 1],
  ["Bug", "Done", "BUG; FLEXXGO", true, 1],
  ["Bug", "Done", "BUG; HEINEKEN; RETORNO QA", true, 1],
  ["Bug", "Done", "BUG; PRIORIZACAO", true, 1],
  ["Bug", "Em desenvolvimento", "BUG; CONNECTMERCHAN", true, 1],
  ["Bug", "Em desenvolvimento", "BUG; FLEXX; PRIORIZACAO; RETORNO QA; TRANSBORDO", true, 1],
  ["Bug", "Em desenvolvimento", "BUG; FLEXX; RETORNO QA; TRANSBORDO", true, 1],
  ["Bug", "Em desenvolvimento", "BUG; FLEXX; TRANSBORDO", true, 1],
  ["Bug", "Em desenvolvimento", "BUG; FLEXXDECISION; TRANSBORDO", true, 1],
  ["Bug", "Em desenvolvimento", "BUG; FLEXXGPS", true, 1],
  ["Bug", "Em desenvolvimento", "BUG; FLEXXSPEED", true, 1],
  ["Bug", "Em desenvolvimento", "FLEXXSPEED", true, 1],
  ["Bug", "Em Teste", "BUG; FLEXX; TRANSBORDO", true, 1],
  ["Bug", "Em Teste", "BUG; HEINEKEN", true, 1],
];

type Item = { work_item_type: string; state: string; tags: string; noRoster: boolean };

const ITENS: Item[] = GRUPOS.flatMap(([work_item_type, state, tags, noRoster, n]) =>
  Array.from({ length: n }, () => ({ work_item_type, state, tags, noRoster })),
);

describe('escopo de S15-2026 — front reproduz o banco', () => {
  it('a fixture tem os 114 itens da fotografia', () => {
    expect(ITENS).toHaveLength(114);
  });

  /**
   * Mesma cadeia do hook: item de gestor + estado contável + dentro do roster.
   * (tipo, [INFRA], épicos e count_in_kpi já vêm filtrados na fixture.)
   */
  const escopo = ITENS.filter((i) =>
    ehItemDeGestor(i.work_item_type) && isFabricaCountableState(i.state) && i.noRoster,
  );

  it('o escopo bate com o do banco', () => {
    expect(escopo).toHaveLength(110);
  });

  it('os estados batem, e somam o escopo', () => {
    const done = escopo.filter((i) => isDone(i.state)).length;
    const entregue = escopo.filter((i) => isFabricaEntregue(i.state)).length;
    expect(done).toBe(15);
    expect(entregue).toBe(39);
    const emDevOuAFazer = escopo.length - done - entregue;
    expect(emDevOuAFazer).toBe(42 + 14);
  });

  it('a classificação bate com fn_classifica_demanda', () => {
    const c = contaCategorias(escopo);
    expect(c.total).toBe(110);
    expect(c.bug).toBe(52);
    expect(c.retornoQa).toBe(17);
    expect(c.aviaoSprint + c.aviaoTransbordado).toBe(21);
    expect(c.priorizado).toBe(20);
    expect(c.naoPriorizado).toBe(90);
    // fechamento: priorizado + não priorizado = escopo, sem item em dois buckets
    expect(c.priorizado + c.naoPriorizado).toBe(110);
  });

  it('o recorte do roster derruba exatamente os itens de fora', () => {
    const foraDoRoster = ITENS.filter((i) =>
      ehItemDeGestor(i.work_item_type) && isFabricaCountableState(i.state) && !i.noRoster,
    );
    expect(foraDoRoster).toHaveLength(4);
    // eram todos priorizados — é por isso que o não priorizado não se mexe
    const c = contaCategorias(foraDoRoster);
    expect(c.priorizado).toBe(4);
    expect(c.naoPriorizado).toBe(0);
  });

  it('estado não contável fica de fora do escopo', () => {
    const naoContaveis = ITENS.filter((i) => !isFabricaCountableState(i.state));
    expect(naoContaveis.length).toBe(114 - 110 - 4);
  });
});
