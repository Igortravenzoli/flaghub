-- =============================================================================
-- LOG-1 — Suporte de banco para a aba de Logs da Fábrica
--
-- A aba lê fontes que já existem (nenhuma tabela nova). Este pacote traz:
--   1. Índice de ordenação/filtro por período na fila de timelog
--   2. GRANTs explícitos das tabelas lidas direto por PostgREST
--   3. RPC de agregação dos apontamentos SEM e-mail mapeado
-- =============================================================================

-- ── 1. Índice: a fila é ordenada e filtrada por created_at ──────────────────
-- devops_qa_return_events e timelog_sync_runs já têm índice por data
-- (idx_qa_events_detected / idx_timelog_sync_runs_started); a fila não tinha.
-- Hoje é barato; passa a doer quando ela virar o livro-razão da automação
-- (uma linha por apontamento, todo dia, para sempre).
CREATE INDEX IF NOT EXISTS idx_timelog_post_queue_created
  ON public.timelog_post_queue (created_at DESC);

COMMENT ON INDEX public.idx_timelog_post_queue_created IS
  'LOG-1: ordenação/filtro por período na aba de Logs da Fábrica e na tela de nivelamento.';

-- ── 2. GRANTs explícitos ────────────────────────────────────────────────────
-- devops_qa_return_events e devops_collaborator_map nunca receberam GRANT
-- explícito: até agora todo acesso era via RPC SECURITY DEFINER, e a aba de
-- Logs é a primeira leitura direta por PostgREST. Depender do ALTER DEFAULT
-- PRIVILEGES do Supabase é frágil (varia com o dono da migration) — sem o
-- GRANT, o PostgREST devolve 42501 e a aba mostraria "nenhum registro".
-- Idempotente e sem efeito onde o default já cobria.
GRANT SELECT ON public.devops_qa_return_events TO authenticated;
GRANT SELECT ON public.devops_collaborator_map TO authenticated;

-- ── 3. Apontamentos sem e-mail mapeado (agregado no banco) ──────────────────
-- Pessoas cujo usuário VDESK não tem devops_email ativo no mapa: o lançamento
-- não tem destinatário resolvível no DevOps e fica parado. Precisa de ação
-- humana (cadastrar o e-mail no mapa).
--
-- Agregar no banco em vez de baixar linha a linha evita teto de paginação —
-- a lista é apresentada como exaustiva, então truncar seria subnotificar.
-- O predicado do join espelha EXATAMENTE o de rpc_timelog_queue_post e o da
-- v_timelog_unified (lower + coalesce(is_active,true)).
--
-- SECURITY INVOKER de propósito: a RLS de vdesk_time_logs continua valendo.
CREATE OR REPLACE FUNCTION public.rpc_fabrica_apontamentos_sem_email(
  p_days int DEFAULT 30
)
RETURNS TABLE (
  usuario_vdesk text,
  apontamentos bigint,
  minutos bigint,
  primeira_data date,
  ultima_data date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    v.usuario_vdesk,
    count(*)::bigint,
    coalesce(sum(round(v.tempo_segundos / 60.0)), 0)::bigint,
    min(v.log_date),
    max(v.log_date)
  FROM public.vdesk_time_logs v
  LEFT JOIN public.devops_collaborator_map cm
    ON lower(cm.vdesk_user_name) = lower(v.usuario_vdesk)
   AND coalesce(cm.is_active, true)
  WHERE v.log_date >= ((now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(p_days, 0))
    AND cm.devops_email IS NULL
  GROUP BY v.usuario_vdesk
  ORDER BY 3 DESC;
$$;

COMMENT ON FUNCTION public.rpc_fabrica_apontamentos_sem_email(int) IS
  'LOG-1: apontamentos VDESK sem e-mail DevOps mapeado (não podem ser lançados). '
  'Agregado no banco para a lista ser exaustiva. Janela em dias, corte por data BRT.';

REVOKE ALL ON FUNCTION public.rpc_fabrica_apontamentos_sem_email(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fabrica_apontamentos_sem_email(int) TO authenticated;
