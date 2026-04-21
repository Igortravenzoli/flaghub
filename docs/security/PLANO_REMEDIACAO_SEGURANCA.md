# Plano Mestre de Remediação de Segurança — FlagHub Operations Hub

---

| Campo | Valor |
|-------|-------|
| **Versão** | 1.0 |
| **Data** | 21/04/2026 |
| **Baseado em** | Pentest Reports #1, #2 e #3 (série 2026-04-21) |
| **Responsável** | Equipe DevOps FLAG INTELLIWAN |
| **Status** | 🔴 Em execução — Fase 1 iniciada |

---

## Princípios Guia

> **"Corrija o banco de dados, não o frontend."** — Toda proteção de acesso deve existir na camada RLS/triggers do Supabase. O frontend protege a UX, nunca os dados.

> **"Sem `USING (true)` para autenticados."** — Toda tabela com dados de negócio deve verificar autorização real (aprovação, área, role), não apenas autenticação.

> **"Nenhuma PR que toque em auth, RLS ou Edge Functions passa sem revisão de segurança."** — Definido como gate obrigatório no processo de desenvolvimento.

---

## Visão Geral das Fases

```
FASE 1 — Crítico (Hoje, 21/04/2026)
  └── 4 vulnerabilidades críticas → 1 migration + CORS fix
  └── Estimativa: 3h
  └── Impacto aplicação: zero (apenas banco + edge functions)

FASE 2 — Alto (Próximos 7 dias)
  └── 7 vulnerabilidades altas → migrations SQL + refactor login
  └── Estimativa: 1 dia de trabalho
  └── Impacto aplicação: baixo (auth flow, nenhuma UI quebra)

FASE 3 — Médio (Próximos 30 dias)
  └── 5 vulnerabilidades médias → configurações + pequenos ajustes
  └── Estimativa: meio dia
  └── Impacto aplicação: nenhum

FASE 4 — Framework Contínuo (Permanente)
  └── Testes de integridade de segurança em CI/CD
  └── Checklist de PR obrigatório
  └── Revisão mensal de RLS
```

---

## FASE 1 — Vulnerabilidades Críticas (Hoje)

### 1.1 — Migration de segurança principal

**Arquivo já criado:** `supabase/migrations/20260421180000_security_approved_users_rls.sql`

**O que resolve:**
- ✅ CRÍTICO-1: Trigger `protect_mfa_exempt_trigger` bloqueia self-update de `mfa_exempt`
- ✅ CRÍTICO-3: Função `hub_is_approved()` + 37 políticas `USING (true)` substituídas
- ✅ CRÍTICO-4: INSERT `hub_access_requests` restrito a `status = 'pending'`

**Como aplicar:**
```bash
# Opção A — Via Supabase CLI (recomendado)
supabase db push --linked

# Opção B — Via Supabase Dashboard
# Settings → SQL Editor → colar conteúdo da migration → Run
```

**Testes de verificação após aplicar:**

```bash
# T1: Usuário não aprovado NÃO deve acessar vdesk_clients
curl "https://nxmgppfyltwsqryfxkbm.supabase.co/rest/v1/vdesk_clients" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $JWT_UNAPPROVED"
# ESPERADO: HTTP 200 com array vazio [] (RLS filtra)

# T2: Usuário aprovado DEVE acessar vdesk_clients
curl "https://nxmgppfyltwsqryfxkbm.supabase.co/rest/v1/vdesk_clients" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $JWT_APPROVED"
# ESPERADO: HTTP 200 com registros

# T3: INSERT hub_access_requests com status='approved' DEVE falhar
curl -X POST "https://nxmgppfyltwsqryfxkbm.supabase.co/rest/v1/hub_access_requests" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $JWT_UNAPPROVED" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"<uuid>","area_id":"<uuid>","status":"approved"}'
# ESPERADO: HTTP 403 ou 42501

# T4: INSERT hub_access_requests com status='pending' DEVE funcionar
curl -X POST "https://nxmgppfyltwsqryfxkbm.supabase.co/rest/v1/hub_access_requests" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $JWT_UNAPPROVED" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"<uuid>","area_id":"<uuid>","status":"pending"}'
# ESPERADO: HTTP 201

# T5: Self-update de mfa_exempt por não-admin DEVE falhar
curl -X PATCH "https://nxmgppfyltwsqryfxkbm.supabase.co/rest/v1/profiles?user_id=eq.<uuid>" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $JWT_REGULAR" \
  -H "Content-Type: application/json" \
  -d '{"mfa_exempt":true}'
# ESPERADO: HTTP 500 com erro 42501 (RAISE EXCEPTION do trigger)

# T6: Admin PODE atualizar mfa_exempt
curl -X PATCH "https://nxmgppfyltwsqryfxkbm.supabase.co/rest/v1/profiles?user_id=eq.<uuid>" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $JWT_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"mfa_exempt":true}'
# ESPERADO: HTTP 204
```

**Recurso da aplicação afetado e como testar:**
| Recurso | Teste manual |
|---------|-------------|
| Dashboard (aprovado) | Logar com usuário aprovado → dashboard carrega normalmente |
| Tela /pending-approval | Logar com usuário não aprovado → redireciona para /pending-approval |
| Admin: toggle mfa_exempt | Admin edita usuário → campo salva. Não-admin edita perfil → outros campos salvam, mfa_exempt ignorado |
| Solicitação de acesso | Usuário não aprovado envia request → aparece na fila admin com status 'pending' |

---

### 1.2 — Corrigir CORS nas Edge Functions

**Vulnerabilidade:** CRÍTICO-2 — todas as 7 Edge Functions retornam `Access-Control-Allow-Origin: *`

**Impacto de não corrigir:** qualquer site pode fazer requisições autenticadas às Edge Functions usando o token do usuário (CSRF via CORS).

**Criar arquivo compartilhado de CORS:**

```typescript
// supabase/functions/_shared/cors.ts
const ALLOWED_ORIGINS = [
  'https://flaghub.flag.com.br',          // produção
  'https://flaghub-staging.netlify.app',   // staging
  'http://localhost:5173',                  // dev local
  'http://localhost:4173',                  // preview local
];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
```

**Substituir em cada Edge Function:**
```typescript
// Antes (em cada função):
headers: { 'Access-Control-Allow-Origin': '*', ... }

// Depois:
import { corsHeaders } from '../_shared/cors.ts';
// ...
if (req.method === 'OPTIONS') {
  return new Response('ok', { headers: corsHeaders(req) });
}
// nas respostas:
return new Response(JSON.stringify(data), {
  headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
});
```

**Edge Functions a atualizar:** (verificar todas em `supabase/functions/`)
- `auth-rate-limit`
- `flag-ai-gateway`
- `vdesk-proxy`
- `smtp-test`
- `webhook-test`
- demais funções encontradas

**Testes de verificação:**
```bash
# T7: Origem permitida → deve retornar o header com a origem
curl -I -X OPTIONS "https://nxmgppfyltwsqryfxkbm.supabase.co/functions/v1/auth-rate-limit" \
  -H "Origin: https://flaghub.flag.com.br"
# ESPERADO: Access-Control-Allow-Origin: https://flaghub.flag.com.br

# T8: Origem não permitida → deve retornar a origem padrão (produção), não a requisitada
curl -I -X OPTIONS "https://nxmgppfyltwsqryfxkbm.supabase.co/functions/v1/auth-rate-limit" \
  -H "Origin: https://site-malicioso.com"
# ESPERADO: Access-Control-Allow-Origin: https://flaghub.flag.com.br (não o site malicioso)
```

---

## FASE 2 — Vulnerabilidades Altas (7 dias)

### 2.1 — RPCs destrutivas sem autorização (CRIT-01, 02, 03 do Relatório #2)

**Criar migration:** `supabase/migrations/20260428000001_harden_destructive_rpcs.sql`

```sql
-- CRIT-01: delete_tickets_by_network
CREATE OR REPLACE FUNCTION public.delete_tickets_by_network(p_network_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.tickets WHERE network_id = p_network_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_tickets_by_network(bigint) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.delete_tickets_by_network(bigint) TO service_role;

-- CRIT-02: purge_cs_implantacoes
CREATE OR REPLACE FUNCTION public.purge_cs_implantacoes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.cs_implantacoes_records;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.purge_cs_implantacoes() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_cs_implantacoes() TO service_role;

-- CRIT-03: purge_old_inactive_tickets
CREATE OR REPLACE FUNCTION public.purge_old_inactive_tickets(
  p_network_id integer,
  p_days_threshold integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.tickets
  WHERE network_id = p_network_id
    AND updated_at < now() - (p_days_threshold || ' days')::interval;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.purge_old_inactive_tickets(integer, integer) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_old_inactive_tickets(integer, integer) TO service_role;
```

**Testes de verificação:**
```bash
# T9: anon tenta chamar RPC destrutiva → DEVE falhar
curl -X POST "https://nxmgppfyltwsqryfxkbm.supabase.co/rest/v1/rpc/delete_tickets_by_network" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_network_id": 1}'
# ESPERADO: HTTP 403 ou 404

# T10: usuário autenticado (não admin) tenta chamar → DEVE falhar
curl -X POST "https://nxmgppfyltwsqryfxkbm.supabase.co/rest/v1/rpc/delete_tickets_by_network" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $JWT_REGULAR" \
  -H "Content-Type: application/json" \
  -d '{"p_network_id": 1}'
# ESPERADO: HTTP 403 com mensagem 'forbidden'
```

---

### 2.2 — Views sem `security_invoker=true` (ALTO-01)

**Criar migration:** `supabase/migrations/20260428000002_harden_views_security_invoker.sql`

```sql
-- Forçar views a respeitarem a RLS do usuário chamador
-- Em vez de executar com privilégios do owner (postgres)
ALTER VIEW public.v_dashboard_summary          SET (security_invoker = true);
ALTER VIEW public.vw_customer_service_kpis     SET (security_invoker = true);
ALTER VIEW public.vw_devops_lead_area_map_safe SET (security_invoker = true);
ALTER VIEW public.vw_hub_integrations_safe     SET (security_invoker = true);
-- Adicionar demais views identificadas no Relatório #2
```

**Testes de verificação:**
```bash
# T11: usuário sem área 'devops' não deve ver dados da view de devops
# Testar via Supabase client com JWT de usuário de outra área
```

**⚠️ Atenção — possível quebra:** Após ativar `security_invoker`, a view passa a executar RLS com o contexto do usuário. Se alguma view depender de dados que o usuário logado não teria acesso direto (ex.: join com tabela admin), os dados desaparecerão. **Testar cada view no staging antes de produção.**

```sql
-- Verificar quais views funcionam com security_invoker antes de aplicar em massa:
SET ROLE 'authenticated';
SET request.jwt.claims TO '{"sub": "<user_uuid>", "role": "authenticated"}';
SELECT * FROM public.v_dashboard_summary LIMIT 1;
RESET ROLE;
```

---

### 2.3 — REVOKE EXECUTE em funções acessíveis por `anon` (ALTO-02)

**Criar migration:** `supabase/migrations/20260428000003_revoke_anon_function_execute.sql`

```sql
-- Gerar a lista completa executando no SQL Editor:
SELECT 'REVOKE EXECUTE ON FUNCTION public.'
       || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') FROM anon;'
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
  AND p.proname NOT IN (
    -- whitelist: funções que realmente precisam ser públicas (pré-auth)
    'hub_check_my_ip',
    'hub_is_ip_allowed',
    'hub_request_ip'
  );

-- Também revogar hub_audit_log de anon (permite poluir logs):
REVOKE EXECUTE ON FUNCTION public.hub_audit_log(text, text, uuid, jsonb) FROM anon;

-- Revogar hub_is_admin de anon (defense in depth):
REVOKE EXECUTE ON FUNCTION public.hub_is_admin() FROM anon;
```

**Testes de verificação:**
```bash
# T12: anon não deve conseguir chamar is_admin
curl -X POST "https://nxmgppfyltwsqryfxkbm.supabase.co/rest/v1/rpc/is_admin" \
  -H "apikey: $ANON_KEY"
# ESPERADO: HTTP 404 ou 403

# T13: hub_check_my_ip DEVE continuar funcionando para anon (whitelist)
curl -X POST "https://nxmgppfyltwsqryfxkbm.supabase.co/rest/v1/rpc/hub_check_my_ip" \
  -H "apikey: $ANON_KEY"
# ESPERADO: HTTP 200
```

---

### 2.4 — Corrigir policy `public` em import_events (ALTO-03 / VULN-06)

**Criar migration:** `supabase/migrations/20260428000004_fix_import_events_policy.sql`

```sql
-- Corrigir role 'public' → 'authenticated' em import_events e imports
ALTER POLICY "Admin/Gestao can create import events" ON public.import_events
  TO authenticated;

-- Verificar e corrigir import_batches se tiver o mesmo problema:
-- SELECT policyname, roles FROM pg_policies WHERE tablename IN ('imports','import_batches','import_events');
```

**Testes de verificação:**
```bash
# T14: anon não deve conseguir inserir import_events
curl -X POST "https://nxmgppfyltwsqryfxkbm.supabase.co/rest/v1/import_events" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"import_id":"<uuid>","type":"test"}'
# ESPERADO: HTTP 401 ou HTTP 403
```

---

### 2.5 — Redesenhar fluxo de login para não transmitir senha (VULN-04)

**Arquivo:** `src/pages/Login.tsx`

**Problema:** a senha é enviada ao Edge Function `auth-rate-limit` antes de chegar ao Supabase Auth.

**Refactor:**
```typescript
// Antes — senha exposta no Edge Function:
const response = await fetch('/functions/v1/auth-rate-limit', {
  body: JSON.stringify({ email, password }) // ← senha vai ao Edge Function
});

// Depois — rate limit separado da autenticação:
// Passo 1: checar rate limit apenas com email (sem senha)
const limitCheck = await fetch('/functions/v1/auth-rate-limit', {
  method: 'POST',
  body: JSON.stringify({ email, action: 'check' })
});
if (!limitCheck.ok) throw new Error('Rate limit exceeded');

// Passo 2: autenticar diretamente no Supabase (senha nunca sai do cliente)
const { error } = await supabase.auth.signInWithPassword({ email, password });
```

**Testes:**
- Login com credenciais corretas → autenticação normal
- Login com credenciais erradas 5x → bloqueio por email (rate limit funciona)
- Verificar nos logs do Edge Function que nenhum payload contém campo `password`

---

### 2.6 — Corrigir open redirect pós-login (VULN-07)

**Arquivo:** `src/pages/Login.tsx`

```typescript
// Antes:
const from = (location.state as { from?: string })?.from || '/home';
navigate(from, { replace: true });

// Depois:
const raw = (location.state as { from?: string })?.from;
const from = typeof raw === 'string'
  && raw.startsWith('/')
  && !raw.startsWith('//')
  && !raw.includes(':')
  ? raw
  : '/home';
navigate(from, { replace: true });
```

**Testes:**
- Login normal → redireciona para /home ou rota anterior válida
- URL com `from=//evil.com` → redireciona para /home (não para o domínio externo)
- URL com `from=javascript:alert(1)` → redireciona para /home

---

### 2.7 — Migrar rate limiting para banco de dados (ALTO-1)

**Problema:** o `Map()` em memória do Deno isolate é descartado em cada restart. Um atacante pode reiniciar o contador simplesmente esperando um restart da Edge Function (cold start).

**Criar tabela de rate limiting:**
```sql
-- supabase/migrations/20260428000005_persistent_rate_limiting.sql
CREATE TABLE IF NOT EXISTS public.rate_limit_attempts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier text NOT NULL,           -- email ou IP
  action text NOT NULL DEFAULT 'login',
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rate_limit_idx ON public.rate_limit_attempts (identifier, action, attempted_at);

-- Limpar registros antigos automaticamente (> 24h)
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_attempts()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.rate_limit_attempts WHERE attempted_at < now() - interval '24 hours';
$$;
```

**Atualizar Edge Function `auth-rate-limit`:**
```typescript
// Substituir Map() em memória por consulta ao banco:
const { count } = await supabaseAdmin
  .from('rate_limit_attempts')
  .select('id', { count: 'exact', head: true })
  .eq('identifier', email)
  .gte('attempted_at', new Date(Date.now() - 60_000).toISOString()); // último minuto

if ((count ?? 0) >= 5) {
  return new Response(JSON.stringify({ error: 'Too many attempts' }), { status: 429 });
}

// Registrar tentativa:
await supabaseAdmin.from('rate_limit_attempts').insert({ identifier: email });
```

---

### 2.8 — Security headers no deployment (VULN-02 / ALTO-3)

**Criar/atualizar `vercel.json` ou `netlify.toml`:**

```toml
# netlify.toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    X-XSS-Protection = "1; mode=block"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=()"
    Strict-Transport-Security = "max-age=63072000; includeSubDomains; preload"
    Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://nxmgppfyltwsqryfxkbm.supabase.co https://login.microsoftonline.com"
```

**Testes:**
```bash
curl -I https://flaghub.flag.com.br
# Verificar presença de todos os headers acima na resposta
```

---

## FASE 3 — Vulnerabilidades Médias (30 dias)

### 3.1 — Mover anon key para variável de ambiente (VULN-01 / MED-01)

```typescript
// src/integrations/supabase/client.ts
// Antes:
const SUPABASE_URL = "https://hardcoded...";
const SUPABASE_PUBLISHABLE_KEY = "eyJ...hardcoded";

// Depois:
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
```

```bash
# .env.example (commitado — sem valores reais):
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# .env.local (gitignored — valores reais):
VITE_SUPABASE_URL=https://nxmgppfyltwsqryfxkbm.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Após mover para env vars: **rotacionar a anon key** no painel Supabase → Settings → API → Rotate anon key.

### 3.2 — Rate limiting por X-Real-IP (VULN-03)

Substituir `x-forwarded-for` por header não-forjável do runtime Supabase:
```typescript
// Deno/Supabase Edge Runtime expõe o IP real via:
const clientIp = req.headers.get('x-real-ip')   // preferencial
  ?? req.headers.get('cf-connecting-ip')          // Cloudflare
  ?? 'unknown';
```

### 3.3 — Remover console.log com dados de auth em produção

```typescript
// src/contexts/AuthContext.tsx e outros arquivos
// Condicionar ao ambiente:
if (import.meta.env.DEV) {
  console.log("[Auth] User data:", userData);
}
// OU usar logger condicional centralizado:
// src/lib/logger.ts → só loga se import.meta.env.DEV
```

---

## FASE 4 — Framework de Segurança Contínua

### 4.1 — Checklist de PR Obrigatório para Features de Segurança

Criar arquivo `.github/pull_request_template.md` (ou equivalente):

```markdown
## Checklist de Segurança

Marque N/A se não aplicável. PRs que tocam em auth, RLS ou Edge Functions
exigem que todos os itens aplicáveis sejam marcados.

### Banco de Dados / RLS
- [ ] Nenhuma política nova usa `USING (true)` sem `hub_is_approved()` ou restrição equivalente
- [ ] Novas tabelas com dados de negócio têm RLS habilitada (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- [ ] Políticas SELECT filtram por área/aprovação — não apenas `TO authenticated`
- [ ] Novas funções `SECURITY DEFINER` têm `SET search_path = public`
- [ ] Funções destrutivas (DELETE, TRUNCATE) têm guard `IF NOT is_admin() THEN RAISE`
- [ ] Novas funções não são executáveis por `anon` sem necessidade explícita
- [ ] Colunas sensíveis novas (ex.: flags de segurança) têm trigger de proteção

### Edge Functions
- [ ] CORS usa `corsHeaders()` de `_shared/cors.ts` (não `'*'`)
- [ ] Autenticação verificada no início da função (`Authorization: Bearer`)
- [ ] Nenhum segredo hardcoded (usar `Deno.env.get()`)
- [ ] Senha ou dados sensíveis não aparecem no payload recebido

### Frontend
- [ ] Nenhum dado sensível em `console.log` (ou condicional a `import.meta.env.DEV`)
- [ ] Redirects validados como rotas internas (não podem iniciar com `//` ou conter `:`)
- [ ] Novas rotas protegidas passam pelo `ProtectedRoute` com verificação de `pendingApproval`
- [ ] `window.open` usa `rel="noopener noreferrer"`

### Geral
- [ ] Nenhuma chave ou segredo hardcoded (usar env vars)
- [ ] Campos de formulário têm validação server-side além da client-side
- [ ] Feature testada com os 3 perfis: anônimo, autenticado-não-aprovado, aprovado
```

---

### 4.2 — Testes de Integridade de Segurança (Automatizados)

Criar arquivo `supabase/tests/security/rls_integrity.sql` para execução periódica ou em CI:

```sql
-- =============================================================
-- TESTES DE INTEGRIDADE DE SEGURANÇA — RLS FlagHub
-- Executar após cada migration que toque em RLS
-- Falha = presença de USING (true) em tabelas de negócio
-- =============================================================

-- TESTE 1: Nenhuma tabela de negócio deve ter USING (true) para authenticated
DO $$
DECLARE
  v_count integer;
  v_tables text;
BEGIN
  -- Tabelas de negócio que NÃO devem ter USING (true):
  WITH business_tables AS (
    SELECT tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND roles::text LIKE '%authenticated%'
      AND qual = 'true'  -- USING (true)
      AND tablename IN (
        'vdesk_clients', 'comercial_pesquisa_satisfacao', 'comercial_movimentacao_clientes',
        'comercial_vendas', 'devops_work_items', 'devops_query_items_current',
        'devops_time_logs', 'hub_raw_ingestions', 'hub_integrations',
        'hub_integration_endpoints', 'helpdesk_dashboard_snapshots',
        'sector_health', 'alert_channels', 'alert_rules', 'alert_deliveries',
        'hub_audit_logs', 'manual_import_templates', 'devops_queries',
        'hub_sync_jobs', 'hub_sync_runs', 'devops_collaborator_map'
      )
  )
  SELECT count(*), string_agg(tablename, ', ')
  INTO v_count, v_tables
  FROM business_tables;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'SECURITY FAIL: % tabelas com USING (true) sem filtro de aprovação: %',
      v_count, v_tables;
  END IF;

  RAISE NOTICE 'PASS: nenhuma tabela de negócio com USING (true) irrestrito';
END;
$$;

-- TESTE 2: hub_is_approved() deve existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hub_is_approved'
  ) THEN
    RAISE EXCEPTION 'SECURITY FAIL: função hub_is_approved() não encontrada';
  END IF;
  RAISE NOTICE 'PASS: hub_is_approved() existe';
END;
$$;

-- TESTE 3: hub_access_requests não deve permitir status != 'pending' no INSERT
DO $$
DECLARE
  v_policy_def text;
BEGIN
  SELECT qual INTO v_policy_def
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'hub_access_requests'
    AND cmd = 'INSERT'
    AND policyname = 'hub_requests_insert_own';

  IF v_policy_def IS NULL THEN
    RAISE EXCEPTION 'SECURITY FAIL: política hub_requests_insert_own não encontrada';
  END IF;

  IF v_policy_def NOT LIKE '%pending%' THEN
    RAISE WARNING 'SECURITY WARN: política INSERT de hub_access_requests pode não restringir status=pending';
  END IF;

  RAISE NOTICE 'PASS: política INSERT de hub_access_requests verificada';
END;
$$;

-- TESTE 4: Funções destrutivas NÃO devem ser executáveis por anon
DO $$
DECLARE
  v_fn text;
  v_found boolean := false;
BEGIN
  FOR v_fn IN
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'delete_tickets_by_network',
        'purge_cs_implantacoes',
        'purge_old_inactive_tickets'
      )
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    RAISE WARNING 'SECURITY FAIL: função destrutiva "%" executável por anon', v_fn;
    v_found := true;
  END LOOP;

  IF NOT v_found THEN
    RAISE NOTICE 'PASS: nenhuma função destrutiva executável por anon';
  END IF;
END;
$$;

-- TESTE 5: Trigger de proteção de mfa_exempt deve existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'profiles'
      AND t.tgname = 'protect_mfa_exempt_trigger'
  ) THEN
    RAISE EXCEPTION 'SECURITY FAIL: trigger protect_mfa_exempt_trigger não encontrado em profiles';
  END IF;
  RAISE NOTICE 'PASS: trigger protect_mfa_exempt_trigger existe';
END;
$$;

-- TESTE 6: RLS habilitada em 100% das tabelas públicas
DO $$
DECLARE
  v_count integer;
  v_tables text;
BEGIN
  SELECT count(*), string_agg(tablename, ', ')
  INTO v_count, v_tables
  FROM pg_tables t
  LEFT JOIN pg_class c ON c.relname = t.tablename
  LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE t.schemaname = 'public'
    AND n.nspname = 'public'
    AND c.relrowsecurity = false
    AND c.relkind = 'r';  -- apenas tabelas reais, não views

  IF v_count > 0 THEN
    RAISE WARNING 'SECURITY WARN: % tabelas sem RLS: %', v_count, v_tables;
  ELSE
    RAISE NOTICE 'PASS: RLS habilitada em 100%% das tabelas públicas';
  END IF;
END;
$$;
```

---

### 4.3 — Regras de Segurança para Novas Features

#### Regra 1 — Toda nova tabela de negócio

```sql
-- Template mínimo para qualquer nova tabela:
CREATE TABLE public.nova_tabela (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  -- ... colunas ...
  created_at timestamptz DEFAULT now()
);

-- OBRIGATÓRIO: habilitar RLS
ALTER TABLE public.nova_tabela ENABLE ROW LEVEL SECURITY;

-- OBRIGATÓRIO: SELECT requer aprovação
CREATE POLICY "nova_tabela_select" ON public.nova_tabela
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());  -- NÃO usar USING (true)

-- OPCIONAL: Se a tabela for por área:
CREATE POLICY "nova_tabela_select_area" ON public.nova_tabela
  FOR SELECT TO authenticated
  USING (public.hub_user_has_area(area_id));
```

#### Regra 2 — Toda nova função SECURITY DEFINER

```sql
-- Template mínimo:
CREATE OR REPLACE FUNCTION public.nova_funcao(params...)
RETURNS tipo
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public  -- OBRIGATÓRIO: fixar search_path
AS $$
BEGIN
  -- Se destrutiva, verificar admin:
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- lógica...
END;
$$;

-- OBRIGATÓRIO: Revogar acesso de anon (exceto se necessário pré-auth)
REVOKE EXECUTE ON FUNCTION public.nova_funcao(params...) FROM anon;
```

#### Regra 3 — Toda nova Edge Function

```typescript
// Template mínimo:
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  // 1. CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  // 2. Verificar autenticação
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  // 3. Criar cliente com o JWT do usuário (não service_role)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  // 4. Lógica da função
  // ...

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
});
```

---

### 4.4 — Revisão Mensal de RLS

Executar no Supabase SQL Editor no início de cada mês:

```sql
-- Auditoria mensal de segurança
-- Copiar resultado e anexar ao relatório do mês

-- 1. Tabelas com USING (true) — não deve crescer
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND qual = 'true'
  AND roles::text LIKE '%authenticated%'
ORDER BY tablename;

-- 2. Funções executáveis por anon — não deve crescer
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY p.proname;

-- 3. Tabelas sem RLS — deve ser sempre 0
SELECT tablename FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE t.schemaname = 'public' AND c.relrowsecurity = false AND c.relkind = 'r';

-- 4. Verificar se trigger de mfa_exempt continua presente
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public' AND trigger_name = 'protect_mfa_exempt_trigger';
```

---

### 4.5 — Proteção contra Rollback de Segurança em CI/CD

Adicionar ao pipeline de CI (GitHub Actions / GitLab CI):

```yaml
# .github/workflows/security-check.yml
name: Security Integrity Check

on:
  push:
    paths:
      - 'supabase/migrations/**'
      - 'supabase/functions/**'
      - 'src/contexts/Auth*'
      - 'src/components/auth/**'

jobs:
  rls-integrity:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Check for USING (true) in new migrations
        run: |
          # Detectar USING (true) em migrations novas (não é proibido, mas requer justificativa)
          NEW_MIGRATIONS=$(git diff --name-only HEAD~1 -- 'supabase/migrations/*.sql')
          if [ -n "$NEW_MIGRATIONS" ]; then
            for f in $NEW_MIGRATIONS; do
              if grep -q 'USING (true)' "$f" || grep -q 'USING(true)' "$f"; then
                echo "⚠️ ATENÇÃO: $f contém USING (true) — verificar se é intencional"
                echo "Se for necessário, deve ser acompanhado de hub_is_approved() ou justificativa"
                # Não falha o build, apenas alerta — decisão humana
              fi
            done
          fi

      - name: Check for hardcoded secrets in new files
        run: |
          # Detectar padrões de chave JWT hardcoded
          if git diff HEAD~1 -- 'src/**' | grep -E 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'; then
            echo "❌ ERRO: JWT hardcoded detectado no código frontend"
            exit 1
          fi

      - name: Validate CORS in new Edge Functions
        run: |
          # Verificar que funções novas usam corsHeaders, não '*'
          NEW_FUNCTIONS=$(git diff --name-only HEAD~1 -- 'supabase/functions/*/index.ts')
          for f in $NEW_FUNCTIONS; do
            if grep -q "'Access-Control-Allow-Origin', '\*'" "$f"; then
              echo "❌ ERRO: $f usa CORS wildcard (*) — usar corsHeaders() de _shared/cors.ts"
              exit 1
            fi
          done
```

---

## Checklist Final de Status

### Após Fase 1 (Hoje)

- [ ] Migration `20260421180000_security_approved_users_rls.sql` aplicada em produção
- [ ] T1–T6 executados e passando
- [ ] Edge Functions com CORS restrito deployadas
- [ ] T7–T8 executados e passando

### Após Fase 2 (7 dias)

- [ ] Migration RPCs destrutivas aplicada — T9, T10 passando
- [ ] Views com `security_invoker=true` — testadas no staging antes de produção
- [ ] REVOKE anon em funções sensíveis — T12, T13 passando
- [ ] Policy `import_events` corrigida — T14 passando
- [ ] Fluxo de login redesenhado — senha não aparece nos logs do Edge Function
- [ ] Open redirect corrigido — testes manuais passando
- [ ] Rate limiting persistente no banco ativo
- [ ] Security headers no deployment — verificados com `curl -I`

### Após Fase 3 (30 dias)

- [ ] `anon key` removida do código-fonte — nova key rotacionada
- [ ] `console.log` com dados de auth removido ou condicional
- [ ] `.env.example` criado e commitado

### Framework Contínuo

- [ ] `supabase/tests/security/rls_integrity.sql` criado e executando em CI
- [ ] PR template com checklist de segurança ativo no repositório
- [ ] Revisão mensal de RLS agendada no calendário da equipe
- [ ] `.github/workflows/security-check.yml` criado e ativo

---

## Contato e Responsabilidades

| Atividade | Responsável | Prazo |
|-----------|------------|-------|
| Aplicar migration Fase 1 | DevOps (deploy Supabase) | 21/04/2026 |
| Fix CORS Edge Functions | Dev backend | 21/04/2026 |
| RPCs destrutivas | Dev backend | 28/04/2026 |
| Views security_invoker | Dev backend (staging first) | 28/04/2026 |
| Redesenho fluxo login | Dev frontend | 28/04/2026 |
| Security headers | DevOps (deploy config) | 28/04/2026 |
| Anon key para env vars | Dev + DevOps | 21/05/2026 |
| CI/CD security gates | DevOps | 21/05/2026 |
| Revisão mensal | Lead técnico | Recorrente |

---

*Plano criado em 21/04/2026 baseado nos Pentest Reports #1, #2 e #3 — FlagHub Operations Hub*
*Próxima revisão do plano: após conclusão da Fase 2 (28/04/2026)*
