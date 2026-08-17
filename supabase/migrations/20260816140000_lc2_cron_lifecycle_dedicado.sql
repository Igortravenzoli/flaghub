-- =============================================================================
-- LC-2 — Cron dedicado para o recálculo do ciclo de vida
--
-- O passo 4 (lifecycle/health) morria de fome porque dividia a mesma execução
-- de background com os passos 1–3 do `devops-sync-all`: sincronizar todas as
-- queries do DevOps, buscar histórico de iteração e puxar as filhas de ~2.000
-- PBIs. Quando chegava a vez dele, o relógio já estava no fim — daí 6 a 30
-- linhas recalculadas por dia contra 144 rodadas do cron.
--
-- Aqui ele ganha janela própria: mesma edge, corpo `{"only":"lifecycle"}`, que
-- pula os passos 1–3 e 5 e roda só o recálculo, com orçamento de 60s e lote de
-- 400 itens. Agendado 5 minutos DEFASADO do sync-devops-all (*/10) para os dois
-- não competirem pelo mesmo instante.
--
-- Dimensionamento: fila atual de 127 itens; com 400 por rodada a cada 10 min o
-- lastro é quitado na primeira execução e depois só o fluxo do dia.
--
-- Depende de: 20260816130000 (rpc_lifecycle_refresh_candidates) e do deploy da
-- edge devops-sync-all com o modo `only`. Agendar antes do deploy é inofensivo
-- — a edge antiga ignora o corpo e faz um sync completo a mais.
-- =============================================================================

DO $$
DECLARE
  v_base_url text;
  v_anon_key text;
  v_command  text;
BEGIN
  -- Reaproveita URL e anon key do cron irmão: nada de hardcode de project ref
  SELECT substring(j.command from '(https://[^''\n]+)/functions/v1/'),
         substring(j.command from 'Bearer ([A-Za-z0-9._-]+)')
    INTO v_base_url, v_anon_key
  FROM cron.job j
  WHERE j.jobname = 'sync-devops-all'
  LIMIT 1;

  IF v_base_url IS NULL OR v_anon_key IS NULL THEN
    RAISE EXCEPTION 'Cron sync-devops-all não encontrado (ou sem Authorization) — '
                    'não dá para derivar URL/anon key do cron de lifecycle.';
  END IF;

  v_command := format($cmd$
SELECT net.http_post(
  url := %L,
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', %L,
    'x-cron-secret', public.get_cron_secret()
  ),
  body := '{"only":"lifecycle"}'::jsonb
) AS request_id;
$cmd$, v_base_url || '/functions/v1/devops-sync-all', 'Bearer ' || v_anon_key);

  PERFORM cron.unschedule('sync-devops-lifecycle')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-devops-lifecycle');

  PERFORM cron.schedule('sync-devops-lifecycle', '5-55/10 * * * *', v_command);
END;
$$;
