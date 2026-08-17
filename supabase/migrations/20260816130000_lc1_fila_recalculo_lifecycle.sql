-- =============================================================================
-- LC-1 — Fila de recálculo do pbi_lifecycle_summary (fim da inanição)
--
-- ── O problema medido (16/08/2026) ─────────────────────────────────────────
-- `processLifecycleAndHealth` (passo 4 da edge devops-sync-all) tinha orçamento
-- de 8s e escolhia os candidatos em ordem INDEFINIDA: baixava ~2.274 PBIs,
-- filtrava em memória quem mudou desde o último cálculo e ia processando até
-- estourar o tempo. Quem ficava no fim da lista era descartado (skippedTimeout)
-- e reaparecia na mesma posição na rodada seguinte — inanição permanente.
--
-- Resultado: cron a cada 10 min (144 rodadas/dia) entregando 6 a 30 linhas/dia.
-- Estado no dia da auditoria: 94 resumos defasados (71 há mais de 7 dias, 11 há
-- mais de 30) e 33 PBIs sem linha nenhuma. Isso corrompeu a lista de transbordo
-- (ver 20260816120000_tr2), o sprint_migration_count, o overflow_count e a
-- saúde verde/amarelo/vermelho desses itens.
--
-- ── A correção ─────────────────────────────────────────────────────────────
-- Esta RPC devolve a fila JÁ FILTRADA e JÁ ORDENADA por defasagem (nunca
-- calculado primeiro, depois o cálculo mais antigo). Duas consequências:
--   1. Ninguém passa na frente de quem espera há mais tempo → sem inanição.
--   2. A edge para de baixar 2.274 linhas com histórico por rodada só para
--      descobrir quem mudou — a comparação vira um índice no banco.
-- `total_pendentes` (window count, avaliado antes do LIMIT) dá a profundidade
-- da fila para a edge logar: sem isso não há como saber que ela está atrasando.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_lifecycle_refresh_candidates(p_limit integer DEFAULT 200)
RETURNS TABLE (
  id                 integer,
  work_item_type     text,
  state              text,
  iteration_path     text,
  assigned_to_unique text,
  created_date       timestamptz,
  changed_date       timestamptz,
  custom_fields      jsonb,
  iteration_history  jsonb,
  state_history      jsonb,
  computed_at        timestamptz,
  total_pendentes    bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT w.id, w.work_item_type, w.state, w.iteration_path, w.assigned_to_unique,
         w.created_date, w.changed_date, w.custom_fields, w.iteration_history,
         w.state_history, ls.computed_at,
         count(*) OVER ()   -- fila inteira: window roda antes do LIMIT
  FROM public.devops_work_items w
  LEFT JOIN public.pbi_lifecycle_summary ls ON ls.work_item_id = w.id
  WHERE w.work_item_type IN ('Product Backlog Item', 'User Story', 'Bug')
    AND (ls.computed_at IS NULL OR w.changed_date > ls.computed_at)
  ORDER BY ls.computed_at ASC NULLS FIRST, w.id
  LIMIT greatest(p_limit, 1);
$fn$;

COMMENT ON FUNCTION public.rpc_lifecycle_refresh_candidates(integer) IS
  'Fila de recálculo do pbi_lifecycle_summary: PBI/US/Bug sem linha ou alterados depois '
  'do último cálculo, ordenados do mais defasado para o menos. Consumida pela edge '
  'devops-sync-all (passo 4 / modo only=lifecycle). A ordem é o que impede a inanição '
  'que congelou 127 itens até 16/08/2026 — não trocar por ordem arbitrária.';

-- SECURITY DEFINER devolvendo histórico e custom_fields crus: só a edge lê isso.
-- O REVOKE tem que nomear anon e authenticated — o default privilege do Supabase
-- concede EXECUTE a esses papéis em TODA função nova de public, então revogar de
-- PUBLIC não adianta nada (o grant é explícito, não herdado). Sem isso a função
-- responde em /rest/v1/rpc/... com a anon key que vai no bundle do front.
REVOKE EXECUTE ON FUNCTION public.rpc_lifecycle_refresh_candidates(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_lifecycle_refresh_candidates(integer) TO service_role;

-- ── Índice de apoio: a fila varre changed_date × computed_at ────────────────
CREATE INDEX IF NOT EXISTS idx_devops_work_items_tipo_changed
  ON public.devops_work_items (work_item_type, changed_date DESC);

CREATE INDEX IF NOT EXISTS idx_pbi_lifecycle_summary_computed
  ON public.pbi_lifecycle_summary (computed_at ASC);
