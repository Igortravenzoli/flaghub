/**
 * Régua de estado da Fábrica — espelho de `fn_estado_entregue` / `fn_estado_done`
 * (migration `20260803160000_sn7_foto_universo_quadro_e_ids.sql`).
 *
 * A régua do gestor: **Concluído = Entregue + Done**. "Entregue" é o item que
 * saiu da mão do dev — está em teste, aguardando teste, deploy ou homologação.
 *
 * Existia uma cópia da lista em cada tela (GerenciaTab, FabricaDashboard,
 * useFabricaKpis), uma delas comparando com sensibilidade a maiúsculas
 * (`state === 'Done'`, `Set.has('Em Teste')`). Três cópias divergentes da mesma
 * definição foi exatamente o que produziu a divergência de "entregue" entre a
 * coluna e o breakdown da fotografia — resolvida na SN-7 no banco, resolvida
 * aqui no front. Toda comparação é minúscula e sem espaços, como no SQL.
 */

const ESTADOS_ENTREGUE = new Set([
  'aguardando teste',
  'em teste',
  'aguardando deploy',
  'deploy',
  'homologação',
  'homologacao',
]);

const ESTADOS_DONE = new Set(['done', 'closed', 'resolved']);

function normaliza(state: string | null | undefined): string {
  return (state || '').trim().toLowerCase();
}

/** Item entregue: dev concluiu, está com QA/deploy. Não inclui Done. */
export function ehEstadoEntregue(state: string | null | undefined): boolean {
  return ESTADOS_ENTREGUE.has(normaliza(state));
}

/** Item finalizado. */
export function ehEstadoDone(state: string | null | undefined): boolean {
  return ESTADOS_DONE.has(normaliza(state));
}

/** Concluído da régua do gestor — os dois conjuntos são disjuntos. */
export function ehEstadoConcluido(state: string | null | undefined): boolean {
  return ehEstadoDone(state) || ehEstadoEntregue(state);
}
