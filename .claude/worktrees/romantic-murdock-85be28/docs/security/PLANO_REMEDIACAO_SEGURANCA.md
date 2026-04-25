# Plano Mestre de Remediação de Segurança — FlagHub Operations Hub

---

| Campo | Valor |
|-------|-------|
| **Versão** | 1.1 — revisado com estado real do código |
| **Data** | 21/04/2026 |
| **Baseado em** | Pentest Reports #1, #2 e #3 + auditoria direta do código-fonte |
| **Responsável** | Equipe DevOps FLAG INTELLIWAN |
| **Status** | 🔴 Nenhuma correção aplicada em produção ainda |

> ⚠️ **Nota crítica de revisão:** A versão anterior deste plano continha imprecisões herdadas dos relatórios de pentest produzidos por LLMs. Algumas vulnerabilidades foram removidas por já estarem implementadas; outras foram adicionadas por não estarem implementadas conforme afirmado. Este documento reflete o **estado verificado diretamente no código-fonte** em 21/04/2026.

---

## Estado Real — O Que Já Existe vs O Que Falta

### ✅ Controles já implementados (não requerem ação)

| Controle | Evidência no código |
|----------|---------------------|
| RLS habilitada em 100% das tabelas | `relrowsecurity = true` em todas as tabelas públicas |
| Azure AD SSO | `AuthContext.tsx:606` — `signInWithOAuth({provider:"azure"})` |
| Rate limiting persistente em banco | Tabela `login_attempts` com `locked_until`; Edge Function `auth-rate-limit` ativa |
| MFA com TOTP (auth local) | `MfaEnroll.tsx`, `MfaVerify.tsx`; `ProtectedRoute` verifica `mfaRequired` |
| Views KPI com `security_invoker=on` | Migration `20260312145739` — `vw_devops_queue_items`, `vw_comercial_*`, `vw_helpdesk_kpis`, etc. |
| `search_path` fixado em SECURITY DEFINER | 100% das funções verificadas no Relatório #2 |
| `service_role` nunca no frontend | `grep -R SERVICE_ROLE src/` → 0 resultados |

### 🔴 Vulnerabilidades pendentes (nenhuma foi corrigida)

| ID | Severidade | Descrição | Arquivo/Local |
|----|:----------:|-----------|--------------|
| CRÍTICO-1 | 🔴 | MFA bypass via `mfa_exempt` self-update | `profiles` — 2 policies UPDATE coexistem |
| CRÍTICO-2 | 🔴 | CORS wildcard em todas as Edge Functions | `supabase/functions/*/index.ts` |
| CRÍTICO-3 | 🔴 | Unapproved user lê 20+ tabelas com PII | 37 políticas `USING (true)` |
| CRÍTICO-4 | 🔴 | Auto-aprovação via INSERT status='approved' | `hub_access_requests` policy |
| CRIT-01 | 🔴 | RPC `delete_tickets_by_network` sem auth | Migration `20260331141914` |
| CRIT-02 | 🔴 | RPC `purge_cs_implantacoes` sem auth | Migration `20260331192213` |
| CRIT-03 | 🔴 | RPC `purge_old_inactive_tickets` sem auth | Migration `20260129000000` |
| ALTO-1 | 🟠 | Signup não desabilitado server-side | `AuthContext.tsx:575`; config.toml sem `disable_signup` |
| ALTO-2 | 🟠 | 52 funções executáveis por `anon` | `pg_proc` — `has_function_privilege('anon',...)` |
| ALTO-3 | 🟠 | Senha transmitida ao Edge Function | `Login.tsx` envia `password` no corpo da requisição |
| ALTO-4 | 🟠 | Security headers ausentes | `netlify.toml`, `vercel.json` |
| ALTO-5 | 🟠 | MFA ausente para usuários Azure SSO | `AuthContext.tsx:136` — SSO users retornam `false` no check de MFA |
| MÉDIO-1 | 🟡 | Anon key hardcoded no código-fonte | `src/integrations/supabase/client.ts:5` |
| MÉDIO-2 | 🟡 | Open redirect pós-login sem validação | `Login.tsx` — `navigate(from)` sem sanitização |
| MÉDIO-3 | 🟡 | Policy INSERT `public` em `import_events` | Migration original — `roles={public}` |
| MÉDIO-4 | 🟡 | Policy `import_events` INSERT com role `public` | `pg_policies` — role deveria ser `authenticated` |
| INFO-1 | 🟢 | Auth settings expostos publicamente | Comportamento padrão Supabase — aceitar como risco |
| INFO-2 | 🟢 | `console.log` com dados de auth em produção | `AuthContext.tsx` — múltiplos pontos |

---

## Princípios Guia

> **"Corrija o banco de dados, nunca apenas o frontend."** — Toda proteção de acesso deve existir em RLS/triggers. O frontend protege UX, não dados.

> **"Nenhuma policy `USING (true)` para tabelas de negócio."** — Qualquer tabela com dados de negócio deve verificar aprovação real, não apenas autenticação.

> **"Teste os 3 perfis: anônimo, autenticado-não-aprovado, aprovado."** — Toda feature nova deve ser testada nesses 3 contextos antes de ir a produção.

> **"Não quebre o que funciona."** — As fases são ordenadas por impacto zero → baixo → médio. Cada item tem testes de regressão obrigatórios.

---

## Visão Geral das Fases

```
FASE 1 — Crítico imediato (Hoje, 21/04/2026)       Impacto na app: ZERO
  ├── Migration 20260421180000 (RLS aprovação + INSERT fix + trigger mfa_exempt)
  ├── Desabilitar signup server-side
  └── CORS restrito nas Edge Functions

FASE 2 — Alto (Próximos 7 dias)                    Impacto na app: BAIXO
  ├── Auth guards em 3 RPCs destrutivas
  ├── REVOKE EXECUTE de anon em 52 funções
  ├── Redesenho do fluxo de login (senha não vai ao Edge Function)
  └── Security headers no deployment

FASE 3 — Médio (Próximos 30 dias)                  Impacto na app: NENHUM
  ├── Anon key → variável de ambiente
  ├── Open redirect fix
  ├── Policy import_events: public → authenticated
  ├── console.log condicional ao ambiente
  └── MFA para SSO users (decisão de arquitetura necessária)

FASE 4 — Framework Contínuo (Permanente)
  ├── Testes de integridade SQL automatizados
  ├── Checklist de PR obrigatório
  ├── Templates de código seguro
  └── Auditoria mensal de RLS
```

---

## FASE 1 — Vulnerabilidades Críticas (Hoje, impacto zero na aplicação)

### 1.1 — Migration de segurança principal

**Arquivo criado:** `supabase/migrations/20260421180000_security_approved_users_rls.sql`

**O que resolve:** CRÍTICO-1 (trigger mfa_exempt) + CRÍTICO-3 (37 políticas → hub_is_approved) + CRÍTICO-4 (INSERT status=pending)

**Impacto na aplicação:**
- Usuários **aprovados** (`hub_area_members.is_active=true`): sem mudança — continuam vendo tudo normalmente
- Usuários **admin**: sem mudança — `hub_is_admin()` retorna true em `hub_is_approved()`
- Usuários **não aprovados**: passam a receber arrays vazios nas tabelas de negócio (comportamento correto — já eram redirecionados pelo frontend)
- Campo `mfa_exempt`: admins continuam conseguindo alterar; não-admins recebem erro 42501 se tentarem

**Como aplicar:**
```bash
# Via Supabase CLI
supabase db push --linked

# OU via Supabase Dashboard → SQL Editor → colar e executar
```

**Testes obrigatórios antes de considerar concluído:**

```bash
# Variáveis necessárias para os testes:
# JWT_APPROVED   = token de usuário com hub_area_members.is_active=true
# JWT_UNAPPROVED = token de usuário SEM hub_area_members
# JWT_ADMIN      = token de usuário com is_admin()=true
# JWT_REGULAR    = token de qualquer usuário autenticado não-admin

ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
BASE="https://nxmgppfyltwsqryfxkbm.supabase.co"

# T1: usuário NÃO aprovado não acessa vdesk_clients
curl -s "$BASE/rest/v1/vdesk_clients" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $JWT_UNAPPROVED" | jq 'length'
# ESPERADO: 0

# T2: usuário APROVADO acessa vdesk_clients
curl -s "$BASE/rest/v1/vdesk_clients" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $JWT_APPROVED" | jq 'length'
# ESPERADO: > 0

# T3: usuário NÃO aprovado não acessa comercial_pesquisa_satisfacao
curl -s "$BASE/rest/v1/comercial_pesquisa_satisfacao" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $JWT_UNAPPROVED" | jq 'length'
# ESPERADO: 0

# T4: INSERT hub_access_requests com status='approved' DEVE ser rejeitado
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/rest/v1/hub_access_requests" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $JWT_UNAPPROVED" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$(echo $JWT_UNAPPROVED | jq -R 'split(".")[1] | @base64d | fromjson | .sub' -r)\",\"area_id\":\"00000000-0000-0000-0000-000000000001\",\"status\":\"approved\"}"
# ESPERADO: 403 ou 422

# T5: INSERT hub_access_requests com status='pending' DEVE funcionar
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/rest/v1/hub_access_requests" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $JWT_UNAPPROVED" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$(echo $JWT_UNAPPROVED | jq -R 'split(".")[1] | @base64d | fromjson | .sub' -r)\",\"area_id\":\"00000000-0000-0000-0000-000000000001\",\"status\":\"pending\"}"
# ESPERADO: 201

# T6: não-admin NÃO pode atualizar mfa_exempt para true
curl -s -o /dev/null -w "%{http_code}" \
  -X PATCH "$BASE/rest/v1/profiles?user_id=eq.<uuid-do-usuario>" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $JWT_REGULAR" \
  -H "Content-Type: application/json" \
  -d '{"mfa_exempt":true}'
# ESPERADO: 500 (trigger raise exception) ou 403

# T7: admin PODE atualizar mfa_exempt
curl -s -o /dev/null -w "%{http_code}" \
  -X PATCH "$BASE/rest/v1/profiles?user_id=eq.<uuid-do-usuario>" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $JWT_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"mfa_exempt":true}'
# ESPERADO: 204

# T8: regressão — dashboard do usuário aprovado carrega normalmente
# (teste manual: logar com usuário aprovado → verificar se dados carregam)
```

---

### 1.2 — Desabilitar signup server-side

**Vulnerabilidade:** ALTO-1 — a função `signUp()` existe em `AuthContext.tsx:575` e pode ser chamada programaticamente. O login UI não expõe o formulário de signup, mas qualquer pessoa com a anon key pode:
```bash
curl -X POST "https://nxmgppfyltwsqryfxkbm.supabase.co/auth/v1/signup" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"atacante@dominio.com","password":"Senha@123"}'
```

**Correção A — Supabase Dashboard (imediata, sem código):**
```
Supabase Dashboard → Authentication → Providers → Email
→ Desabilitar "Enable Email Signups"
→ Salvar
```

**Correção B — Edge Function guard (defesa em profundidade):**
```typescript
// supabase/functions/auth-rate-limit/index.ts
// Antes de processar qualquer signup, rejeitar:
if (body.action === 'signup') {
  return new Response(JSON.stringify({ error: 'Signup is disabled' }), {
    status: 403,
    headers: corsHeaders(req),
  });
}
```

**Correção C — Remover signUp do AuthContext (limpeza de código):**
```typescript
// src/contexts/AuthContext.tsx — remover ou deixar apenas para uso futuro planejado:
// const signUp = ... // REMOVIDO — signup não é suportado nesta versão
```

**Testes:**
```bash
# T9: tentativa de signup direto na API deve ser rejeitada
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "https://nxmgppfyltwsqryfxkbm.supabase.co/auth/v1/signup" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"teste@externo.com","password":"Senha@123"}'
# ESPERADO: 422 ou 403 (após desabilitar no dashboard)

# T10: login Azure AD normal continua funcionando
# (teste manual: clicar em "Entrar com Microsoft" → autenticação funciona)
```

---

### 1.3 — CORS restrito nas Edge Functions

**Vulnerabilidade:** CRÍTICO-2 — `Access-Control-Allow-Origin: *` em todas as funções.

**Criar arquivo compartilhado:**

```typescript
// supabase/functions/_shared/cors.ts
const ALLOWED_ORIGINS = [
  'https://flaghub.flag.com.br',
  'https://flaghub-staging.netlify.app',
  'http://localhost:5173',
  'http://localhost:4173',
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

**Substituir em cada Edge Function — padrão atual para corrigir:**
```typescript
// Localizar em cada função:
{ 'Access-Control-Allow-Origin': '*' }

// Substituir por:
import { corsHeaders } from '../_shared/cors.ts';
// ...
corsHeaders(req)
```

**Funções a atualizar** (verificar todas em `supabase/functions/`):
`auth-rate-limit`, `flag-ai-gateway`, `vdesk-proxy` (consultar-vdesk), `devops-sync-all`, `smtp-test`, `webhook-test` e demais.

**⚠️ Atenção:** Adicionar a URL de produção correta do FlagHub em `ALLOWED_ORIGINS` antes de deployar.

**Testes:**
```bash
# T11: origem permitida retorna o header exato (não wildcard)
curl -sI -X OPTIONS "$BASE/functions/v1/auth-rate-limit" \
  -H "Origin: https://flaghub.flag.com.br" | grep -i "access-control-allow-origin"
# ESPERADO: Access-Control-Allow-Origin: https://flaghub.flag.com.br

# T12: origem não permitida retorna a origem padrão (não a requisitada)
curl -sI -X OPTIONS "$BASE/functions/v1/auth-rate-limit" \
  -H "Origin: https://site-malicioso.com" | grep -i "access-control-allow-origin"
# ESPERADO: Access-Control-Allow-Origin: https://flaghub.flag.com.br

# T13: regressão — app em produção ainda consegue chamar as Edge Functions
# (teste manual: login e qualquer fluxo que use Edge Functions)
```

---

## FASE 2 — Vulnerabilidades Altas (Próximos 7 dias, baixo impacto)

### 2.1 — Auth guards nas RPCs destrutivas (CRIT-01, 02, 03)

**Criar migration:** `supabase/migrations/20260428000001_harden_destructive_rpcs.sql`

```sql
-- CRIT-01: delete_tickets_by_network — qualquer autenticado pode deletar tickets de qualquer rede
CREATE OR REPLACE FUNCTION public.delete_tickets_by_network(p_network_id bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.tickets WHERE network_id = p_network_id;
  RETURN (SELECT count(*) FROM public.tickets WHERE network_id = p_network_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_tickets_by_network(bigint) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.delete_tickets_by_network(bigint) TO service_role;

-- CRIT-02: purge_cs_implantacoes — qualquer autenticado pode purgar todos os registros
CREATE OR REPLACE FUNCTION public.purge_cs_implantacoes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_count FROM public.cs_implantacoes_records;
  DELETE FROM public.cs_implantacoes_records;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.purge_cs_implantacoes() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_cs_implantacoes() TO service_role;

-- CRIT-03: purge_old_inactive_tickets — qualquer autenticado pode purgar tickets de qualquer rede
CREATE OR REPLACE FUNCTION public.purge_old_inactive_tickets(
  p_network_id integer,
  p_days_threshold integer DEFAULT 7
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_count FROM public.tickets
    WHERE network_id = p_network_id AND is_active = false
      AND updated_at < now() - (p_days_threshold || ' days')::interval;
  DELETE FROM public.tickets
    WHERE network_id = p_network_id AND is_active = false
      AND updated_at < now() - (p_days_threshold || ' days')::interval;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.purge_old_inactive_tickets(integer, integer) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_old_inactive_tickets(integer, integer) TO service_role;
```

**Testes:**
```bash
# T14: usuário autenticado (não admin) não pode chamar RPC destrutiva
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/rest/v1/rpc/delete_tickets_by_network" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $JWT_REGULAR" \
  -H "Content-Type: application/json" -d '{"p_network_id":1}'
# ESPERADO: 403

# T15: anon não consegue nem chamar (function not found ou 403)
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/rest/v1/rpc/delete_tickets_by_network" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" -d '{"p_network_id":1}'
# ESPERADO: 403 ou 404

# T16: regressão — funcionalidade de admin que usa essas RPCs continua funcionando
# (se algum painel admin usa essas RPCs via service_role, verificar que ainda funciona)
```

---

### 2.2 — REVOKE EXECUTE em funções desnecessárias para `anon`

**Criar migration:** `supabase/migrations/20260428000002_revoke_anon_execute.sql`

```sql
-- Gerar a lista completa executando no SQL Editor ANTES de criar a migration:
SELECT 'REVOKE EXECUTE ON FUNCTION public.'
       || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') FROM anon;'
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
  AND p.proname NOT IN (
    -- Whitelist: funções que realmente precisam ser acessíveis pré-autenticação
    'hub_check_my_ip',
    'hub_is_ip_allowed',
    'hub_request_ip'
  );

-- Aplicar o resultado como migration.
-- Garantir também:
REVOKE EXECUTE ON FUNCTION public.hub_audit_log(text, text, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.hub_is_admin() FROM anon;
```

**⚠️ Processo obrigatório antes de aplicar:**
1. Rodar a query de geração de REVOKEs no staging
2. Verificar a whitelist — funções que o app chama sem autenticação prévia devem estar nela
3. Testar o app completo no staging com os REVOKEs aplicados
4. Só então aplicar em produção

**Testes:**
```bash
# T17: is_admin não executável por anon
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/rest/v1/rpc/is_admin" -H "apikey: $ANON_KEY"
# ESPERADO: 403 ou 404

# T18: hub_check_my_ip ainda funciona para anon (whitelist)
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/rest/v1/rpc/hub_check_my_ip" -H "apikey: $ANON_KEY"
# ESPERADO: 200

# T19: regressão — fluxo de login completo funciona
# (login via Azure AD → MFA se necessário → dashboard → operações normais)
```

---

### 2.3 — Redesenho do fluxo de login (senha não vai ao Edge Function)

**Arquivo:** `src/pages/Login.tsx`

**Problema:** a senha é enviada ao Edge Function `auth-rate-limit` antes da autenticação, ficando exposta nos logs do Supabase Edge.

```typescript
// ANTES — senha no payload do Edge Function:
const response = await fetch(`${supabaseUrl}/functions/v1/auth-rate-limit`, {
  method: 'POST',
  body: JSON.stringify({ email, password }),  // ← senha exposta nos logs
});

// DEPOIS — dois passos independentes:
// Passo 1: verificar rate limit com apenas o email
const limitCheck = await fetch(`${supabaseUrl}/functions/v1/auth-rate-limit`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': supabaseAnonKey },
  body: JSON.stringify({ email, action: 'check' }),
});
if (limitCheck.status === 429) {
  throw new Error('Muitas tentativas. Aguarde antes de tentar novamente.');
}

// Passo 2: autenticar diretamente no Supabase (senha nunca sai do cliente)
const { data, error } = await supabase.auth.signInWithPassword({ email, password });

// Passo 3: registrar tentativa (sucesso ou falha) sem senha
await fetch(`${supabaseUrl}/functions/v1/auth-rate-limit`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': supabaseAnonKey },
  body: JSON.stringify({ email, action: 'record', success: !error }),
});
```

**Atualizar Edge Function `auth-rate-limit`** para aceitar os novos campos `action: 'check' | 'record'` e `success: boolean`.

**Testes:**
- Login com credenciais corretas → autenticação normal
- Login com credenciais erradas 5x em 5min → HTTP 429
- Verificar logs do Supabase Edge: nenhum payload deve conter campo `password`
- Rate limiting continua funcionando (tabela `login_attempts` acumulando)

---

### 2.4 — Security headers no deployment

**Arquivo:** `netlify.toml` ou `vercel.json`

```toml
# netlify.toml — adicionar antes de [[redirects]]:
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
curl -sI https://flaghub.flag.com.br | grep -iE "x-frame|x-content|strict-transport|content-security"
# ESPERADO: todos os headers presentes
```

---

## FASE 3 — Vulnerabilidades Médias (Próximos 30 dias)

### 3.1 — Anon key em variável de ambiente

**Arquivo:** `src/integrations/supabase/client.ts`

```typescript
// ANTES:
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...hardcoded";

// DEPOIS:
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
```

Após mover: **rotacionar a anon key** no Supabase Dashboard → Settings → API → Rotate anon key.

Criar `.env.example` (commitado, sem valores reais) e `.env.local` (gitignored, valores reais).

### 3.2 — Open redirect pós-login

**Arquivo:** `src/pages/Login.tsx`

```typescript
// ANTES:
const from = (location.state as { from?: string })?.from || '/home';
navigate(from, { replace: true });

// DEPOIS — sanitizar antes de navegar:
const raw = (location.state as { from?: string })?.from;
const from = typeof raw === 'string'
  && raw.startsWith('/')
  && !raw.startsWith('//')
  && !raw.includes(':')
  ? raw
  : '/home';
navigate(from, { replace: true });
```

### 3.3 — Policy `import_events` com role `public`

**Migration:** `supabase/migrations/20260428000003_fix_import_events_policy.sql`

```sql
ALTER POLICY "Admin/Gestao can create import events"
  ON public.import_events
  TO authenticated;
```

### 3.4 — Remover/condicionar `console.log` com dados de auth

```typescript
// src/contexts/AuthContext.tsx e outros — substituir:
console.log("[Auth] ...", dadoSensivel);

// Por:
if (import.meta.env.DEV) {
  console.log("[Auth] ...", dadoSensivel);
}
```

### 3.5 — MFA para usuários Azure SSO (decisão de arquitetura)

**Situação atual:** `AuthContext.tsx:136-138` — SSO users retornam `false` no check de MFA por design.

```typescript
// AuthContext.tsx:136
if (session.user.app_metadata?.provider === 'azure') {
  return false; // Azure AD gerencia autenticação, sem TOTP adicional
}
```

**Opções:**
- **Manter:** Confiar no MFA do Azure AD tenant (recomendado se Azure AD tem MFA obrigatório configurado no tenant)
- **Adicionar camada extra:** Exigir TOTP do Supabase mesmo para SSO users (implica UX mais pesada)

**Ação necessária:** Verificar se o tenant Azure AD tem MFA obrigatório configurado para todos os usuários. Se sim, o comportamento atual é seguro e justificado. Documentar a decisão.

---

## FASE 4 — Framework de Segurança Contínua

### 4.1 — Testes de integridade de segurança (SQL automatizados)

**Criar:** `supabase/tests/security/rls_integrity.sql`

```sql
-- Executar após toda migration que toque em RLS.
-- Cada bloco levanta EXCEPTION se detectar regressão.

-- TESTE 1: nenhuma tabela de negócio com USING (true) irrestrito
DO $$
DECLARE v_count int; v_tables text;
BEGIN
  SELECT count(*), string_agg(tablename, ', ')
  INTO v_count, v_tables
  FROM pg_policies
  WHERE schemaname = 'public'
    AND roles::text LIKE '%authenticated%'
    AND qual = 'true'
    AND tablename IN (
      'vdesk_clients','comercial_pesquisa_satisfacao','comercial_movimentacao_clientes',
      'comercial_vendas','devops_work_items','devops_query_items_current',
      'devops_time_logs','hub_raw_ingestions','hub_integrations','hub_integration_endpoints',
      'helpdesk_dashboard_snapshots','sector_health','alert_channels','alert_rules',
      'alert_deliveries','hub_audit_logs','manual_import_templates','devops_queries',
      'hub_sync_jobs','hub_sync_runs','devops_collaborator_map','hub_area_inheritance'
    );
  IF v_count > 0 THEN
    RAISE EXCEPTION 'SECURITY FAIL T1: tabelas com USING (true) irrestrito: %', v_tables;
  END IF;
  RAISE NOTICE 'PASS T1: nenhuma tabela de negócio com USING (true)';
END $$;

-- TESTE 2: hub_is_approved() deve existir
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='hub_is_approved') THEN
    RAISE EXCEPTION 'SECURITY FAIL T2: hub_is_approved() não existe';
  END IF;
  RAISE NOTICE 'PASS T2: hub_is_approved() existe';
END $$;

-- TESTE 3: trigger de proteção de mfa_exempt deve existir
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='profiles'
      AND t.tgname='protect_mfa_exempt_trigger') THEN
    RAISE EXCEPTION 'SECURITY FAIL T3: trigger protect_mfa_exempt_trigger não existe em profiles';
  END IF;
  RAISE NOTICE 'PASS T3: trigger protect_mfa_exempt_trigger existe';
END $$;

-- TESTE 4: RPCs destrutivas não devem ser executáveis por authenticated
DO $$
DECLARE v_fn text; v_found bool := false;
BEGIN
  FOR v_fn IN
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('delete_tickets_by_network','purge_cs_implantacoes','purge_old_inactive_tickets')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  LOOP
    RAISE WARNING 'SECURITY FAIL T4: RPC destrutiva "%" executável por authenticated', v_fn;
    v_found := true;
  END LOOP;
  IF NOT v_found THEN RAISE NOTICE 'PASS T4: RPCs destrutivas restritas'; END IF;
END $$;

-- TESTE 5: RLS habilitada em 100% das tabelas
DO $$
DECLARE v_count int; v_tables text;
BEGIN
  SELECT count(*), string_agg(t.tablename, ', ')
  INTO v_count, v_tables
  FROM pg_tables t
  JOIN pg_class c ON c.relname=t.tablename
  JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
  WHERE t.schemaname='public' AND c.relrowsecurity=false AND c.relkind='r';
  IF v_count > 0 THEN
    RAISE WARNING 'SECURITY WARN T5: tabelas sem RLS: %', v_tables;
  ELSE
    RAISE NOTICE 'PASS T5: RLS em 100%% das tabelas';
  END IF;
END $$;

-- TESTE 6: hub_access_requests INSERT deve restringir status=pending
DO $$
DECLARE v_with_check text;
BEGIN
  SELECT with_check INTO v_with_check FROM pg_policies
  WHERE schemaname='public' AND tablename='hub_access_requests'
    AND cmd='INSERT' AND policyname='hub_requests_insert_own';
  IF v_with_check IS NULL THEN
    RAISE EXCEPTION 'SECURITY FAIL T6: política hub_requests_insert_own não encontrada';
  END IF;
  IF v_with_check NOT LIKE '%pending%' THEN
    RAISE WARNING 'SECURITY WARN T6: INSERT hub_access_requests pode não restringir status=pending. WITH CHECK: %', v_with_check;
  ELSE
    RAISE NOTICE 'PASS T6: INSERT hub_access_requests restringe status=pending';
  END IF;
END $$;
```

---

### 4.2 — Checklist de PR obrigatório

Criar `.github/pull_request_template.md`:

```markdown
## Checklist de Segurança

> Marque N/A se não aplicável. PRs que tocam em auth, RLS, Edge Functions
> ou qualquer tabela de dados de negócio exigem os itens aplicáveis marcados.

### Banco de dados / RLS
- [ ] Nenhuma política nova usa `USING (true)` em tabela de negócio sem `hub_is_approved()`
- [ ] Novas tabelas têm RLS habilitada (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- [ ] Novas funções `SECURITY DEFINER` têm `SET search_path = public`
- [ ] Funções destrutivas têm `IF NOT is_admin() THEN RAISE` antes de qualquer operação
- [ ] Novas funções não são executáveis por `anon` sem necessidade explícita e documentada
- [ ] Colunas sensíveis novas têm trigger de proteção ou são admin-only por RLS

### Edge Functions
- [ ] CORS usa `corsHeaders()` de `_shared/cors.ts` — nunca `'*'` direto
- [ ] Autenticação verificada no início (`Authorization: Bearer ...`)
- [ ] Nenhum segredo hardcoded — usar `Deno.env.get()`
- [ ] Senha ou dados de autenticação não aparecem no corpo da requisição recebida

### Frontend
- [ ] `console.log` com dados sensíveis está dentro de `if (import.meta.env.DEV)`
- [ ] Redirects validados: devem iniciar com `/`, não com `//` e não conter `:`
- [ ] Novas rotas protegidas passam por `ProtectedRoute` (inclui check de `pendingApproval`)
- [ ] `window.open` usa `rel="noopener noreferrer"`

### Testes dos 3 perfis (obrigatório para qualquer feature de dados)
- [ ] Testado com usuário **anônimo** → sem acesso a dados
- [ ] Testado com usuário **autenticado não aprovado** → sem acesso a dados de negócio
- [ ] Testado com usuário **aprovado** → acesso normal funcionando
```

---

### 4.3 — Templates de código seguro para novas features

#### Nova tabela de dados de negócio
```sql
CREATE TABLE public.nome_tabela (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now()
  -- ... colunas de negócio
);

ALTER TABLE public.nome_tabela ENABLE ROW LEVEL SECURITY;

-- OBRIGATÓRIO: SELECT requer aprovação real
CREATE POLICY "nome_tabela_select" ON public.nome_tabela
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());
  -- Se por área: USING (public.hub_user_has_area(area_id))
  -- NUNCA: USING (true)
```

#### Nova função SECURITY DEFINER
```sql
CREATE OR REPLACE FUNCTION public.nova_funcao(params...)
RETURNS tipo
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public  -- OBRIGATÓRIO
AS $$
BEGIN
  -- Se a função modifica dados sensíveis:
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- lógica...
END;
$$;

-- OBRIGATÓRIO: revogar anon (exceto se necessário pré-auth)
REVOKE EXECUTE ON FUNCTION public.nova_funcao(params...) FROM anon;
```

#### Nova Edge Function
```typescript
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  // Verificar autenticação
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  // Cliente com JWT do usuário — RLS aplicada automaticamente
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  // lógica...

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
});
```

---

### 4.4 — Auditoria mensal de RLS (rodar no SQL Editor)

```sql
-- Verificar se nenhuma nova USING (true) foi adicionada em tabelas de negócio
SELECT tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND qual = 'true'
  AND roles::text LIKE '%authenticated%'
ORDER BY tablename;
-- Resultado esperado: apenas tabelas de config pública, NENHUMA tabela de dados de negócio

-- Verificar funções executáveis por anon (não deve crescer)
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY p.proname;

-- Verificar tabelas sem RLS (deve ser sempre 0)
SELECT tablename FROM pg_tables t
JOIN pg_class c ON c.relname=t.tablename
JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
WHERE t.schemaname='public' AND c.relrowsecurity=false AND c.relkind='r';

-- Verificar se trigger de mfa_exempt continua presente
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema='public' AND trigger_name='protect_mfa_exempt_trigger';
```

---

## Checklist de Conclusão por Fase

### Fase 1 — Concluída quando:
- [ ] Migration `20260421180000` aplicada em produção
- [ ] T1–T8 executados e passando
- [ ] Signup desabilitado no Supabase Dashboard (verificar com T9)
- [ ] Edge Functions redeploy com `_shared/cors.ts` — T11, T12, T13 passando
- [ ] Regressão confirmada: dashboard carrega, login Azure funciona, aprovação funciona

### Fase 2 — Concluída quando:
- [ ] Migration RPCs destrutivas aplicada — T14, T15, T16 passando
- [ ] REVOKE anon em 52 funções — validado no staging, T17, T18, T19 passando
- [ ] Fluxo de login redesenhado — `password` não aparece nos logs do Edge Function
- [ ] Security headers ativos — verificar com `curl -sI https://flaghub.flag.com.br`

### Fase 3 — Concluída quando:
- [ ] Anon key em env vars + key rotacionada no Supabase Dashboard
- [ ] Open redirect sanitizado — teste com `from=//evil.com` e `from=javascript:alert(1)`
- [ ] Policy `import_events` corrigida
- [ ] `console.log` sensíveis condicionais — verificar com `grep -r "console.log" src/ | grep -i auth`
- [ ] MFA para SSO documentado (decisão arquitetural registrada)

### Fase 4 — Ativa quando:
- [ ] `supabase/tests/security/rls_integrity.sql` criado e executando em CI/CD
- [ ] PR template com checklist de segurança ativo no repositório
- [ ] Auditoria mensal agendada (1º de cada mês)

---

## Responsabilidades e Prazos

| Fase | Atividade | Responsável | Prazo |
|------|-----------|------------|-------|
| 1 | Deploy migration 20260421180000 | DevOps | **21/04/2026** |
| 1 | Desabilitar signup (Dashboard) | DevOps | **21/04/2026** |
| 1 | CORS Edge Functions | Dev backend | **21/04/2026** |
| 2 | RPCs destrutivas | Dev backend | 28/04/2026 |
| 2 | REVOKE anon (testar no staging) | Dev backend | 28/04/2026 |
| 2 | Redesenho fluxo login | Dev frontend | 28/04/2026 |
| 2 | Security headers deployment | DevOps | 28/04/2026 |
| 3 | Anon key env vars + rotação | Dev + DevOps | 21/05/2026 |
| 3 | Open redirect + import_events | Dev | 21/05/2026 |
| 4 | SQL testes integridade + PR template | Lead técnico | 21/05/2026 |
| 4 | Auditoria mensal | Lead técnico | Recorrente |

---

*Versão 1.1 — 21/04/2026 — revisado com estado real do código-fonte verificado diretamente*
*Versão anterior (1.0) continha imprecisões herdadas de relatórios LLM — corrigidas nesta versão*
