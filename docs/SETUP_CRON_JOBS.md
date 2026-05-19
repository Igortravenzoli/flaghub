# Setup dos Cron Jobs — pg_cron + Vault

> **Executar manualmente no SQL Editor de cada ambiente (DEV / PROD).**
> NÃO colocar em migrations — contém dados específicos do ambiente.

## Pré-requisitos

1. Extensões `pg_cron` e `pg_net` habilitadas
2. Secret `CRON_SECRET` configurado nas Edge Functions (Supabase Dashboard > Settings > Functions)
3. Secret armazenado no Vault (passo abaixo)

---

## 1. Armazenar o secret no Vault

```sql
-- Executar UMA VEZ por ambiente
-- Substituir 'SEU_VALOR_AQUI' pelo CRON_SECRET do ambiente
SELECT vault.create_secret('SEU_VALOR_AQUI', 'cron_secret', 'Secret para autenticação de cron jobs');
```

## 2. Criar função helper (idempotente)

```sql
CREATE OR REPLACE FUNCTION public.get_cron_secret()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT decrypted_secret 
  FROM vault.decrypted_secrets 
  WHERE name = 'cron_secret'
  LIMIT 1;
$$;
```

## 3. Agendar os cron jobs

> **IMPORTANTE:** Substituir `PROJECT_REF` pela referência do projeto Supabase do ambiente.
> - DEV: `onpdhywrzjtwxaxuvijw`
> - PROD: `<referência_do_projeto_prod>`

```sql
-- 1. DevOps Sync All — a cada 10 minutos
SELECT cron.schedule(
  'sync-devops-all',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/devops-sync-all',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_cron_secret()
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- 2. VDesk Sync Base Clientes — a cada 15 minutos
SELECT cron.schedule(
  'sync-vdesk-clientes',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/vdesk-sync-base-clientes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_cron_secret()
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- 3. VDesk Sync Helpdesk — a cada 15 minutos
SELECT cron.schedule(
  'sync-vdesk-helpdesk',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/vdesk-sync-helpdesk',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_cron_secret()
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- 4. DevOps TimeLog — a cada 15 minutos
SELECT cron.schedule(
  'sync-devops-timelog',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/devops-sync-timelog',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_cron_secret()
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- 5. VDesk TimeLog — diário às 01:00 UTC
SELECT cron.schedule(
  'sync-vdesk-timelog',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/vdesk-sync-timelog',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_cron_secret()
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- 6. DevOps Qualidade — a cada 10 minutos
SELECT cron.schedule(
  'sync-devops-qualidade',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/devops-sync-qualidade',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_cron_secret()
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

## Observação (retenção)

Os jobs de retenção abaixo sao gerenciados por migration e nao precisam ser criados manualmente neste documento:

- `cleanup-helpdesk-snapshots-daily` (90 dias)
- `cleanup-hub-raw-ingestions-daily` (30 dias)

## 4. Verificar

```sql
-- Listar jobs agendados
SELECT * FROM cron.job;

-- Ver execuções recentes
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Verificar SUCESSO REAL via status HTTP do net.http_post
SELECT
  jrd.jobid,
  j.jobname,
  jrd.start_time,
  jrd.end_time,
  jrd.status AS cron_status,
  r.status_code,
  CASE WHEN r.status_code BETWEEN 200 AND 299 THEN 'ok' ELSE 'erro_http' END AS http_result,
  left(coalesce(r.content, ''), 200) AS response_snippet
FROM cron.job_run_details jrd
JOIN cron.job j ON j.jobid = jrd.jobid
LEFT JOIN net._http_response r ON r.id = jrd.return_message::bigint
WHERE j.jobname IN (
  'sync-devops-all',
  'sync-vdesk-clientes',
  'sync-vdesk-helpdesk',
  'sync-devops-timelog',
  'sync-vdesk-timelog',
  'sync-devops-qualidade'
)
ORDER BY jrd.start_time DESC
LIMIT 50;
```

## 5. Remover jobs (se necessário)

```sql
SELECT cron.unschedule('sync-devops-all');
SELECT cron.unschedule('sync-vdesk-clientes');
SELECT cron.unschedule('sync-vdesk-helpdesk');
SELECT cron.unschedule('sync-devops-timelog');
SELECT cron.unschedule('sync-vdesk-timelog');
SELECT cron.unschedule('sync-devops-qualidade');
```

---

## Checklist para replicar em PROD

- [ ] Configurar secret `CRON_SECRET` nas Edge Functions do projeto PROD
- [ ] Executar passo 1 (Vault) com o mesmo valor
- [ ] Executar passo 2 (função helper)
- [ ] Executar passo 3 substituindo `PROJECT_REF` pela ref de PROD
- [ ] Verificar com passo 4
