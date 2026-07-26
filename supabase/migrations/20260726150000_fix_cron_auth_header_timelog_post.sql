-- =============================================================================
-- FIX — cron 'timelog-auto-post' sem header Authorization (401 silencioso)
--
-- O gateway das Edge Functions exige `Authorization` mesmo quando a função
-- valida por x-cron-secret: sem ele a chamada morre em
-- {"code":"UNAUTHORIZED_NO_AUTH_HEADER"} ANTES de chegar no código da função.
--
-- O cron criado em 20260726100000 seguiu o exemplo de docs/SETUP_CRON_JOBS.md,
-- que está desatualizado — só tem Content-Type + x-cron-secret. Os crons que
-- realmente funcionam em PROD foram corrigidos em 20260519134500 e mandam
-- Authorization com a anon key. Sem esta correção, 'timelog-auto-post' falharia
-- silenciosamente a cada hora: o enqueue encheria a fila de 'approved' e nada
-- seria postado no DevOps.
--
-- Detectado ao testar a edge devops-transbordo pelo mesmo caminho (pg_net).
-- A anon key é pública (já está em supabase/config.prod.toml e no bundle do
-- front) — não é segredo; o segredo é o x-cron-secret, que continua vindo do
-- Vault via public.get_cron_secret().
-- =============================================================================

DO $$
DECLARE
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54bWdwcGZ5bHR3c3FyeWZ4a2JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDEwMDEsImV4cCI6MjA4NTExNzAwMX0.6TqJwx2_8dbFwbvflSZKVe6MSaagmPosQaxpg0l9Waw';
  v_jobid bigint;
  v_ativo boolean;
BEGIN
  SELECT jobid, active INTO v_jobid, v_ativo FROM cron.job WHERE jobname = 'timelog-auto-post';
  IF v_jobid IS NULL THEN
    RAISE NOTICE 'Job timelog-auto-post não existe — nada a corrigir.';
    RETURN;
  END IF;

  PERFORM cron.alter_job(
    v_jobid,
    command => format($cmd$
SELECT net.http_post(
  url := 'https://nxmgppfyltwsqryfxkbm.supabase.co/functions/v1/devops-post-timelog',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', %L,
    'x-cron-secret', public.get_cron_secret()
  ),
  body := jsonb_build_object('mode', 'process', 'limit', 50)
) AS request_id;
$cmd$, 'Bearer ' || v_anon_key)
  );

  RAISE NOTICE 'Job timelog-auto-post corrigido (Authorization adicionado). Ativo=%', v_ativo;
END $$;
