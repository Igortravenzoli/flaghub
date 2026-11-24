#!/usr/bin/env node
/**
 * IO-1 — aplicação MANUAL em produção (o Igor roda; nenhuma sessão do Claude roda isto).
 * Duas mudanças independentes, cada uma com o seu modo:
 *   • o índice de hub_audit_logs(created_at) — supabase/migrations/20261124120000_io1_indice_hub_audit_logs_created_at.sql
 *   • a edge devops-sync-timelog v3.6 (falha passageira do diff não regrava mais a base)
 *
 *   $env:SUPABASE_PAT = '<token>'            # PowerShell; SUPABASE_ACCESS_TOKEN também serve
 *   node scripts/io1-prod.mjs arquivos       # sem rede e sem token: o que a edge levaria, lido do REF
 *   node scripts/io1-prod.mjs pre            # só leitura: índice, registro da migration, versão da edge, quedas recentes
 *   node scripts/io1-prod.mjs indice         # migration + conferência + registro, numa transação
 *   node scripts/io1-prod.mjs edge           # publica devops-sync-timelog a partir do REF
 *   node scripts/io1-prod.mjs conferir       # só leitura: o filtro da limpeza usa o índice; edge nova no ar; últimas rodadas
 *   node scripts/io1-prod.mjs volta-indice   # DROP INDEX (o registro da migration fica)
 *
 * Os arquivos são lidos de REF (padrão origin/main) com `git show`: o que está publicado, não o
 * que está no disco. Ordem: merge do PR → `git fetch` → pre → indice → edge → conferir.
 * Merge não publica edge: sem o modo `edge`, a v3.5 continua no ar.
 * Volta da edge: republicar a v3.5 a partir do commit anterior ao merge deste PR:
 *   $env:REF = '<commit>'; $env:EDGE_SEM_MARCA = '1'; node scripts/io1-prod.mjs edge
 */
import { execFileSync } from 'node:child_process';

const PROJ = 'nxmgppfyltwsqryfxkbm';
const API = `https://api.supabase.com/v1/projects/${PROJ}`;
const MIGRATION = 'supabase/migrations/20261124120000_io1_indice_hub_audit_logs_created_at.sql';
const VERSAO = '20261124120000';
const NOME = 'io1_indice_hub_audit_logs_created_at';
const INDICE = 'hub_audit_logs_created_at_idx';
const SLUG = 'devops-sync-timelog';
const ENTRADA = `supabase/functions/${SLUG}/index.ts`;
const MARCA = 'devops-sync-timelog v3.6';
const REF = process.env.REF || 'origin/main';

const modo = process.argv[2];
const MODOS = ['arquivos', 'pre', 'indice', 'edge', 'conferir', 'volta-indice'];
if (!MODOS.includes(modo)) { console.error(`modo: ${MODOS.join(' | ')}`); process.exit(2); }
const pat = process.env.SUPABASE_PAT || process.env.SUPABASE_ACCESS_TOKEN;
if (!pat && modo !== 'arquivos') { console.error('Defina SUPABASE_PAT.'); process.exit(2); }
const H = { Authorization: `Bearer ${pat}` };

const doGit = (caminho) =>
  execFileSync('git', ['show', `${REF}:${caminho}`], { encoding: 'utf8', maxBuffer: 16 << 20 }).replace(/^﻿/, '');

async function query(sql, soLeitura = false) {
  const r = await fetch(`${API}/database/query`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify(soLeitura ? { query: sql, read_only: true } : { query: sql }),
  });
  const txt = await r.text();
  let corpo;
  try { corpo = JSON.parse(txt); } catch { corpo = txt; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${typeof corpo === 'string' ? corpo : JSON.stringify(corpo)}`);
  return corpo;
}

const mostra = (linhas) => { for (const l of linhas) console.log(`${l.item}  |  ${l.valor}`); };

/** A entrada e tudo de _shared que ela importa, direta ou indiretamente. */
function arquivosDaEdge() {
  const fonte = doGit(ENTRADA);
  if (!process.env.EDGE_SEM_MARCA && !fonte.includes(MARCA)) {
    throw new Error(`${REF}:${ENTRADA} não tem a marca "${MARCA}" (o PR entrou no main? rodou git fetch?)`);
  }
  const fs = new Map([[ENTRADA, fonte]]);
  const fila = [fonte];
  while (fila.length) {
    for (const m of fila.pop().matchAll(/from\s+['"](?:\.\.\/_shared|\.)\/([\w.-]+\.ts)['"]/g)) {
      const p = `supabase/functions/_shared/${m[1]}`;
      if (fs.has(p)) continue;
      const txt = doGit(p);
      fs.set(p, txt);
      fila.push(txt);
    }
  }
  return fs;
}

const SQL_ESTADO = `
SELECT 'indice ${INDICE}' AS item,
       coalesce((SELECT indexdef || ' | ' || pg_size_pretty(pg_relation_size(i.indexrelid)) || ' | valido=' || i.indisvalid
                   FROM pg_indexes x JOIN pg_class c ON c.relname = x.indexname
                   JOIN pg_index i ON i.indexrelid = c.oid
                  WHERE x.schemaname = 'public' AND x.indexname = '${INDICE}'), 'NAO EXISTE') AS valor
UNION ALL
SELECT 'migration ${VERSAO} registrada', count(*)::text FROM supabase_migrations.schema_migrations WHERE version = '${VERSAO}'
UNION ALL
SELECT 'hub_audit_logs', count(*) || ' linhas, ' || pg_size_pretty(pg_total_relation_size('public.hub_audit_logs'))
       || ', ' || count(*) FILTER (WHERE created_at < now() - interval '90 days') || ' vencidas' FROM public.hub_audit_logs
UNION ALL
SELECT 'ultimas limpezas (s)', coalesce(string_agg(to_char(d.start_time, 'DD/MM') || '=' || round(extract(epoch FROM d.end_time - d.start_time)::numeric, 1), '  ' ORDER BY d.start_time), '-')
  FROM (SELECT d.* FROM cron.job_run_details d JOIN cron.job j USING (jobid)
         WHERE j.jobname = 'cleanup-hub-audit-logs-daily' ORDER BY d.start_time DESC LIMIT 5) d
UNION ALL
SELECT 'timelog 7 dias', count(*) || ' rodadas, ' || count(*) FILTER (WHERE r.error LIKE '%regravou tudo%') || ' regravaram tudo, '
       || count(*) FILTER (WHERE r.meta->'diff'->>'modo' = 'pulado') || ' puladas, '
       || count(*) FILTER (WHERE r.status = 'ok') || ' ok'
  FROM public.hub_sync_runs r JOIN public.hub_sync_jobs j ON j.id = r.job_id
 WHERE j.job_key = 'devops-sync-timelog' AND r.started_at > now() - interval '7 days'
UNION ALL
SELECT 'timelog ultima rodada', to_char(r.started_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') || ' ' || r.status
       || ' modo=' || coalesce(r.meta->'diff'->>'modo', '-') || ' ' || r.duration_ms || 'ms ' || coalesce(left(r.error, 90), '')
  FROM (SELECT r.* FROM public.hub_sync_runs r JOIN public.hub_sync_jobs j ON j.id = r.job_id
         WHERE j.job_key = 'devops-sync-timelog' ORDER BY r.started_at DESC LIMIT 1) r`;

async function estadoDaEdge() {
  const r = await fetch(`${API}/functions/${SLUG}`, { headers: H });
  if (!r.ok) throw new Error(`${SLUG}: metadados HTTP ${r.status}`);
  const m = await r.json();
  const b = await fetch(`${API}/functions/${SLUG}/body`, { headers: H });
  const temMarca = b.ok ? Buffer.from(await b.arrayBuffer()).includes(MARCA) : null;
  console.log(`edge ${SLUG}  |  v${m.version} verify_jwt=${m.verify_jwt} atualizada=${new Date(m.updated_at).toISOString()} v3.6 no ar=${temMarca}`);
  return { ...m, temMarca };
}

if (modo === 'arquivos') {
  console.log(`[io1] edge ${SLUG} a partir de ${REF}:`);
  for (const [p, txt] of arquivosDaEdge()) console.log(`  ${p}  (${Buffer.byteLength(txt)} bytes)`);
  console.log(`[io1] migration: ${MIGRATION} (${Buffer.byteLength(doGit(MIGRATION))} bytes)`);
}

if (modo === 'pre') {
  console.log(`[io1] pre — projeto ${PROJ}, fonte ${REF}`);
  mostra(await query(SQL_ESTADO, true));
  await estadoDaEdge();
}

if (modo === 'indice') {
  console.log(`[io1] indice — migration de ${REF}, uma transação`);
  const confere = `
DO $io1$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
                  WHERE c.relname = '${INDICE}' AND i.indrelid = 'public.hub_audit_logs'::regclass AND i.indisvalid AND i.indisready) THEN
    RAISE EXCEPTION 'IO-1: o indice ${INDICE} nao ficou valido; nada foi aplicado';
  END IF;
END
$io1$`;
  const sql = [
    doGit(MIGRATION),
    confere,
    `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('${VERSAO}', '${NOME}') ON CONFLICT (version) DO NOTHING`,
    SQL_ESTADO,
  ].join('\n;\n');
  mostra(await query(sql));
}

if (modo === 'volta-indice') {
  mostra(await query(`SET LOCAL lock_timeout = '3s';\nDROP INDEX IF EXISTS public.${INDICE};\n${SQL_ESTADO}`));
}

if (modo === 'edge') {
  const antes = await estadoDaEdge();
  const fs = arquivosDaEdge();
  const form = new FormData();
  form.append('metadata', JSON.stringify({ entrypoint_path: ENTRADA, name: SLUG, verify_jwt: antes.verify_jwt }));
  for (const [p, txt] of fs) form.append('file', new Blob([txt], { type: 'application/typescript' }), p);
  console.log(`[io1] publicando ${SLUG} de ${REF} (${fs.size} arquivos), verify_jwt=${antes.verify_jwt} como estava`);
  const r = await fetch(`${API}/functions/deploy?slug=${SLUG}`, { method: 'POST', headers: H, body: form });
  const t = await r.text();
  console.log(`[io1] deploy HTTP ${r.status} ${t.slice(0, 300)}`);
  if (!r.ok) throw new Error('deploy falhou: a versão anterior continua no ar');
  const depois = await estadoDaEdge();
  if (depois.version === antes.version) throw new Error('a versão não mudou: conferir no painel');
  console.log(`[io1] no ar a v${depois.version} (era v${antes.version}). A próxima rodada do cron é no minuto 0/15/30/45; rode o conferir depois dela.`);
}

if (modo === 'conferir') {
  let falhas = 0;
  const ok = (cond, msg) => { console.log(`${cond ? 'OK   ' : 'FALHA'} ${msg}`); if (!cond) falhas++; };
  const estado = await query(SQL_ESTADO, true);
  mostra(estado);
  const de = (prefixo) => estado.find((l) => l.item.startsWith(prefixo))?.valor ?? '';
  ok(/valido=true/.test(de('indice ')), 'índice existe e é válido');
  ok(de('migration ') === '1', 'migration registrada');
  // EXPLAIN do SELECT com o mesmo filtro do DELETE da limpeza: o papel de leitura da API não pode
  // nem planejar DELETE, e o caminho de acesso escolhido para o filtro é o mesmo.
  const plano = await query(`EXPLAIN SELECT id FROM public.hub_audit_logs WHERE created_at < now() - interval '90 days'`, true);
  const texto = plano.map((l) => l['QUERY PLAN']).join('\n');
  console.log(texto);
  ok(texto.includes(INDICE), 'o filtro da limpeza (created_at < 90 dias) usa o índice');
  const edge = await estadoDaEdge();
  ok(edge.temMarca === true, 'edge v3.6 no ar');
  console.log(falhas ? `[io1] CONFERÊNCIA: ${falhas} falha(s)` : '[io1] CONFERIDO');
  process.exitCode = falhas ? 1 : 0;
}
