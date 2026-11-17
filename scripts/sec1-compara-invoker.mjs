// SUPABASE_ACCESS_TOKEN=... node scripts/sec1-compara-invoker.mjs — SEC1, parte só leitura (sem DDL, sem trava).
// Para cada usuário aprovado + um pendente: numa transação READ ONLY, como o usuário,
// conta (a) a view como está (dono) e (b) a definição da view rodada como o usuário —
// que é exatamente o que security_invoker = true faz. Mede o tempo de (b).

const pat = process.env.SUPABASE_ACCESS_TOKEN; if (!pat) throw new Error('defina SUPABASE_ACCESS_TOKEN');
const API = 'https://api.supabase.com/v1/projects/nxmgppfyltwsqryfxkbm/database/query';
async function q(sql) {
  const r = await fetch(API, { method: 'POST', headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }) });
  return { status: r.status, txt: await r.text() };
}
const lit = (s) => '$q$' + s + '$q$';

// definições (como postgres)
const d = JSON.parse((await q(`SELECT c.relname AS v, pg_get_viewdef(c.oid) AS def FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('v_timelog_unified','v_colaborador_ausencias','vw_infraestrutura_kpis','v_horas_negocio')`)).txt);
const def = Object.fromEntries(d.map((x) => [x.v, x.def.trim().replace(/;$/, '')]));
if (/v_timelog_unified/.test(def.v_horas_negocio) === false) throw new Error('v_horas_negocio não cita v_timelog_unified');
// invoker de cada uma; a v_horas_negocio com a v_timelog_unified (invoker) por dentro, como CTE
const sim = {
  v_timelog_unified: def.v_timelog_unified,
  v_colaborador_ausencias: def.v_colaborador_ausencias,
  vw_infraestrutura_kpis: def.vw_infraestrutura_kpis,
  v_horas_negocio: `WITH v_timelog_unified AS (${def.v_timelog_unified}) ${def.v_horas_negocio.replace(/public\.v_timelog_unified/g, 'v_timelog_unified')}`,
};

const ids = JSON.parse((await q(`SELECT x.user_id::text AS id, (u.email = 'monitor@flag.com.br') AS monitor FROM
  (SELECT user_id FROM public.hub_area_members WHERE is_active UNION SELECT user_id FROM public.user_roles) x
  JOIN auth.users u ON u.id = x.user_id ORDER BY 1`)).txt);
ids.push({ id: '00000000-0000-4000-8000-00000000beef', monitor: false, pendente: true });

const res = [];
for (const u of ids) {
  const blocos = Object.keys(sim).map((v) => `
    EXECUTE ${lit(`SELECT count(*) FROM public.${v}`)} INTO a;
    t := clock_timestamp();
    BEGIN EXECUTE ${lit(`SELECT count(*) FROM (${sim[v]}) s`)} INTO b; EXCEPTION WHEN OTHERS THEN b := -1; err := err || '${v}:' || SQLSTATE || ' '; END;
    out := out || '${v}=' || a || '>' || b || '@' || round(extract(epoch FROM clock_timestamp() - t) * 1000) || 'ms ';`).join('');
  const sql = `BEGIN READ ONLY;
SET LOCAL statement_timeout = '90s';
SELECT set_config('request.jwt.claims', '${JSON.stringify({ sub: u.id, role: 'authenticated', aud: 'authenticated' })}', true);
SET LOCAL ROLE authenticated;
DO $do$ DECLARE a bigint; b bigint; t timestamptz; out text := ''; err text := ''; BEGIN ${blocos}
  RAISE EXCEPTION 'R1:% E:%', out, err; END $do$;`;
  const r = await q(sql);
  const m = r.txt.match(/R1:(.*?) E:([^"]*?)(\\n|")/);
  const linha = { u: u.id.slice(0, 8), monitor: u.monitor, pendente: !!u.pendente, r: m ? m[1] : `HTTP ${r.status} ${r.txt.slice(0, 200)}`, err: m ? m[2] : '' };
  res.push(linha);
  console.log(`${linha.u}${u.monitor ? ' (monitor)' : ''}${u.pendente ? ' (pendente)' : ''} ${linha.r} ${linha.err}`);
}
// Aprovado: antes == depois em cada view. Pendente: depois == 0 em cada view. Erro (-1) reprova.
const pares = (x) => [...x.r.matchAll(/=(\d+)>(-?\d+)@/g)];
const ok = res.every((x) => { const p = pares(x); return p.length === 4 && p.every((m) => (x.pendente ? m[2] === '0' : m[1] === m[2])); });
console.log(ok ? 'SEC1 COMPARACAO OK' : 'SEC1 COMPARACAO FALHOU');
process.exitCode = ok ? 0 : 1;
