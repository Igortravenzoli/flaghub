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
```

## 4. Verificar

```sql
-- Listar jobs agendados
SELECT * FROM cron.job;

-- Ver execuções recentes
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
```

## 5. Remover jobs (se necessário)

```sql
SELECT cron.unschedule('sync-devops-all');
SELECT cron.unschedule('sync-vdesk-clientes');
SELECT cron.unschedule('sync-vdesk-helpdesk');
```

---

## Checklist para replicar em PROD

- [ ] Configurar secret `CRON_SECRET` nas Edge Functions do projeto PROD
- [ ] Executar passo 1 (Vault) com o mesmo valor
- [ ] Executar passo 2 (função helper)
- [ ] Executar passo 3 substituindo `PROJECT_REF` pela ref de PROD
- [ ] Verificar com passo 4
