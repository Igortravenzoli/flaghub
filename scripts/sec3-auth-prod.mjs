#!/usr/bin/env node
/**
 * SEC3 — config do Auth em PRODUÇÃO pela Management API (a migration 20261117100000 vem antes).
 *
 *   SUPABASE_ACCESS_TOKEN=... node scripts/sec3-auth-prod.mjs <modo> <pasta-de-guarda>
 *
 *   pre       só leitura: guarda em <pasta>/auth-antes.json os campos que a SEC3 muda.
 *   aplicar   liga o hook before-user-created (privado.hub_antes_de_criar_usuario), desliga o
 *             autoconfirm, senha mínima 12 + checagem de senha vazada, tira os domínios lovable do
 *             uri_allow_list. Exige a guarda e a migration registrada.
 *   conferir  lê a config de volta e tenta um cadastro por e-mail com a anon key: tem que voltar a
 *             recusa do hook. Se a conta de sonda chegar a nascer, apaga e acusa falha.
 *   volta     devolve os campos guardados (o hook desligado é o estado de antes).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const PROJ = 'nxmgppfyltwsqryfxkbm';
const MAPI = `https://api.supabase.com/v1/projects/${PROJ}`;
const CAMPOS = ['hook_before_user_created_enabled', 'hook_before_user_created_uri', 'mailer_autoconfirm',
  'password_min_length', 'password_hibp_enabled', 'uri_allow_list'];
const HOOK_URI = 'pg-functions://postgres/privado/hub_antes_de_criar_usuario';
const MSG = 'Cadastro só pela conta Microsoft da Flag.';

const [modo, pasta] = process.argv.slice(2);
if (!pasta) throw new Error('uso: node scripts/sec3-auth-prod.mjs <pre|aplicar|conferir|volta> <pasta-de-guarda>');
const pat = process.env.SUPABASE_ACCESS_TOKEN;
if (!pat) throw new Error('defina SUPABASE_ACCESS_TOKEN');
const H = { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' };
const guardaArq = join(pasta, 'auth-antes.json');

const lerAuth = async () => (await fetch(`${MAPI}/config/auth`, { headers: H })).json();
async function patch(corpo) {
  const r = await fetch(`${MAPI}/config/auth`, { method: 'PATCH', headers: H, body: JSON.stringify(corpo) });
  const t = await r.text();
  console.log(`PATCH ${Object.keys(corpo).join(',')} → HTTP ${r.status}${r.ok ? '' : ' ' + t.slice(0, 300)}`);
  return r.ok;
}
async function sql(q) {
  const r = await fetch(`${MAPI}/database/query`, { method: 'POST', headers: H, body: JSON.stringify({ query: q }) });
  return r.json();
}

async function pre() {
  const a = await lerAuth();
  const g = Object.fromEntries(CAMPOS.map((k) => [k, a[k] ?? null]));
  if (existsSync(guardaArq)) { console.log('auth-antes.json já existe; mantido'); return; }
  writeFileSync(guardaArq, JSON.stringify(g, null, 1));
  console.log('guardado:', JSON.stringify(g));
}

async function aplicar() {
  if (!existsSync(guardaArq)) throw new Error('rode o pre antes');
  const reg = await sql(`SELECT count(*)::int AS n FROM supabase_migrations.schema_migrations WHERE version = '20261117100000'`);
  const fn = await sql(`SELECT to_regprocedure('privado.hub_antes_de_criar_usuario(jsonb)') IS NOT NULL AS ok`);
  if (reg?.[0]?.n !== 1 || fn?.[0]?.ok !== true) throw new Error('a migration 20261117100000 não está aplicada/registrada');
  const antes = JSON.parse(readFileSync(guardaArq, 'utf8'));
  const urls = String(antes.uri_allow_list ?? '').split(',').map((s) => s.trim()).filter((s) => s && !/lovable/i.test(s));
  // o hook primeiro e sozinho: é o que fecha o cadastro; o resto é endurecimento
  if (!(await patch({ hook_before_user_created_enabled: true, hook_before_user_created_uri: HOOK_URI }))) throw new Error('hook não ligou');
  await patch({ mailer_autoconfirm: false });
  await patch({ password_min_length: 12 });
  if (!(await patch({ password_hibp_enabled: true }))) console.log('(senha vazada: o plano não permitiu; segue sem)');
  await patch({ uri_allow_list: urls.join(',') });
}

async function conferir() {
  let falhas = 0;
  const ok = (c, m) => { console.log(`${c ? 'OK   ' : 'FALHA'} ${m}`); if (!c) falhas++; };
  const a = await lerAuth();
  ok(a.hook_before_user_created_enabled === true && a.hook_before_user_created_uri === HOOK_URI, `hook ligado (${a.hook_before_user_created_uri})`);
  ok(a.mailer_autoconfirm === false, `autoconfirm=${a.mailer_autoconfirm}`);
  ok(a.password_min_length >= 12, `senha mínima=${a.password_min_length}`);
  console.log(`      senha vazada=${a.password_hibp_enabled}; uri_allow_list=${a.uri_allow_list}`);
  ok(!/lovable/i.test(a.uri_allow_list ?? ''), 'sem domínios lovable');

  const anon = readFileSync('supabase/config.prod.toml', 'utf8').match(/anon_key = "(.+)"/)[1];
  const email = `sec3-sonda-${randomBytes(4).toString('hex')}@example.com`;
  const r = await fetch(`https://${PROJ}.supabase.co/auth/v1/signup`, {
    method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: randomBytes(18).toString('base64url') + 'aA1!' }),
  });
  const t = await r.text();
  ok(!r.ok && t.includes(MSG), `cadastro por e-mail com a anon key → ${r.status} ${t.slice(0, 140)}`);
  const nasceu = await sql(`SELECT count(*)::int AS n FROM auth.users WHERE email = '${email}'`);
  if (nasceu?.[0]?.n) {
    await sql(`DELETE FROM auth.users WHERE email = '${email}'`);
    ok(false, `a conta de sonda NASCEU e foi apagada (${email}) — rodar a volta e investigar`);
  } else ok(true, 'nenhuma conta de sonda criada');
  console.log(falhas ? `SEC3 CONFERÊNCIA: ${falhas} falha(s)` : 'SEC3 CONFERIDA');
  process.exitCode = falhas ? 1 : 0;
}

async function volta() {
  const g = JSON.parse(readFileSync(guardaArq, 'utf8'));
  await patch({ hook_before_user_created_enabled: g.hook_before_user_created_enabled ?? false });
  const resto = Object.fromEntries(Object.entries(g).filter(([k, v]) => k !== 'hook_before_user_created_enabled' && k !== 'hook_before_user_created_uri' && v !== null));
  await patch(resto);
}

const modos = { pre, aplicar, conferir, volta };
if (!modos[modo]) { console.error('modo: pre | aplicar | conferir | volta'); process.exit(2); }
await modos[modo]();
