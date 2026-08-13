-- ============================================================================
-- Saúde da cadeia VDESK → Azure DevOps
-- ============================================================================
--
-- Por que isto existe: o enfileiramento ficou quebrado por semanas e ninguém
-- viu, porque TODO sinal disponível media ATIVIDADE. O cron `timelog-auto-post`
-- reportava `succeeded` nas 168 execuções — processar fila vazia é sucesso. O
-- pg_cron dizia que estava tudo bem enquanto 2.438 h não chegavam ao DevOps.
--
-- A lição: medir atividade dá falso verde. Esta função mede BACKLOG — o que
-- deveria ter andado e não andou. Backlog não tem como mentir: se existe
-- apontamento elegível fora da fila há horas, a cadeia está parada, não importa
-- o que o cron diga.
--
-- Também alarga a janela do enfileiramento de 7 para 21 dias. Medido em
-- 13/08/2026: nos últimos 90 dias os 494 apontamentos do VDESK chegaram todos
-- dentro de 7 dias, com pior caso de 6. Ou seja, a janela nunca estourou — mas
-- 6 de 7 é folga de um dia, e o que cai fora dela é PERDA DEFINITIVA e
-- silenciosa, porque o apontamento nunca mais volta a ser candidato. 21 dias
-- custa uma varredura maior e compra três semanas de margem.

-- ATENÇÃO a quem for estender esta função: ela é `security invoker` e lê APENAS
-- `vdesk_time_logs`, `timelog_post_queue` e `devops_collaborator_map`. As três
-- liberam SELECT para `authenticated` com `hub_is_approved()`, sem recorte por
-- área — por isso todo utilizador aprovado vê o mesmo quadro.
--
-- NÃO acrescente leitura de `devops_time_logs` aqui. A política dela é
-- `hub_is_admin() OR membro da área`, e um não-admin passaria a receber
-- contadores menores: o vigia diria "saudável" por não enxergar o problema.
-- Falso verde é exatamente a falha que esta função existe para eliminar.

-- ── 1. A pergunta "a cadeia está viva?" em uma linha ────────────────────────

create or replace function public.rpc_timelog_chain_health(p_days integer default 21)
returns table (
  saudavel                boolean,
  veredito                text,
  orfaos                  bigint,
  orfao_mais_antigo_horas numeric,
  horas_orfas             numeric,
  fora_da_janela          bigint,
  sem_email_mapeado       bigint,
  fila_approved           bigint,
  approved_mais_antigo_h  numeric,
  presos_em_posting       bigint,
  em_erro                 bigint,
  ultimo_post             timestamptz
)
language sql
stable
security invoker
set search_path = public
as $fn$
with janela as (
  select ((now() at time zone 'America/Sao_Paulo')::date - greatest(p_days, 0))::date as desde
),
-- Espelha o predicado de rpc_timelog_auto_enqueue. Se um dos dois mudar, o
-- outro precisa mudar junto — senão o vigia deixa de ver o que o enfileirador
-- deixou para trás.
candidatos as (
  select
    v.synced_at,
    v.log_date,
    round(v.tempo_segundos / 60.0)::int as minutos,
    (cm.devops_email is not null)       as tem_email,
    (v.log_date >= (select desde from janela)) as na_janela
  from public.vdesk_time_logs v
  left join public.devops_collaborator_map cm
    on lower(cm.vdesk_user_name) = lower(v.usuario_vdesk)
   and coalesce(cm.is_active, true)
  -- Teto de varredura: sem ele a consulta cresceria para sempre junto do
  -- histórico, e o vigia viraria o próprio problema de desempenho.
  where v.log_date >= (select desde from janela) - 60
    and not exists (
      select 1 from public.timelog_post_queue q where q.vdesk_log_id = v.id
    )
),
orf as (
  select
    count(*) filter (where na_janela and tem_email and minutos > 0)        as orfaos,
    min(synced_at) filter (where na_janela and tem_email and minutos > 0)  as mais_antigo,
    coalesce(sum(minutos) filter (where na_janela and tem_email and minutos > 0), 0) / 60.0 as horas_orfas,
    count(*) filter (where not na_janela and tem_email and minutos > 0)    as fora_da_janela,
    count(*) filter (where na_janela and not tem_email and minutos > 0)    as sem_email
  from candidatos
),
fila as (
  select
    count(*) filter (where status = 'approved')                       as approved,
    min(created_at) filter (where status = 'approved')                as approved_mais_antigo,
    count(*) filter (where status = 'posting'
                       and coalesce(last_attempt_at, updated_at) < now() - interval '30 minutes') as presos,
    count(*) filter (where status = 'error')                          as em_erro,
    max(posted_at)                                                    as ultimo_post
  from public.timelog_post_queue
)
select
  -- Saudável = nada parado há mais de 3 horas e nada em erro. Três horas dá
  -- folga para três ciclos do par enqueue/post sem gritar por um atraso normal.
  -- Cada condição vai entre parênteses de propósito: `A or B and C` agrupa como
  -- `A or (B and C)` em SQL, e sem os parênteses um único órfão recente daria
  -- verde mesmo com a fila travada.
  (
        (coalesce(orf.orfaos, 0) = 0
         or extract(epoch from (now() - orf.mais_antigo)) / 3600 < 3)
    and (coalesce(fila.approved, 0) = 0
         or extract(epoch from (now() - fila.approved_mais_antigo)) / 3600 < 3)
    and coalesce(fila.presos, 0) = 0
    and coalesce(fila.em_erro, 0) = 0
  )                                                                                  as saudavel,
  case
    when coalesce(fila.em_erro, 0) > 0
      then fila.em_erro || ' lançamento(s) em erro — não há retry automático, precisa de decisão humana'
    when coalesce(fila.presos, 0) > 0
      then fila.presos || ' preso(s) em posting há mais de 30 min — pode já estar no DevOps, conferir antes de reprocessar'
    when coalesce(fila.approved, 0) > 0
         and extract(epoch from (now() - fila.approved_mais_antigo)) / 3600 >= 3
      then fila.approved || ' na fila há ' || round(extract(epoch from (now() - fila.approved_mais_antigo)) / 3600) || 'h sem postar — o cron de postagem parou'
    when coalesce(orf.orfaos, 0) > 0
         and extract(epoch from (now() - orf.mais_antigo)) / 3600 >= 3
      then orf.orfaos || ' apontamento(s) fora da fila há ' || round(extract(epoch from (now() - orf.mais_antigo)) / 3600) || 'h — o cron de enfileiramento parou'
    when coalesce(orf.sem_email, 0) > 0
      then orf.sem_email || ' apontamento(s) parados por falta de e-mail no mapa de colaboradores'
    -- Backlog antigo NÃO derruba o veredito. Ele é uma decisão adiada, não uma
    -- falha da cadeia, e misturar os dois faria o sinal viver vermelho — que é
    -- o mesmo que viver apagado. Entra como nota, e o número fica na coluna
    -- `fora_da_janela` para quem quiser agir.
    when coalesce(orf.fora_da_janela, 0) > 0
      then 'cadeia saudável · ' || orf.fora_da_janela || ' apontamento(s) antigos fora da janela de ' || p_days || ' dias, aguardando decisão'
    else 'cadeia saudável'
  end                                                                                as veredito,
  coalesce(orf.orfaos, 0),
  round((extract(epoch from (now() - orf.mais_antigo)) / 3600)::numeric, 1),
  round(orf.horas_orfas::numeric, 2),
  coalesce(orf.fora_da_janela, 0),
  coalesce(orf.sem_email, 0),
  coalesce(fila.approved, 0),
  round((extract(epoch from (now() - fila.approved_mais_antigo)) / 3600)::numeric, 1),
  coalesce(fila.presos, 0),
  coalesce(fila.em_erro, 0),
  fila.ultimo_post
from orf, fila;
$fn$;

comment on function public.rpc_timelog_chain_health(integer) is
  'Saúde da cadeia VDESK->DevOps medida por BACKLOG, nunca por atividade: o cron de postagem reportava sucesso processando fila vazia enquanto 2.438h não eram enviadas.';

grant execute on function public.rpc_timelog_chain_health(integer) to authenticated;

-- ── 2. Alargar a janela do enfileiramento ──────────────────────────────────
--
-- `cron.schedule` com o mesmo nome substitui o job existente. Se falhar por
-- permissão, o job segue com 7 dias e a função de saúde passa a acusar o que
-- cair fora — o sistema fica pior, mas não fica cego.

select cron.schedule(
  'timelog-auto-enqueue',
  '10 * * * *',
  $cron$select count(*) from public.rpc_timelog_auto_enqueue(21, true);$cron$
);
