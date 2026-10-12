-- =============================================================================
-- EG-5 — devops-sync-query faz o diff do snapshot no banco
--
-- ── O problema medido (edge_logs, 08 a 10/10/2026, dia UTC, user agent Deno) ─
-- O devops-sync-all chama o devops-sync-query uma vez por query ativa a cada
-- 10 min (~136 chamadas/dia por query, 7 queries com item). Em cada chamada a
-- edge baixava duas listas inteiras só para comparar e jogar fora:
--
--                                              req/dia   linhas/dia   MB/dia
--   GET devops_work_items?select=id,rev         ~4,1 mil   ~1,69 mi     ~40,4
--     (itens da query, lerEmLotes de 500 ids)
--   GET devops_work_items?select=id,rev           ~950      ~26 mil      ~0,6
--     (pais fora da query, lotes de 1000)
--   GET devops_query_items_current               ~2,5 mil   ~1,69 mi     ~43,5
--     ?select=work_item_id&query_id=eq.…
--     (snapshot da query, páginas de 1000)
--
-- Números de 09/10 (08/10 e 10/10 dentro de ±7%). MB = linhas × bytes/linha do
-- select exato, medido no PROD com octet_length(json_agg(t)::text)/count(*):
-- 23,97 B para (id, rev) e 25,72 B para (work_item_id). A "02-Devops Base
-- Geral" (~11,5 mil itens) responde por quase tudo: 23 lotes de (id, rev) e 12
-- páginas de snapshot por rodada. Na rodada típica nada muda.
--
-- ── A correção ─────────────────────────────────────────────────────────────
-- (id, rev): REUSO de public.rpc_devops_stale_ids (EG-2, 20260921120000), já
-- no PROD. A regra é a mesma do passo 5 e do passo 8 da edge — sem linha no
-- banco ou rev do banco MENOR —, então não há função nova para ela.
--
-- Snapshot: a função abaixo. A edge manda os ids do WIQL e recebe
-- {"inserir": [...], "remover": [...]}. A edge continua dona da escrita (insert
-- com ignoreDuplicates e delete em lotes), da contagem que vai para
-- hub_sync_runs.meta.current_snapshot_deleted e dos logs: muda o transporte do
-- diff, não o que é gravado.
--
-- Depois: ~3 chamadas de RPC por rodada (≤ ~2,9 mil req/dia), com resposta de
-- poucos bytes (`[]` e `{"inserir": [], "remover": []}` na rodada sem mudança).
-- Corte estimado: ~84 MB/dia de resposta e ~4,6 mil requests/dia. Sobe
-- upload: os ids (e revs) do WIQL, ~140 KB por rodada da Base Geral — ingress,
-- que não conta no egress.
--
-- Retorno escalar (jsonb) de propósito: o PostgREST deste projeto roda com
-- `max_rows = 1000` e corta SETOF/TABLE em silêncio.
--
-- Edge publicada ANTES desta migration: PGRST202 → a edge volta à leitura
-- antiga paginada e loga "migration ausente (20261011120000_eg5_sync_query_diff)".
-- =============================================================================


-- ── Diff do snapshot de uma query ────────────────────────────────────────────
--
-- Espelha o passo 7 da edge como estava em dc77b30:
--
--   inserir   ids do WIQL sem linha (p_query_id, id) no snapshot. Ordem e
--             repetições da ENTRADA (o JS era `workItemIds.filter(...)`); a
--             repetição é inofensiva no insert com ignoreDuplicates.
--   remover   work_item_id do snapshot da query que não veio no WIQL, sem
--             repetição (a PK é (query_id, work_item_id)), em work_item_id ASC
--             — a ordem da leitura paginada antiga.
--
-- NOT EXISTS, não `<> ALL(p_ids)`: com NULL no array o `<> ALL` vira NULL e
-- nada seria removido; e NOT EXISTS sobre unnest vira hash anti join, em vez
-- de 11,5 mil × 11,5 mil comparações na Base Geral. Id NULL na entrada é
-- ignorado no `inserir` (a coluna é NOT NULL; o insert falharia).
--
-- p_ids vazio ou NULL → inserir vazio e remover = o snapshot inteiro. A edge
-- não chama com lista vazia (apaga a query toda num DELETE só, passo antes),
-- mas o resultado coincide com esse caminho.
--
-- Não escreve. Sem SECURITY DEFINER: só a edge chama, com service_role, que já
-- lê devops_query_items_current direto.

CREATE OR REPLACE FUNCTION public.rpc_devops_query_snapshot_diff(
  p_query_id uuid,
  p_ids      integer[]
)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'inserir', coalesce((
      SELECT jsonb_agg(p.id ORDER BY p.ord)
      FROM unnest(p_ids) WITH ORDINALITY AS p(id, ord)
      WHERE p.id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.devops_query_items_current c
          WHERE c.query_id = p_query_id
            AND c.work_item_id = p.id
        )
    ), '[]'::jsonb),
    'remover', coalesce((
      SELECT jsonb_agg(c.work_item_id ORDER BY c.work_item_id)
      FROM public.devops_query_items_current c
      WHERE c.query_id = p_query_id
        AND NOT EXISTS (
          SELECT 1
          FROM unnest(p_ids) AS u(id)
          WHERE u.id = c.work_item_id
        )
    ), '[]'::jsonb)
  );
$fn$;

COMMENT ON FUNCTION public.rpc_devops_query_snapshot_diff(uuid, integer[]) IS
  'Diff do snapshot devops_query_items_current de uma query contra os ids do WIQL: '
  '{"inserir": ids do WIQL ausentes do snapshot (ordem da entrada), "remover": ids do '
  'snapshot fora do WIQL (work_item_id ASC)}. Passo 7 da edge devops-sync-query (EG-5). '
  'Não escreve. Retorno escalar: não sofre o max_rows do PostgREST.';

REVOKE EXECUTE ON FUNCTION public.rpc_devops_query_snapshot_diff(uuid, integer[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_devops_query_snapshot_diff(uuid, integer[]) TO service_role;
