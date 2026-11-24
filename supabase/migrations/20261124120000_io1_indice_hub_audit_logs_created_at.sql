-- IO-1: índice em hub_audit_logs(created_at).
--
-- A tabela (57 MB, ~127 mil linhas, 99,9% log de sync) só tinha a chave primária.
-- O job `cleanup-hub-audit-logs-daily` roda
--   DELETE FROM public.hub_audit_logs WHERE created_at < now() - interval '90 days'
-- toda noite e, sem índice na data, varria a tabela inteira: 20,7 MB lidos do disco
-- por rodada, 890 MB em 44 rodadas, 43% de toda a leitura de disco do banco
-- (pg_stat_statements de 11/10 a 24/11/2026), e de 7 a 18 s por execução. Com o
-- índice o DELETE vai direto às ~1,3 mil linhas do dia que vence.
--
-- CREATE INDEX comum (não CONCURRENTLY): a aplicação é uma chamada só a
-- /database/query, que é uma transação, e CONCURRENTLY não roda em transação. O
-- índice de ~127 mil linhas sai em cerca de um segundo; nesse intervalo a tabela
-- aceita leitura e segura os INSERTs do hub_audit_log, que esperam e seguem. O
-- lock_timeout faz a migration desistir em 3 s se não conseguir a trava, em vez
-- de enfileirar atrás de uma transação longa e prender quem vier depois.
--
-- Volta: DROP INDEX IF EXISTS public.hub_audit_logs_created_at_idx;

SET LOCAL lock_timeout = '3s';

CREATE INDEX IF NOT EXISTS hub_audit_logs_created_at_idx
  ON public.hub_audit_logs (created_at);

COMMENT ON INDEX public.hub_audit_logs_created_at_idx IS
  'IO-1 (24/11/2026): serve o DELETE diário por created_at do cleanup-hub-audit-logs-daily, que varria a tabela inteira.';
