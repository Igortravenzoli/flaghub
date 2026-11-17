-- ============================================================================
-- Verificação SEC1 (20261117090000), parte 1 de 2: o ENSAIO da DDL.
--
-- Roda em PRODUÇÃO antes da migration: um DO que aplica a migration por dentro,
-- confere as permissões e termina em RAISE — nada fica gravado.
--   • "SEC1 OK — ..."     → passou (e nada foi gravado)
--   • "SEC1 FALHOU: ..."  → a asserção que quebrou
--
-- NÃO conta linha aqui dentro: o ALTER VIEW segura AccessExclusiveLock nas views
-- até o fim da transação, e contar 23 usuários × 4 views leva minutos — o telão
-- e as telas ficariam esperando (o 1º ensaio, de 16/11, mostrou isso: >100 s).
-- Por isso: lock_timeout curto e só checagens de catálogo.
--
-- A comparação de linhas por usuário é só leitura e roda SEM DDL:
--   scripts/sec1-compara-invoker.mjs  (roda a definição de cada view como o
--   usuário, que é o que security_invoker faz; resultado de 16/11: os 23
--   aprovados iguais, monitor igual, pendente 0 nas quatro).
-- Depois de aplicada: supabase/verificacao/sec1_views_conferencia.sql.
-- ============================================================================
SET lock_timeout = '3s';
DO $$
DECLARE
  v_r      record;
  v_quebra text;
BEGIN
  EXECUTE 'ALTER VIEW public.v_timelog_unified       SET (security_invoker = true)';
  EXECUTE 'ALTER VIEW public.v_colaborador_ausencias SET (security_invoker = true)';
  EXECUTE 'ALTER VIEW public.vw_infraestrutura_kpis  SET (security_invoker = true)';
  FOR v_r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm') LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v_r.relname);
  END LOOP;

  -- D) a anon não tem privilégio em view nenhuma do public
  SELECT string_agg(c.relname, ',') INTO v_quebra
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
     AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('anon', c.oid, 'INSERT')
          OR has_table_privilege('anon', c.oid, 'UPDATE') OR has_table_privilege('anon', c.oid, 'DELETE'));
  IF v_quebra IS NOT NULL THEN RAISE EXCEPTION 'SEC1 FALHOU (D): a anon ainda tem privilégio em %', v_quebra; END IF;

  -- D2) authenticated segue podendo ler as quatro
  SELECT string_agg(x, ',') INTO v_quebra
    FROM unnest(ARRAY['v_timelog_unified', 'v_colaborador_ausencias', 'vw_infraestrutura_kpis', 'v_horas_negocio']) x
   WHERE NOT has_table_privilege('authenticated', ('public.' || x)::regclass, 'SELECT');
  IF v_quebra IS NOT NULL THEN RAISE EXCEPTION 'SEC1 FALHOU (D2): authenticated perdeu SELECT em %', v_quebra; END IF;

  -- E) nenhuma view do public sem security_invoker
  SELECT string_agg(c.relname, ',') INTO v_quebra
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v'
     AND NOT coalesce(c.reloptions::text ~* 'security_invoker=(true|on)', false);
  IF v_quebra IS NOT NULL THEN RAISE EXCEPTION 'SEC1 FALHOU (E): sem security_invoker: %', v_quebra; END IF;

  RAISE EXCEPTION 'SEC1 OK — D: anon sem views; D2: authenticated lê as 4; E: todas invoker (nada foi gravado)';
END $$;
