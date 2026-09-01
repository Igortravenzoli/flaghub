-- =============================================================================
-- QA-1 — Desalinha o cron da Qualidade do cron geral do DevOps
--
-- `sync-devops-all` e `sync-devops-qualidade` nasceram os dois em `*/10`
-- (migration 20260519153000, linhas 37 e 42). Disparam no MESMO segundo de
-- relógio: :00, :10, :20… Cada um abre um leque próprio de chamadas
-- simultâneas ao `/_apis/wit/workitems/{id}/updates` — 20 do primeiro, 10 do
-- segundo — então o pico real contra o Azure é a soma, sempre no mesmo
-- instante, 144 vezes por dia.
--
-- Isso apareceu na investigação do circuit breaker de identidade do Azure
-- (`HttpClientThrottler-IdentityHttpClient`, 31/08/2026): 30 chamadas
-- simultâneas está longe do limite de 110, e a saturação provavelmente não era
-- nossa — mas concentrar tudo num único segundo é escolha, não necessidade, e
-- `/updates` é o endpoint mais caro em identidade que consumimos (cada revisão
-- volta com `ChangedBy`/`AssignedTo` para o Azure resolver).
--
-- Nova grade dos crons que falam com o DevOps:
--
--     :00  sync-devops-all         (*/10)      — queries + filhas + histórico
--     :05  sync-devops-lifecycle   (5-55/10)   — só banco, não toca o Azure
--     :07  sync-devops-qualidade   (7-57/10)   — retorno QA  ← esta migration
--
-- Sete minutos, e não três: o `sync-all` roda o trabalho pesado em
-- `EdgeRuntime.waitUntil`, então o leque dele não é no segundo :00 — começa
-- depois do sync sequencial das queries. Às :07 ele já terminou.
--
-- Preserva o comando existente do job em vez de remontá-lo: URL, anon key e
-- `get_cron_secret()` do ambiente de produção continuam exatamente como estão
-- funcionando hoje. Só a expressão de agendamento muda.
--
-- Acompanha a mudança incremental em `devops-sync-qualidade` (deploy da edge),
-- que passa a revisitar só o que mudou desde o último `qa_retorno_synced_at`.
-- As duas são independentes: aplicar uma sem a outra é seguro.
-- =============================================================================

DO $$
DECLARE
  v_command text;
BEGIN
  SELECT j.command
    INTO v_command
  FROM cron.job j
  WHERE j.jobname = 'sync-devops-qualidade'
  LIMIT 1;

  IF v_command IS NULL THEN
    RAISE WARNING 'Cron sync-devops-qualidade não existe nesta instância — '
                  'nada a desalinhar. Rode 20260519153000 antes se for o caso.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('sync-devops-qualidade');
  PERFORM cron.schedule('sync-devops-qualidade', '7-57/10 * * * *', v_command);

  RAISE NOTICE 'sync-devops-qualidade reagendado para 7-57/10 (era */10).';
END;
$$;
