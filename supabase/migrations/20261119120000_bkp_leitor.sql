-- bkp_leitor: papel SOMENTE LEITURA da rotina de backup logico (pg_dump fora da Supabase; o plano Free nao tem backup).
-- Aplicada em PROD em 19/11/2026 e registrada em supabase_migrations.schema_migrations.
-- Sem senha aqui: LOGIN + verificador SCRAM-SHA-256 sao definidos fora do repositorio, pela maquina do backup
-- (a senha nunca passa pelo banco nem pelo log em texto puro).
-- BYPASSRLS: o pg_dump precisa ler todas as linhas (as tabelas tem RLS). Leitura apenas:
-- default_transaction_read_only + nenhum privilegio de escrita.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'bkp_leitor') then
    create role bkp_leitor nologin bypassrls;
  end if;
end $$;
alter role bkp_leitor bypassrls nocreatedb nocreaterole noinherit;
alter role bkp_leitor set default_transaction_read_only = on;
alter role bkp_leitor set statement_timeout = '15min';
alter role bkp_leitor set idle_in_transaction_session_timeout = '5min';
alter role bkp_leitor connection limit 3;

grant usage on schema public, privado, supabase_migrations to bkp_leitor;
grant select on all tables in schema public, privado, supabase_migrations to bkp_leitor;
grant select on all sequences in schema public, privado to bkp_leitor;
alter default privileges for role postgres in schema public, privado grant select on tables to bkp_leitor;
alter default privileges for role postgres in schema public, privado grant select on sequences to bkp_leitor;

-- (os grants em auth abaixo nao tem efeito na Supabase: o postgres tem USAGE em auth sem grant option;
--  a 20261119120100_bkp_leitor_auth os retira e troca por privado.bkp_auth())
grant usage on schema auth to bkp_leitor;
grant select on auth.users, auth.identities to bkp_leitor;
grant usage on schema cron to bkp_leitor;
grant select on cron.job to bkp_leitor;
