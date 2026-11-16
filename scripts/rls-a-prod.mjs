#!/usr/bin/env node
/**
 * RLS-A — aplicação MANUAL em produção (o Igor roda; nenhuma sessão do Claude
 * roda isto). Fecha as falhas de aprovação da migration
 * supabase/migrations/20261116120000_rls_fechar_falhas_aprovacao.sql.
 *
 *   SUPABASE_PAT=<token> node scripts/rls-a-prod.mjs pre        # só leitura: o que existe e o que muda
 *   SUPABASE_PAT=<token> node scripts/rls-a-prod.mjs aplicar    # migration + conferência + registro, 1 transação
 *   SUPABASE_PAT=<token> node scripts/rls-a-prod.mjs conferir   # só leitura: confere depois
 *   SUPABASE_PAT=<token> node scripts/rls-a-prod.mjs rollback   # emergência: reabre as políticas e tira os guards
 *
 * Os SQL são lidos de `origin/main` com `git show` (o que está publicado, não o
 * que está no disco). Cada modo é UMA chamada a /database/query, que é UMA
 * transação: no `aplicar`, se a conferência estoura, a migration volta inteira
 * e o registro em schema_migrations não acontece.
 *
 * Ordem sugerida: merge do PR → `git fetch` → pre → aplicar → abrir o telão
 * (monitor@flag.com.br) e uma tela de cada setor como usuário aprovado →
 * publicar as edges devops-post-timelog e devops-transbordo (merge não publica
 * edge: `supabase functions deploy devops-post-timelog devops-transbordo`).
 */
import { execFileSync } from 'node:child_process';

const PROD = 'nxmgppfyltwsqryfxkbm';
const MIGRATION = 'supabase/migrations/20261116120000_rls_fechar_falhas_aprovacao.sql';
const VERSAO = '20261116120000';
const NOME = 'rls_fechar_falhas_aprovacao';
const REF_GIT = process.env.RLS_A_REF || 'origin/main';

const modo = process.argv[2];
const pat = process.env.SUPABASE_PAT;
if (!pat) { console.error('Defina SUPABASE_PAT.'); process.exit(2); }
if (!['pre', 'aplicar', 'conferir', 'rollback'].includes(modo)) {
  console.error('Modo: pre | aplicar | conferir | rollback'); process.exit(2);
}

const doGit = (caminho) =>
  execFileSync('git', ['show', `${REF_GIT}:${caminho}`], { encoding: 'utf8', maxBuffer: 16 << 20 })
    .replace(/^﻿/, '');

async function query(sql) {
  const resp = await fetch(`https://api.supabase.com/v1/projects/${PROD}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const txt = await resp.text();
  let corpo;
  try { corpo = JSON.parse(txt); } catch { corpo = txt; }
  return { status: resp.status, corpo };
}

const PRE = `
SELECT 'migration ja registrada' AS item, count(*)::text AS valor
  FROM supabase_migrations.schema_migrations WHERE version = '${VERSAO}'
UNION ALL
SELECT 'politica ' || tablename || '.' || policyname,
       cmd || ' roles=' || roles::text || ' using=' || coalesce(qual, '-') || ' check=' || coalesce(with_check, '-')
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('fabrica_read_entries','comercial_metas','sprint_indicator_snapshots','devops_projects',
                     'devops_repos','comercial_funil','comercial_funil_lancamentos','comercial_produtos',
                     'fabrica_squad_membership','devops_tag_dicionario')
UNION ALL
SELECT 'funcao ' || p.oid::regprocedure::text,
       l.lanname || CASE WHEN p.prosecdef THEN ' DEFINER' ELSE ' INVOKER' END
       || ' anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')
       || ' auth=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
       || CASE WHEN position('-- RLS-A guard' IN p.prosrc) > 0 THEN ' JA-COM-GUARD' ELSE '' END
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
 WHERE n.nspname = 'public' AND p.proname IN (
   'rpc_qa_atemporal_summary','rpc_qa_encerramentos_por_usuario','rpc_qa_closed_por_sprint_periodo',
   'rpc_qa_items_atemporal','rpc_qa_handoff_histogram','rpc_get_sprint_historical_v2','rpc_qa_historical_series',
   'rpc_get_sprint_daily_progress','rpc_transbordo_elegiveis','rpc_transbordo_historico','rpc_transbordo_contexto',
   'rpc_qa_return_open_items','rpc_qa_exec_fila_aging','rpc_qa_exec_retornos_distribuicao','rpc_gerencial_qa_items',
   'rpc_gerencial_qa_summary','rpc_get_sprint_historical','rpc_list_sprint_snapshots','rpc_compare_sprint_snapshots',
   'rpc_get_sprint_retrospective','rpc_list_all_sprints_2026','rpc_compare_multiple_sprints_2026',
   'rpc_sprint_annual_timeline','rpc_devops_timelog_agg','rpc_feature_pbi_summary','rpc_pbi_health_overview',
   'rpc_pbi_bottleneck_summary','rpc_gerencial_fabrica_summary','rpc_qa_desempenho_responsavel',
   'rpc_qa_return_by_assignee','rpc_qa_return_by_sprint','rpc_qa_return_summary','get_recent_batches',
   'get_batch_statistics','rpc_devops_repo_classificar','insert_movimentacao_comercial',
   'update_movimentacao_comercial','delete_movimentacao_comercial','sync_qa_return_count_from_events',
   'compute_pbi_health_all','provision_user','rpc_timelog_queue_post','rpc_timelog_set_status',
   'rpc_lifecycle_refresh_candidates')
UNION ALL
SELECT 'pg_version', current_setting('server_version')
ORDER BY 1;`;

let sql;
if (modo === 'pre') sql = PRE;
if (modo === 'conferir') sql = doGit('supabase/sql/rls_a_conferencia.sql');
if (modo === 'rollback') sql = doGit('supabase/sql/rls_a_rollback.sql');
if (modo === 'aplicar') {
  sql = [
    doGit(MIGRATION),
    doGit('supabase/sql/rls_a_conferencia.sql'),
    `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('${VERSAO}', '${NOME}')
       ON CONFLICT (version) DO NOTHING;`,
    PRE,
  ].join('\n;\n');
}

console.log(`[rls-a] modo=${modo} projeto=${PROD} fonte=${REF_GIT}`);
const { status, corpo } = await query(sql);
console.log(`[rls-a] HTTP ${status}`);
if (Array.isArray(corpo)) {
  for (const linha of corpo) console.log(`${linha.item}  |  ${linha.valor}`);
} else {
  console.log(typeof corpo === 'string' ? corpo : JSON.stringify(corpo, null, 2));
}
process.exit(status >= 200 && status < 300 ? 0 : 1);
