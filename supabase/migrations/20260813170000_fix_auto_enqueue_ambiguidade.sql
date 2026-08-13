-- ============================================================================
-- rpc_timelog_auto_enqueue: resolver a ambiguidade que matava o cron
-- ============================================================================
--
-- O enfileiramento automático nunca funcionou. `timelog-auto-enqueue` rodou 168
-- vezes em 7 dias e FALHOU nas 168, sempre com:
--
--     ERROR: column reference "vdesk_log_id" is ambiguous
--     LINE 14: ON CONFLICT (vdesk_log_id) DO NOTHING
--     DETAIL: It could refer to either a PL/pgSQL variable or a table column
--
-- A causa é a própria assinatura: `RETURNS TABLE (... vdesk_log_id uuid ...)`
-- cria um parâmetro de SAÍDA com o mesmo nome da coluna da tabela. Em quase
-- todo lugar isso não incomoda porque as referências estão qualificadas
-- (`c.vdesk_log_id`, `q.vdesk_log_id`), mas o alvo de `ON CONFLICT` não aceita
-- qualificação de tabela — e ali o PL/pgSQL não tem como decidir.
--
-- O sintoma foi silencioso porque o cron IRMÃO reportava sucesso: `timelog-auto-post`
-- rodou 168 vezes com status `succeeded`, já que processar uma fila vazia é
-- sucesso. Ficou parecendo automação saudável enquanto 200 horas de VDESK não
-- chegavam ao Azure DevOps.
--
-- Correção: `#variable_conflict use_column`, que manda o PL/pgSQL preferir a
-- COLUNA quando o nome também existe como variável. É cirúrgico aqui porque
-- todas as outras referências do corpo já estão qualificadas, então nenhuma
-- outra resolução muda.
--
-- Por que não renomear o parâmetro de saída: `CREATE OR REPLACE` não permite
-- trocar nome de parâmetro, exigiria `DROP FUNCTION` — uma janela em que a
-- função não existe, com o cron podendo disparar no meio. O ganho não paga.
--
-- Nada mais do corpo muda em relação à versão em produção.

create or replace function public.rpc_timelog_auto_enqueue(
  p_days integer default 7,
  p_apply boolean default false
)
returns table (
  acao text,
  vdesk_log_id uuid,
  usuario_vdesk text,
  log_date date,
  task_devops integer,
  minutos integer,
  motivo text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_desde date := (now() at time zone 'America/Sao_Paulo')::date - greatest(p_days, 0);
begin
  if not (public.hub_is_admin() or session_user in ('postgres', 'supabase_admin')) then
    raise exception 'permission denied: admin required';
  end if;

  create temp table _cand on commit drop as
  select
    v.id                                       as vdesk_log_id,
    v.usuario_vdesk,
    v.log_date,
    v.task_devops,
    round(v.tempo_segundos / 60.0)::int        as minutos,
    cm.devops_email,
    coalesce(cm.canonical_name, v.usuario_vdesk) as display,
    format('VDESK OS %s — %s — Lançamento automatizado FlagHub',
           v.num_os, coalesce(v.usuario_vdesk, '?'))  as notas,
    case
      when round(v.tempo_segundos / 60.0)::int <= 0 then 'tempo zerado'
      when cm.devops_email is null                  then 'sem e-mail mapeado'
      else null
    end                                        as impedimento
  from public.vdesk_time_logs v
  left join public.devops_collaborator_map cm
    on lower(cm.vdesk_user_name) = lower(v.usuario_vdesk)
   and coalesce(cm.is_active, true)
  where v.log_date >= v_desde
    -- (a) nunca reenfileirar o que já passou pela fila, em qualquer status
    and not exists (
      select 1 from public.timelog_post_queue q where q.vdesk_log_id = v.id
    );

  if p_apply then
    insert into public.timelog_post_queue (
      vdesk_log_id, task_devops, log_date, time_minutes,
      target_user_email, target_user_display, vdesk_user_name,
      notes, dry_run, status, approved_at
    )
    select
      c.vdesk_log_id, c.task_devops, c.log_date, c.minutos,
      c.devops_email, c.display, c.usuario_vdesk,
      c.notas, false, 'approved', now()
    from _cand c
    where c.impedimento is null
    -- Cinto e suspensório: se duas passadas se sobrepuserem, o índice único
    -- resolve sem estourar erro no cron.
    on conflict (vdesk_log_id) do nothing;
  end if;

  return query
  select
    case when c.impedimento is not null then 'bloqueado'
         when p_apply                   then 'enfileirado'
         else 'seria enfileirado' end,
    c.vdesk_log_id, c.usuario_vdesk, c.log_date, c.task_devops, c.minutos,
    c.impedimento
  from _cand c
  order by (c.impedimento is not null) desc, c.log_date desc, c.usuario_vdesk;
end;
$function$;

comment on function public.rpc_timelog_auto_enqueue(integer, boolean) is
  'Enfileira apontamentos do VDESK para postagem no DevOps. `#variable_conflict use_column` é obrigatório: sem ele o ON CONFLICT colide com o parâmetro de saída vdesk_log_id e o cron falha em silêncio.';
