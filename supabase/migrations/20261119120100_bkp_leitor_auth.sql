-- Aplicada em PROD em 19/11/2026 e registrada em supabase_migrations.schema_migrations.
-- O postgres da Supabase tem USAGE em auth SEM grant option: o "grant usage on schema auth" do bkp_leitor
-- e ignorado em silencio. A leitura de auth.users/identities passa por esta funcao SECURITY DEFINER,
-- executavel so pelo bkp_leitor, que devolve as linhas como JSON (restore: json_populate_record).
create or replace function privado.bkp_auth(p_tabela text)
returns setof json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_tabela = 'users' then
    return query select row_to_json(u) from auth.users u order by u.created_at, u.id;
  elsif p_tabela = 'identities' then
    return query select row_to_json(i) from auth.identities i order by i.created_at, i.id;
  else
    raise exception 'bkp_auth: tabela nao suportada: %', p_tabela;
  end if;
end
$$;
revoke all on function privado.bkp_auth(text) from public, anon, authenticated, service_role;
grant execute on function privado.bkp_auth(text) to bkp_leitor;

revoke select on auth.users, auth.identities from bkp_leitor;
revoke usage on schema auth from bkp_leitor;
