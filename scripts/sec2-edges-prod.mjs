#!/usr/bin/env node
/**
 * SEC2 — deploy das edges endurecidas em PRODUÇÃO pela Management API.
 *
 *   SUPABASE_ACCESS_TOKEN=... node scripts/sec2-edges-prod.mjs <modo> <pasta-de-guarda>
 *
 * Modos (a pasta de guarda, fora do repositório, guarda os pacotes publicados de antes):
 *   pre       só leitura: baixa metadados + pacote (eszip) de cada edge que vai mudar ou sair e
 *             guarda na pasta. É a volta. Recusa seguir se a pasta já tiver guarda de outra versão.
 *   aplicar   publica survey-import, vdesk-tickets-os e webhook-test a partir do REF (padrão HEAD)
 *             e apaga vdesk-proxy e vdesk-ticket-os (órfãs). Exige a guarda do `pre`.
 *   conferir  versão nova no ar com a marca SEC2; órfãs 404; anon 401. Com JWT_PENDENTE e/ou
 *             JWT_ADMIN no ambiente, também as respostas por perfil (nenhuma chamada grava nada).
 *   volta     republica os pacotes guardados (PATCH com o eszip) e recria as órfãs.
 *
 * O deploy de edge não depende de merge nem de migration: o front de hoje funciona igual com
 * as edges novas (só perde quem não devia ter acesso).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJ = 'nxmgppfyltwsqryfxkbm';
const API = `https://api.supabase.com/v1/projects/${PROJ}/functions`;
const URL_FN = `https://${PROJ}.supabase.co/functions/v1`;
const MUDAM = ['survey-import', 'vdesk-tickets-os', 'webhook-test'];
const SAEM = ['vdesk-proxy', 'vdesk-ticket-os'];
const MARCA = 'SEC2 (17/11/2026)';

const [modo, pasta] = process.argv.slice(2);
if (!pasta) throw new Error('informe a pasta de guarda (fora do repositório): node scripts/sec2-edges-prod.mjs <modo> <pasta>');
const pat = process.env.SUPABASE_ACCESS_TOKEN;
if (!pat) throw new Error('defina SUPABASE_ACCESS_TOKEN');
const REF = process.env.REF ?? 'HEAD';
const H = { Authorization: `Bearer ${pat}` };

async function meta(slug) {
  const r = await fetch(`${API}/${slug}`, { headers: H });
  return r.status === 404 ? null : r.json();
}
async function corpo(slug) {
  const r = await fetch(`${API}/${slug}/body`, { headers: H });
  if (!r.ok) throw new Error(`${slug}: body HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' });
const anon = () => readFileSync('supabase/config.prod.toml', 'utf8').match(/anon_key = "(.+)"/)[1];

async function pre() {
  mkdirSync(pasta, { recursive: true });
  const guarda = {};
  for (const slug of [...MUDAM, ...SAEM]) {
    const m = await meta(slug);
    if (!m) { console.log(`${slug}: não existe (nada a guardar)`); continue; }
    const arq = join(pasta, `${slug}.v${m.version}.eszip`);
    if (!existsSync(arq)) writeFileSync(arq, await corpo(slug));
    guarda[slug] = { version: m.version, verify_jwt: m.verify_jwt, name: m.name, arquivo: arq, sec2_no_ar: readFileSync(arq).includes(MARCA) };
    console.log(`${slug}: v${m.version} verify_jwt=${m.verify_jwt} guardado em ${arq}${guarda[slug].sec2_no_ar ? ' (JÁ É A SEC2)' : ''}`);
  }
  const g = join(pasta, 'guarda.json');
  if (existsSync(g)) {
    const antes = JSON.parse(readFileSync(g, 'utf8'));
    for (const [s, v] of Object.entries(antes)) if (guarda[s] && guarda[s].version !== v.version && !guarda[s].sec2_no_ar)
      throw new Error(`${s}: a guarda é da v${v.version} mas está no ar a v${guarda[s].version} — investigar antes`);
    console.log('guarda.json já existe; mantido (é a volta para antes da SEC2)');
  } else writeFileSync(g, JSON.stringify(guarda, null, 1));
}

function arquivos(slug) {
  const ent = `supabase/functions/${slug}/index.ts`;
  const fonte = git('show', `${REF}:${ent}`);
  if (!fonte.includes(MARCA)) throw new Error(`${slug}: ${REF} não tem a marca "${MARCA}"`);
  const fs = [[ent, fonte]];
  for (const m of fonte.matchAll(/from ['"]\.\.\/_shared\/([\w.-]+\.ts)['"]/g)) {
    const p = `supabase/functions/_shared/${m[1]}`;
    fs.push([p, git('show', `${REF}:${p}`)]);
  }
  return { ent, fs };
}

async function aplicar() {
  const g = join(pasta, 'guarda.json');
  if (!existsSync(g)) throw new Error('rode o pre antes (a guarda é a volta)');
  const guarda = JSON.parse(readFileSync(g, 'utf8'));
  for (const slug of MUDAM) {
    const { ent, fs } = arquivos(slug);
    const form = new FormData();
    form.append('metadata', JSON.stringify({ entrypoint_path: ent, name: slug, verify_jwt: guarda[slug]?.verify_jwt ?? true }));
    for (const [p, txt] of fs) form.append('file', new Blob([txt], { type: 'application/typescript' }), p);
    const r = await fetch(`${API}/deploy?slug=${slug}`, { method: 'POST', headers: H, body: form });
    const t = await r.text();
    console.log(`${slug}: deploy HTTP ${r.status} ${t.slice(0, 200)}`);
    if (!r.ok) throw new Error(`${slug}: deploy falhou — parar e rodar a volta só desta, se preciso`);
  }
  for (const slug of SAEM) {
    if (!guarda[slug]) { console.log(`${slug}: sem guarda, não apago`); continue; }
    const r = await fetch(`${API}/${slug}`, { method: 'DELETE', headers: H });
    console.log(`${slug}: DELETE HTTP ${r.status}`);
  }
}

async function chama(slug, { jwt, metodo = 'POST', query = '', body } = {}) {
  const r = await fetch(`${URL_FN}/${slug}${query}`, {
    method: metodo,
    headers: { apikey: anon(), Authorization: `Bearer ${jwt ?? anon()}`, 'Content-Type': 'application/json', Origin: 'https://flaghub.flag.com.br' },
    body: metodo === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  return { status: r.status, txt: (await r.text()).slice(0, 160) };
}

async function conferir() {
  let falhas = 0;
  const ok = (cond, msg) => { console.log(`${cond ? 'OK   ' : 'FALHA'} ${msg}`); if (!cond) falhas++; };
  for (const slug of MUDAM) {
    const m = await meta(slug);
    ok(m && (await corpo(slug)).includes(MARCA), `${slug}: no ar v${m?.version} com a marca SEC2`);
  }
  for (const slug of SAEM) ok((await meta(slug)) === null, `${slug}: removida`);
  for (const slug of MUDAM) { const r = await chama(slug); ok(r.status === 401, `${slug}: anon → ${r.status}`); }

  const P = process.env.JWT_PENDENTE;
  if (P) {
    let r = await chama('survey-import', { jwt: P, body: { import_mode: 'purge', rows: [{}], import_name: 'x', file_name: 'x' } });
    ok(r.status === 403, `survey-import: pendente com purge → ${r.status}`);
    r = await chama('vdesk-tickets-os', { jwt: P, metodo: 'GET', query: '?action=status' });
    ok(r.status === 403, `vdesk-tickets-os: pendente status → ${r.status}`);
    r = await chama('webhook-test', { jwt: P, body: { url: 'https://example.invalid', type: 'teams' } });
    ok(r.status === 403, `webhook-test: pendente → ${r.status}`);
  } else console.log('(sem JWT_PENDENTE: pulei o pendente)');

  const A = process.env.JWT_ADMIN;
  if (A) {
    // nenhuma destas grava: rows vazio para antes de qualquer escrita; tipo inválido para antes do fetch
    let r = await chama('survey-import', { jwt: A, body: { rows: [] } });
    ok(r.status === 400 && /No rows/.test(r.txt), `survey-import: admin sem linhas → ${r.status} (passou a régua)`);
    r = await chama('vdesk-tickets-os', { jwt: A, metodo: 'GET', query: '?action=status' });
    ok(r.status === 200, `vdesk-tickets-os: admin status → ${r.status}`);
    r = await chama('vdesk-tickets-os', { jwt: A, body: { tickets: Array(501).fill('INC1') }, query: '?action=correlacao-batch' });
    ok(r.status === 413, `vdesk-tickets-os: lote de 501 → ${r.status}`);
    r = await chama('webhook-test', { jwt: A, body: { url: 'https://example.invalid', type: 'x' } });
    ok(r.status === 400, `webhook-test: admin tipo inválido → ${r.status} (passou a régua)`);
  } else console.log('(sem JWT_ADMIN: pulei o admin)');
  console.log(falhas ? `SEC2 CONFERÊNCIA: ${falhas} falha(s)` : 'SEC2 CONFERIDA');
  process.exitCode = falhas ? 1 : 0;
}

async function volta() {
  const guarda = JSON.parse(readFileSync(join(pasta, 'guarda.json'), 'utf8'));
  for (const slug of MUDAM) {
    const g = guarda[slug];
    if (!g) continue;
    const r = await fetch(`${API}/${slug}?verify_jwt=${g.verify_jwt}`, {
      method: 'PATCH', headers: { ...H, 'Content-Type': 'application/vnd.denoland.eszip' }, body: readFileSync(g.arquivo) });
    console.log(`${slug}: volta para o pacote da v${g.version} → HTTP ${r.status}`);
  }
  for (const slug of SAEM) {
    const g = guarda[slug];
    if (!g || (await meta(slug))) continue;
    const r = await fetch(`${API}?slug=${slug}&name=${encodeURIComponent(g.name ?? slug)}&verify_jwt=${g.verify_jwt}`, {
      method: 'POST', headers: { ...H, 'Content-Type': 'application/vnd.denoland.eszip' }, body: readFileSync(g.arquivo) });
    console.log(`${slug}: recriada do pacote da v${g.version} → HTTP ${r.status}`);
  }
}

const modos = { pre, aplicar, conferir, volta };
if (!modos[modo]) { console.error('modo: pre | aplicar | conferir | volta'); process.exit(2); }
await modos[modo]();
