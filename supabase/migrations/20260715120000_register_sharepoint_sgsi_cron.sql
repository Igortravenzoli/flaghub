-- Registra o cron de sincronização das listas SG (SharePoint/SGSI).
--
-- Causa raiz do "parou de atualizar" / HubUpTime = down: a edge function
-- `sharepoint-sync-sgsi` nunca teve um cron agendado — só rodava quando alguém
-- clicava em "Sincronizar SGSI (SharePoint)" no menu do setor. Quando
-- `sgsi_lists.synced_at` passa de 7 dias, o nó "SharePoint SGSI" do HubUpTime
-- vira `down` (statusPorIdade: up ≤ 48h, warn ≤ 7d, down depois).
--
-- Agenda a cada 6h (4×/dia) — mantém o batimento < 48h (verde) com folga.
--
-- IMPORTANTE (aprendido em PROD 2026-07-15): o gateway das Edge Functions do
-- Supabase EXIGE o header `Authorization` (apikey/anon); sem ele o request é
-- rejeitado com 401 UNAUTHORIZED_NO_AUTH_HEADER antes de chegar na função.
-- O vault deste projeto NÃO tem um secret chamado 'SUPABASE_ANON_KEY', então
-- derivamos o header Authorization de um cron de sync já existente e funcional
-- (mesma técnica evita hardcode do token no repositório). Fallback: vault.

DO $$
DECLARE
  v_auth     text;
  v_command  text;
  v_job_name text := 'sync-sharepoint-sgsi';
  v_url      text := 'https://nxmgppfyltwsqryfxkbm.supabase.co/functions/v1/sharepoint-sync-sgsi';
  v_schedule text := '0 */6 * * *';
BEGIN
  -- 1) Preferencial: reaproveita o Authorization de um cron que já funciona.
  SELECT substring(j.command from 'Bearer [A-Za-z0-9._-]+')
  INTO v_auth
  FROM cron.job j
  WHERE j.command LIKE '%Authorization%'
    AND j.command LIKE '%/functions/v1/%'
    AND j.jobname <> v_job_name
  ORDER BY j.jobname
  LIMIT 1;

  -- 2) Fallback: vault (caso o secret exista com este nome).
  IF v_auth IS NULL THEN
    SELECT 'Bearer ' || ds.decrypted_secret
    INTO v_auth
    FROM vault.decrypted_secrets ds
    WHERE ds.name = 'SUPABASE_ANON_KEY'
    LIMIT 1;
  END IF;

  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'Não foi possível derivar o header Authorization (nenhum cron modelo nem SUPABASE_ANON_KEY no vault). Cron % NÃO agendado.', v_job_name;
  END IF;

  v_command := format($cmd$
SELECT net.http_post(
  url := %L,
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', %L,
    'x-cron-secret', public.get_cron_secret()
  ),
  body := '{}'::jsonb
) AS request_id;
$cmd$, v_url, v_auth);

  -- Idempotente: remove agendamento anterior (se houver) e reagenda.
  PERFORM cron.unschedule(v_job_name)
  WHERE EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = v_job_name);

  PERFORM cron.schedule(v_job_name, v_schedule, v_command);
END;
$$;
