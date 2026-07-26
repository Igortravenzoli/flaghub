-- =============================================================================
-- IN-1 + IN-2 — Automação VDESK → DevOps (fim da aprovação manual)
--
-- Decisão do gestor (25/07/2026): a integração foi homologada e não deve mais
-- exigir aprovação por lançamento. A fila deixa de ser ETAPA e vira
-- LIVRO-RAZÃO + rede de segurança: registra tudo que foi lançado e estaciona
-- o que falhou. Sem push de alerta — exceção aparece na aba de Logs.
--
-- Extração VDESK continua DIÁRIA (cron 'sync-vdesk-timelog', 01:00 UTC): a
-- decisão foi não aumentar 24× a carga sobre o Flag.AI.Gateway. O que roda de
-- hora em hora é a ponte interna (enfileirar) e o envio (postar) — assim um
-- sync disparado à mão no meio do dia é recolhido em até uma hora, e erros
-- retentáveis têm 24 chances por dia em vez de uma.
--
-- ── POR QUE NASCE DESLIGADO ────────────────────────────────────────────────
-- Isto passa a ESCREVER no Azure DevOps sem humano no meio, e o POST não tem
-- idempotência do lado de lá (cada envio cria documento novo). A primeira
-- passada enfileiraria TODO apontamento da janela que ainda não tem linha de
-- fila — inclusive horas antigas que ninguém nunca lançou de propósito.
--
-- Por isso:
--   • rpc_timelog_auto_enqueue nasce com p_apply => false (SIMULA e devolve o
--     que faria; não grava nada). O cron chama com p_apply => true.
--   • os dois jobs são criados INATIVOS. Ligue só depois de conferir o lote:
--
--       -- 1) o que a primeira passada faria (não grava nada):
--       select * from public.rpc_timelog_auto_enqueue(7);
--
--       -- 2) conferido? ligue os dois jobs:
--       update cron.job set active = true
--        where jobname in ('timelog-auto-enqueue', 'timelog-auto-post');
--
--       -- desligar a qualquer momento (mesmo comando com active = false)
-- =============================================================================

-- ── 1. Enfileiramento automático ────────────────────────────────────────────
-- Insere direto como 'approved': com a homologação, o estado 'pending' deixa
-- de existir no caminho feliz. 'rejected' segue como exceção manual.
--
-- Três exclusões, nesta ordem de importância:
--   a) apontamento que JÁ tem linha de fila (qualquer status) — o índice único
--      uq_timelog_post_queue_vdesk_log (IN-0) torna isso obrigatório, e é o que
--      impede lançar a mesma hora duas vezes no DevOps;
--   b) sem e-mail mapeado — o POST iria com identidade vazia, criando
--      lançamento órfão no DevOps. Vira pendência visível na aba de Logs
--      (rpc_fabrica_apontamentos_sem_email);
--   c) tempo zerado — a API rejeitaria.
--
-- dry_run = FALSE explicitamente: o default de rpc_timelog_queue_post é TRUE,
-- e herdar isso marcaria tudo como "enviado" sem enviar nada — falso verde.
CREATE OR REPLACE FUNCTION public.rpc_timelog_auto_enqueue(
  p_days  int     DEFAULT 7,
  p_apply boolean DEFAULT false
)
RETURNS TABLE (
  acao          text,
  vdesk_log_id  uuid,
  usuario_vdesk text,
  log_date      date,
  task_devops   int,
  minutos       int,
  motivo        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_desde date := (now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(p_days, 0);
BEGIN
  IF NOT (public.hub_is_admin() OR session_user IN ('postgres', 'supabase_admin')) THEN
    RAISE EXCEPTION 'permission denied: admin required';
  END IF;

  CREATE TEMP TABLE _cand ON COMMIT DROP AS
  SELECT
    v.id                                       AS vdesk_log_id,
    v.usuario_vdesk,
    v.log_date,
    v.task_devops,
    round(v.tempo_segundos / 60.0)::int        AS minutos,
    cm.devops_email,
    coalesce(cm.canonical_name, v.usuario_vdesk) AS display,
    format('VDESK OS %s — %s — Lançamento automatizado FlagHub',
           v.num_os, coalesce(v.usuario_vdesk, '?'))  AS notas,
    CASE
      WHEN round(v.tempo_segundos / 60.0)::int <= 0 THEN 'tempo zerado'
      WHEN cm.devops_email IS NULL                  THEN 'sem e-mail mapeado'
      ELSE NULL
    END                                        AS impedimento
  FROM public.vdesk_time_logs v
  LEFT JOIN public.devops_collaborator_map cm
    ON lower(cm.vdesk_user_name) = lower(v.usuario_vdesk)
   AND coalesce(cm.is_active, true)
  WHERE v.log_date >= v_desde
    -- (a) nunca reenfileirar o que já passou pela fila, em qualquer status
    AND NOT EXISTS (
      SELECT 1 FROM public.timelog_post_queue q WHERE q.vdesk_log_id = v.id
    );

  IF p_apply THEN
    INSERT INTO public.timelog_post_queue (
      vdesk_log_id, task_devops, log_date, time_minutes,
      target_user_email, target_user_display, vdesk_user_name,
      notes, dry_run, status, approved_at
    )
    SELECT
      c.vdesk_log_id, c.task_devops, c.log_date, c.minutos,
      c.devops_email, c.display, c.usuario_vdesk,
      c.notas, false, 'approved', now()
    FROM _cand c
    WHERE c.impedimento IS NULL
    -- Cinto e suspensório: se duas passadas se sobrepuserem, o índice único
    -- resolve sem estourar erro no cron.
    ON CONFLICT (vdesk_log_id) DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT
    CASE WHEN c.impedimento IS NOT NULL THEN 'bloqueado'
         WHEN p_apply                   THEN 'enfileirado'
         ELSE 'seria enfileirado' END,
    c.vdesk_log_id, c.usuario_vdesk, c.log_date, c.task_devops, c.minutos,
    c.impedimento
  FROM _cand c
  ORDER BY (c.impedimento IS NOT NULL) DESC, c.log_date DESC, c.usuario_vdesk;
END;
$fn$;

COMMENT ON FUNCTION public.rpc_timelog_auto_enqueue(int, boolean) IS
  'IN-1: enfileira automaticamente apontamentos VDESK como approved (dry_run=false). '
  'p_apply=false SIMULA (não grava) — é o default de propósito. Pula o que já tem '
  'linha de fila em qualquer status (anti-duplicata), sem e-mail mapeado e tempo zero.';

REVOKE ALL ON FUNCTION public.rpc_timelog_auto_enqueue(int, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_timelog_auto_enqueue(int, boolean) TO authenticated, service_role;

-- ── 2. Crons (INATIVOS — ver cabeçalho para ligar) ──────────────────────────
-- Enfileirar :10 e postar :20 de cada hora. A folga de 10 min garante que o
-- lote esteja completo antes do envio.
-- Desativar usa cron.alter_job (não UPDATE direto em cron.job — o role da
-- migration não tem permissão de escrita na tabela, e a exceção resultante
-- desfaria o agendamento junto, deixando o job inexistente em silêncio).
DO $$
DECLARE v_jobid bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'timelog-auto-enqueue') THEN
    PERFORM cron.unschedule('timelog-auto-enqueue');
  END IF;
  v_jobid := cron.schedule(
    'timelog-auto-enqueue',
    '10 * * * *',
    $cmd$SELECT count(*) FROM public.rpc_timelog_auto_enqueue(7, true);$cmd$
  );
  PERFORM cron.alter_job(v_jobid, active => false);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron timelog-auto-enqueue falhou (%). Agende manualmente.', SQLERRM;
END $$;

-- Envio: a edge devops-post-timelog já aceita x-cron-secret e já filtra
-- status='approved' + attempt_count < 3. Padrão canônico do repo
-- (net.http_post + get_cron_secret(), ver docs/SETUP_CRON_JOBS.md).
DO $$
DECLARE v_jobid bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'timelog-auto-post') THEN
    PERFORM cron.unschedule('timelog-auto-post');
  END IF;
  v_jobid := cron.schedule(
    'timelog-auto-post',
    '20 * * * *',
    $cmd$
    SELECT net.http_post(
      url := 'https://nxmgppfyltwsqryfxkbm.supabase.co/functions/v1/devops-post-timelog',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', public.get_cron_secret()
      ),
      body := jsonb_build_object('mode', 'process', 'limit', 50)
    ) AS request_id;
    $cmd$
  );
  PERFORM cron.alter_job(v_jobid, active => false);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron timelog-auto-post falhou (%). Agende manualmente.', SQLERRM;
END $$;

-- ── 3. Trava de segurança: nunca deixar job ATIVO por acidente ─────────────
-- O estado perigoso não é "job não existe" (nada roda), é "job existe e está
-- ligado" — passaria a postar no DevOps sem ninguém ter conferido o lote.
-- Se isso acontecer, a migration falha e desfaz tudo.
DO $$
DECLARE v_ativos text;
BEGIN
  SELECT string_agg(jobname, ', ') INTO v_ativos
  FROM cron.job
  WHERE jobname IN ('timelog-auto-enqueue', 'timelog-auto-post') AND active;

  IF v_ativos IS NOT NULL THEN
    RAISE EXCEPTION 'Job(s) de automação ficaram ATIVOS (%). Devem nascer desligados — abortando.', v_ativos;
  END IF;
END $$;
