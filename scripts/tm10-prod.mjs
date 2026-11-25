#!/usr/bin/env node
/**
 * TM10 — identidade por dev nas escritas do Timer (docs/timer-identidade-por-dev.md).
 * Aplicação MANUAL em produção: o Igor roda (ou uma sessão do Claude, só com o "pode" dele
 * para o modo em questão). Duas mudanças, cada uma com o seu modo:
 *   • a migration supabase/migrations/20261125163000_tm10_timer_devops_token.sql
 *   • a edge timer-devops com a op `vincular` e a escrita pela identidade da pessoa
 *
 *   $env:SUPABASE_PAT = '<token>'            # PowerShell; SUPABASE_ACCESS_TOKEN também serve
 *   node scripts/tm10-prod.mjs arquivos      # sem rede e sem token: o que seria enviado, lido do REF
 *   node scripts/tm10-prod.mjs pre           # só leitura: registro, objetos, secrets (nomes), edge no ar
 *   node scripts/tm10-prod.mjs ensaio        # migration + verificação numa transação DESFEITA (nada fica)
 *   node scripts/tm10-prod.mjs aplicar       # migration + registro numa transação; depois a verificação
 *   node scripts/tm10-prod.mjs edge          # publica timer-devops a partir do REF
 *   node scripts/tm10-prod.mjs conferir      # só leitura: verificação, vínculos e eventos dos últimos 7 dias
 *   node scripts/tm10-prod.mjs volta         # remove gatilho, funções e tabela (o registro fica)
 *
 * Os arquivos são lidos de REF (padrão HEAD) com `git show`: o que está no commit, não o que
 * está no disco. Ordem: pre → ensaio → aplicar → secrets no painel → edge → conferir → só então
 * TIMER_DEVOPS_DELEGADO=1 na edge e VITE_SSO_ESCOPOS_EXTRAS=offline_access na Vercel.
 *
 * A edge só é publicada de um commit que tenha também o que já está no ar: se a versão no ar
 * tem a op `estados` (ramo claude/timer-ajustes-2511) e o REF não, o modo `edge` recusa.
 * Volta da edge: republicar do commit anterior — $env:REF = '<commit>'; $env:EDGE_SEM_MARCA = '1'.
 */
import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';

const PROJ = 'nxmgppfyltwsqryfxkbm';
const API = `https://api.supabase.com/v1/projects/${PROJ}`;
const MIGRATION = 'supabase/migrations/20261125163000_tm10_timer_devops_token.sql';
const VERIFICACAO = 'supabase/verificacao/tm10_devops_token_timer.sql';
const VERSAO = '20261125163000';
const NOME = 'tm10_timer_devops_token';
const SLUG = 'timer-devops';
const ENTRADA = `supabase/functions/${SLUG}/index.ts`;
/** Só existe no código novo. */
const MARCA = 'devops_caiu_no_pat';
/** Só existe no código do ramo claude/timer-ajustes-2511 (op `estados`). */
const MARCA_AJUSTES = 'estadosDoItem';
const SECRETS = ['TIMER_ENTRA_CLIENT_ID', 'TIMER_ENTRA_CLIENT_SECRET', 'TIMER_TOKEN_CHAVE', 'TIMER_DEVOPS_DELEGADO', 'TIMER_SSO_TENANT_ID', 'DEVOPS_PAT_TIMER'];
const REF = process.env.REF || 'HEAD';

const modo = process.argv[2];
const MODOS = ['arquivos', 'pre', 'ensaio', 'aplicar', 'edge', 'conferir', 'volta'];
if (!MODOS.includes(modo)) { console.error(`modo: ${MODOS.join(' | ')}`); process.exit(2); }
const pat = process.env.SUPABASE_PAT || process.env.SUPABASE_ACCESS_TOKEN;
if (!pat && modo !== 'arquivos') { console.error('Defina SUPABASE_PAT.'); process.exit(2); }
const H = { Authorization: `Bearer ${pat}` };

function doGit(caminho) {
  try {
    return execFileSync('git', ['show', `${REF}:${caminho}`], { encoding: 'utf8', maxBuffer: 16 << 20, stdio: ['ignore', 'pipe', 'pipe'] }).replace(/^\uFEFF/, '');
  } catch {
    throw new Error(`${REF} não tem ${caminho} (o trabalho já foi commitado? o REF está certo?)`);
  }
}

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

/** A entrada e tudo o que ela importa por caminho relativo (a pasta da edge e _shared). */
function arquivosDaEdge() {
  const fs = new Map();
  const fila = [ENTRADA];
  while (fila.length) {
    const p = fila.pop();
    if (fs.has(p)) continue;
    const txt = doGit(p);
    fs.set(p, txt);
    for (const m of txt.matchAll(/from\s+['"](\.{1,2}\/[\w./-]+\.ts)['"]/g)) {
      fila.push(posix.normalize(posix.join(posix.dirname(p), m[1])));
    }
  }
  if (!process.env.EDGE_SEM_MARCA && !fs.get(ENTRADA).includes(MARCA)) {
    throw new Error(`${REF}:${ENTRADA} não tem a marca "${MARCA}": este REF não é o da identidade por dev.`);
  }
  return fs;
}

const SQL_ESTADO = `
SELECT 'migration ${VERSAO} registrada' AS item, count(*)::text AS valor
  FROM supabase_migrations.schema_migrations WHERE version = '${VERSAO}'
UNION ALL
SELECT 'ultima migration registrada', max(version) FROM supabase_migrations.schema_migrations
UNION ALL
SELECT 'tabela privado.timer_devops_token', coalesce(to_regclass('privado.timer_devops_token')::text, 'NAO EXISTE')
UNION ALL
SELECT 'gatilho em timer_access', coalesce((SELECT tgname::text FROM pg_trigger
         WHERE tgrelid = 'public.timer_access'::regclass AND tgname = 'timer_access_revogado_apaga_vinculo'), 'NAO EXISTE')
UNION ALL
SELECT 'funcoes timer_devops_token_*', count(*)::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN ('timer_devops_token_ler', 'timer_devops_token_gravar', 'timer_devops_token_apagar')
UNION ALL
SELECT 'pessoas com o Timer ativo', count(*)::text FROM public.timer_access WHERE status = 'ativo'`;

const SQL_USO = `
SELECT 'vinculos guardados' AS item, count(*)::text AS valor FROM privado.timer_devops_token
UNION ALL
SELECT 'eventos 7 dias: ' || e.evento || coalesce(' (' || nullif(concat_ws(' ', e.detalhe->>'op', e.detalhe->>'motivo', e.detalhe->>'erro'), '') || ')', ''),
       count(*) || ' de ' || count(DISTINCT e.user_id) || ' pessoa(s)'
  FROM public.timer_eventos e
 WHERE e.evento IN ('devops_vinculado', 'devops_vinculo_falhou', 'devops_caiu_no_pat') AND e.criado_em > now() - interval '7 days'
 GROUP BY 1`;

/** A verificação termina sempre em RAISE: "TM10 OK" é sucesso, e nada fica gravado. */
async function rodarVerificacao(sql, rotulo) {
  try {
    await query(sql);
  } catch (e) {
    const msg = String(e.message);
    const ok = msg.match(/TM10 OK[^"\\]*/);
    if (ok) { console.log(`[tm10] ${rotulo}: ${ok[0]}`); return true; }
    const falhou = msg.match(/TM10 FALHOU[^"\\]*/);
    console.error(`[tm10] ${rotulo}: ${falhou ? falhou[0] : msg.slice(0, 600)}`);
    return false;
  }
  console.error(`[tm10] ${rotulo}: a verificação terminou sem o RAISE do fim (inesperado).`);
  return false;
}

async function estadoDaEdge() {
  const r = await fetch(`${API}/functions/${SLUG}`, { headers: H });
  if (!r.ok) throw new Error(`${SLUG}: metadados HTTP ${r.status}`);
  const m = await r.json();
  const b = await fetch(`${API}/functions/${SLUG}/body`, { headers: H });
  const corpo = b.ok ? Buffer.from(await b.arrayBuffer()) : null;
  const temNovo = corpo ? corpo.includes(MARCA) : null;
  const temAjustes = corpo ? corpo.includes(MARCA_AJUSTES) : null;
  console.log(`edge ${SLUG}  |  v${m.version} verify_jwt=${m.verify_jwt} atualizada=${new Date(m.updated_at).toISOString()} identidade-por-dev=${temNovo} op-estados=${temAjustes}`);
  return { ...m, temNovo, temAjustes };
}

async function nomesDosSecrets() {
  const r = await fetch(`${API}/secrets`, { headers: H });
  if (!r.ok) { console.log(`secrets  |  não deu para listar (HTTP ${r.status})`); return; }
  const nomes = new Set((await r.json()).map((s) => s.name));
  // só os NOMES: o valor nunca é lido nem mostrado
  for (const n of SECRETS) console.log(`secret ${n}  |  ${nomes.has(n) ? 'existe' : 'AUSENTE'}`);
}

if (modo === 'arquivos') {
  console.log(`[tm10] edge ${SLUG} a partir de ${REF}:`);
  for (const [p, txt] of arquivosDaEdge()) console.log(`  ${p}  (${Buffer.byteLength(txt)} bytes)`);
  for (const p of [MIGRATION, VERIFICACAO]) console.log(`[tm10] ${p} (${Buffer.byteLength(doGit(p))} bytes)`);
}

if (modo === 'pre') {
  console.log(`[tm10] pre — projeto ${PROJ}, fonte ${REF}`);
  mostra(await query(SQL_ESTADO, true));
  await nomesDosSecrets();
  const edge = await estadoDaEdge();
  if (edge.temAjustes && !arquivosDaEdge().get(ENTRADA).includes(MARCA_AJUSTES)) {
    console.log('[tm10] ATENÇÃO: a edge no ar tem a op `estados` e este REF não. Mesclar o ramo claude/timer-ajustes-2511 antes do modo `edge`.');
  }
}

if (modo === 'ensaio') {
  console.log(`[tm10] ensaio — migration + verificação de ${REF}, numa transação que se desfaz`);
  const sql = [`SET LOCAL lock_timeout = '3s'`, doGit(MIGRATION), doGit(VERIFICACAO)].join('\n;\n');
  const ok = await rodarVerificacao(sql, 'ensaio');
  mostra(await query(SQL_ESTADO, true));
  console.log(ok ? '[tm10] ENSAIO OK: nada ficou no banco (confira acima: tabela NAO EXISTE).' : '[tm10] ENSAIO FALHOU: nada foi aplicado.');
  process.exitCode = ok ? 0 : 1;
}

if (modo === 'aplicar') {
  const antes = await query(SQL_ESTADO, true);
  if (antes.find((l) => l.item.startsWith('migration '))?.valor !== '0') {
    throw new Error(`a versão ${VERSAO} já está registrada em schema_migrations: nada a aplicar (ou a versão colidiu com outra migration).`);
  }
  console.log(`[tm10] aplicar — migration de ${REF} + registro, uma transação`);
  const sql = [
    `SET LOCAL lock_timeout = '3s'`,
    doGit(MIGRATION),
    `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('${VERSAO}', '${NOME}')`,
    SQL_ESTADO,
  ].join('\n;\n');
  mostra(await query(sql));
  const ok = await rodarVerificacao(doGit(VERIFICACAO), 'verificação');
  console.log(ok ? '[tm10] APLICADA e conferida.' : '[tm10] APLICADA, mas a verificação FALHOU: ver acima; o modo `volta` desfaz.');
  process.exitCode = ok ? 0 : 1;
}

if (modo === 'volta') {
  const sql = `
SET LOCAL lock_timeout = '3s';
DROP TRIGGER IF EXISTS timer_access_revogado_apaga_vinculo ON public.timer_access;
DROP FUNCTION IF EXISTS public.timer_devops_token_ler(uuid);
DROP FUNCTION IF EXISTS public.timer_devops_token_gravar(uuid, text, text);
DROP FUNCTION IF EXISTS public.timer_devops_token_apagar(uuid);
DROP FUNCTION IF EXISTS privado.timer_devops_token_ao_revogar();
DROP TABLE IF EXISTS privado.timer_devops_token;
${SQL_ESTADO}`;
  console.log('[tm10] volta — remove gatilho, funções e tabela (os vínculos guardados vão junto; o registro da migration fica)');
  mostra(await query(sql));
}

if (modo === 'edge') {
  const antes = await estadoDaEdge();
  const fs = arquivosDaEdge();
  if (antes.temAjustes && !fs.get(ENTRADA).includes(MARCA_AJUSTES) && !process.env.FORCAR) {
    throw new Error('a edge no ar tem a op `estados` e este REF não: publicar daqui tiraria o que está em produção. Mesclar o ramo claude/timer-ajustes-2511 antes.');
  }
  const form = new FormData();
  form.append('metadata', JSON.stringify({ entrypoint_path: ENTRADA, name: SLUG, verify_jwt: antes.verify_jwt }));
  for (const [p, txt] of fs) form.append('file', new Blob([txt], { type: 'application/typescript' }), p);
  console.log(`[tm10] publicando ${SLUG} de ${REF} (${fs.size} arquivos), verify_jwt=${antes.verify_jwt} como estava`);
  const r = await fetch(`${API}/functions/deploy?slug=${SLUG}`, { method: 'POST', headers: H, body: form });
  const t = await r.text();
  console.log(`[tm10] deploy HTTP ${r.status} ${t.slice(0, 300)}`);
  if (!r.ok) throw new Error('deploy falhou: a versão anterior continua no ar');
  const depois = await estadoDaEdge();
  if (depois.version === antes.version) throw new Error('a versão não mudou: conferir no painel');
  console.log(`[tm10] no ar a v${depois.version} (era v${antes.version}). Sem TIMER_DEVOPS_DELEGADO, o Timer se comporta como antes.`);
}

if (modo === 'conferir') {
  const estado = await query(SQL_ESTADO, true);
  mostra(estado);
  await nomesDosSecrets();
  await estadoDaEdge();
  const existe = !estado.find((l) => l.item.startsWith('tabela '))?.valor.includes('NAO EXISTE');
  if (!existe) {
    console.log('[tm10] a migration ainda não foi aplicada.');
    process.exitCode = 1;
  } else {
    const ok = await rodarVerificacao(doGit(VERIFICACAO), 'verificação');
    mostra(await query(SQL_USO, true));
    process.exitCode = ok ? 0 : 1;
  }
}
