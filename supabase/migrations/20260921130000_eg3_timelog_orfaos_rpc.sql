-- =============================================================================
-- EG-3 — Órfãos do TimeLog reconciliados dentro do banco
--
-- A organização precisa caber de novo no egress do plano Free (~161 MB/dia).
-- `devops-sync-timelog` roda a cada 15 min (96×/dia) e, para descobrir quais
-- lançamentos sumiram do DevOps, relia a base INTEIRA pela REST em 9 páginas:
--
--   medido em 21/09/2026 (edge_logs, 24h):
--     864 GETs em devops_time_logs · 807.134 linhas · ~1,31 MB por execução
--     = ~125 MB/dia, só para achar os órfãos
--   mudança real: 1 a 61 lançamentos novos por dia nos 30 dias até 21/09;
--   nenhuma edição (devops_time_log_revisions vazia desde 20/07); 53 órfãos
--   no total, o último marcado em 21/09 12:15Z.
--
-- Agora a edge manda os ids do payload (entrada, que não conta como egress) e
-- o banco faz o diff: marca quem saiu, desmarca quem voltou e devolve só as
-- contagens (~120 bytes).
--
-- ── Semântica preservada (devops-sync-timelog v3.3, 20260812150000) ─────────
--   • Base = devops_time_logs com ext_entry_id NÃO nulo. Linha sem id oficial
--     nunca foi candidata a órfã (não há como saber se "saiu").
--   • Órfão novo = na base e fora do payload. Grava ext_entry_id, work_item_id,
--     log_date, user_name e time_minutes; first_missing_at e last_checked_at
--     ficam no default now(). Quem já é órfão NÃO é tocado: a edge fazia
--     upsert com ignoreDuplicates (ON CONFLICT DO NOTHING), então nem o retrato
--     nem last_checked_at mudavam — first_missing_at guarda a PRIMEIRA ausência.
--   • Quem voltou ao payload sai da tabela de órfãos (e volta a contar nas
--     horas, via v_devops_time_logs_ativos).
--   • O payload é o conjunto de ext_entry_id DISTINTOS que a edge normalizou;
--     nulo e repetido no array não mudam nada.
--
-- ── Bugs que somem junto ────────────────────────────────────────────────────
-- 1. Guarda de payload. Se o Azure devolvesse payload vazio (PAT expirado, 401
--    em todas as coleções), TODA a base (~8,4 mil) virava órfã e
--    v_devops_time_logs_ativos / rpc_devops_timelog_agg mostravam zero horas
--    até a próxima execução boa. Agora, com payload vazio ou cobrindo menos de
--    `p_cobertura_minima` (50%) da base, NENHUM órfão é marcado e a função
--    devolve `guarda = true` para a edge registrar a execução como erro.
--    Presença continua valendo: id que veio no payload existe na origem, então
--    quem voltou é desmarcado mesmo com a guarda armada.
-- 2. Paginação sem ORDER BY. As 9 páginas de `range()` eram 9 consultas sem
--    ordem: nada garantia que OFFSET 1000 continuasse de onde OFFSET 0 parou
--    (um update entre páginas muda a posição da tupla). Linha repetida era
--    inofensiva; linha pulada não era conferida, e um órfão real ficava sem
--    marcar naquela execução. Com o diff numa consulta só, não há página.
-- 3. Teto silencioso de 1.000 linhas. A leitura de devops_time_log_orphans
--    para achar "quem voltou" não paginava: com mais de 1.000 órfãos (o
--    cenário do bug 1) só quem caía nas primeiras 1.000 linhas era conferido.
--    Simulado com a base real: 947 desmarcados por execução boa, 9 execuções
--    (~2h15) até voltar aos 53 — isso se o DELETE com ~950 ids na URL (~40 kB
--    de query string no `.in()`) passasse pelo gateway. Aqui é uma execução.
--
-- Retorno escalar (jsonb) de propósito: o PostgREST deste projeto corta SETOF
-- em max_rows=1000 sem avisar.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_timelog_reconciliar_orfaos(
  p_ids               text[],
  p_cobertura_minima  numeric DEFAULT 0.5
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_payload    integer;
  v_base       integer;
  v_presentes  integer;
  v_guarda     boolean;
  v_novos      integer := 0;
  v_voltaram   integer := 0;
BEGIN
  -- ── 1. Números da guarda ──────────────────────────────────────────────────
  -- presentes = linhas da base cujo id veio no payload. A cobertura é medida
  -- contra a base (e não pelo tamanho bruto do payload) porque é exatamente o
  -- complemento dela que viraria órfão.
  WITH payload AS (
    SELECT DISTINCT u.id FROM unnest(p_ids) AS u(id) WHERE u.id IS NOT NULL
  )
  SELECT (SELECT count(*) FROM payload),
         count(*),
         count(p.id)
    INTO v_payload, v_base, v_presentes
    FROM public.devops_time_logs t
    LEFT JOIN payload p ON p.id = t.ext_entry_id
   WHERE t.ext_entry_id IS NOT NULL;

  v_guarda := v_payload = 0
           OR v_presentes < v_base * coalesce(p_cobertura_minima, 0.5);

  -- ── 2. Órfãos novos (só com payload confiável) ────────────────────────────
  -- O NOT EXISTS em devops_time_log_orphans filtra ANTES do INSERT: quem já é
  -- órfão nem chega ao statement (o ON CONFLICT fica só para corrida entre
  -- duas execuções simultâneas, cron + botão do SyncCentral).
  IF NOT v_guarda THEN
    WITH payload AS (
      SELECT DISTINCT u.id FROM unnest(p_ids) AS u(id) WHERE u.id IS NOT NULL
    )
    INSERT INTO public.devops_time_log_orphans
           (ext_entry_id, work_item_id, log_date, user_name, time_minutes)
    SELECT t.ext_entry_id, t.work_item_id, t.log_date, t.user_name, t.time_minutes
      FROM public.devops_time_logs t
     WHERE t.ext_entry_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM payload p WHERE p.id = t.ext_entry_id)
       AND NOT EXISTS (SELECT 1 FROM public.devops_time_log_orphans o
                        WHERE o.ext_entry_id = t.ext_entry_id)
    ON CONFLICT (ext_entry_id) DO NOTHING;
    GET DIAGNOSTICS v_novos = ROW_COUNT;
  END IF;

  -- ── 3. Quem voltou deixa de ser órfão (sempre) ────────────────────────────
  WITH payload AS (
    SELECT DISTINCT u.id FROM unnest(p_ids) AS u(id) WHERE u.id IS NOT NULL
  )
  DELETE FROM public.devops_time_log_orphans o
   USING payload p
   WHERE o.ext_entry_id = p.id;
  GET DIAGNOSTICS v_voltaram = ROW_COUNT;

  RETURN jsonb_build_object(
    'payload',      v_payload,             -- ids distintos recebidos
    'base',         v_base,                -- linhas com ext_entry_id
    'presentes',    v_presentes,           -- base ∩ payload
    'ausentes',     v_base - v_presentes,  -- base fora do payload (órfãos novos + antigos)
    'guarda',       v_guarda,              -- true = nenhum órfão marcado nesta execução
    'orfaos_novos', v_novos,
    'voltaram',     v_voltaram,
    'orfaos_total', (SELECT count(*) FROM public.devops_time_log_orphans)
  );
END;
$fn$;

COMMENT ON FUNCTION public.rpc_timelog_reconciliar_orfaos(text[], numeric) IS
  'Reconcilia devops_time_log_orphans com o payload da extensão TimeLog: marca quem está '
  'na base e não veio (preservando first_missing_at de quem já era órfão), desmarca quem '
  'voltou e devolve as contagens em jsonb. Com payload vazio ou cobrindo menos de '
  'p_cobertura_minima da base NÃO marca órfão nenhum (guarda = true). Chamada pela edge '
  'devops-sync-timelog a cada execução.';

-- SECURITY INVOKER: a edge chama como service_role, que já tem INSERT/DELETE nas
-- tabelas e ignora RLS. O REVOKE nomeia anon e authenticated porque o default
-- privilege do Supabase concede EXECUTE a eles em toda função nova de public.
REVOKE EXECUTE ON FUNCTION public.rpc_timelog_reconciliar_orfaos(text[], numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_timelog_reconciliar_orfaos(text[], numeric) TO service_role;
