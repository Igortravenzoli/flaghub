# Segurança — FlagHub Operations Hub

Documentação centralizada de segurança do sistema FlagHub.

---

## Estrutura desta pasta

```
docs/security/
├── README.md                          ← este índice
├── PLANO_REMEDIACAO_SEGURANCA.md     ← plano mestre de correção + testes
└── pentest/
    ├── PENTEST_REPORT_1_2026-04-21.md  ← Relatório #1 (análise estática + validação prod)
    ├── PENTEST_REPORT_2_2026-04-21.md  ← Relatório #2 (sessão live Supabase CLI)
    └── PENTEST_REPORT_3_2026-04-21.md  ← Relatório #3 (DAST ao vivo + unapproved user)
```

---

## Estado dos Controles de Segurança

> **Última atualização: 21/04/2026.**
> Todas as correções foram aplicadas no código e migrations criados.
> Aguarda deploy em produção para que as migrations sejam executadas.

### Controles já implementados (não requerem ação)

| Controle | Evidência |
|----------|-----------|
| ✅ RLS habilitada em 100% das tabelas | `relrowsecurity=true` confirmado |
| ✅ Azure AD SSO ativo | `AuthContext.tsx` — `signInWithOAuth({provider:"azure"})` |
| ✅ Rate limiting com persistência em banco | Tabela `login_attempts`; Edge Function `auth-rate-limit` |
| ✅ MFA com TOTP para auth local | `MfaEnroll.tsx`, `MfaVerify.tsx`, `ProtectedRoute` |
| ✅ Views KPI com `security_invoker=on` | Migration `20260312145739` |
| ✅ `search_path` fixado em SECURITY DEFINER | 100% das funções — confirmado Relatório #2 |
| ✅ `service_role` nunca no frontend | `grep -R SERVICE_ROLE src/` → 0 resultados |

### Vulnerabilidades corrigidas nesta sessão (aguardando deploy)

| ID | Severidade | Descrição | Correção aplicada |
|----|:----------:|-----------|:-----------------:|
| CRÍTICO-2 | 🔴 | CORS wildcard em todas as Edge Functions | ✅ `_shared/cors.ts` + origin allowlist em 15 funções |
| CRÍTICO-1 | 🔴 | MFA bypass via `mfa_exempt` self-update | ✅ Migration `20260421180000` — trigger `protect_mfa_exempt_trigger` |
| CRÍTICO-3 | 🔴 | Unapproved user lê 20+ tabelas com PII LGPD | ✅ Migration `20260421180000` — 37 policies com `hub_is_approved()` |
| CRÍTICO-4 | 🔴 | Auto-aprovação via INSERT status='approved' | ✅ Migration `20260421180000` — policy hub_access_requests corrigida |
| CRIT-01 | 🔴 | RPC `delete_tickets_by_network` sem is_admin() | ✅ Migration `20260428000001` + REVOKE anon |
| CRIT-02 | 🔴 | RPC `purge_cs_implantacoes` sem is_admin() | ✅ Migration `20260428000001` + REVOKE anon |
| CRIT-03 | 🔴 | RPC `purge_old_inactive_tickets` sem is_admin() | ✅ Migration `20260428000001` + REVOKE anon |
| ALTO-1 | 🟠 | Signup não desabilitado server-side | ✅ `AuthContext.tsx` — `signUp()` retorna erro 403 imediato |
| ALTO-2 | 🟠 | 52 funções executáveis por `anon` | ✅ Migration `20260428000002` — REVOKE dinâmico com whitelist de 4 |
| ALTO-3 | 🟠 | Senha transmitida ao Edge Function auth-rate-limit | ✅ `Login.tsx` — fluxo 3 passos; senha só vai ao Supabase Auth direto |
| ALTO-4 | 🟠 | Security headers ausentes no deployment | ✅ `netlify.toml` + `vercel.json` — X-Frame-Options, HSTS, CSP, etc. |
| MÉDIO-1 | 🟡 | Anon key hardcoded em `client.ts` | ✅ Variável de ambiente com fallback dev-only documentado |
| MÉDIO-2 | 🟡 | Open redirect pós-login sem validação | ✅ `Login.tsx` — `rawFrom` validado contra regex de path interno |
| MÉDIO-3 | 🟡 | Policy INSERT `public` em `import_events` | ✅ Migration `20260428000003` — `TO authenticated` + REVOKE anon |

### Itens pendentes de ação humana (não automatizáveis via código)

| ID | Severidade | Ação necessária |
|----|:----------:|----------------|
| ALTO-5 | 🟠 | MFA ausente para usuários Azure SSO — decisão arquitetural (impacto UX) |
| — | 🟠 | Desabilitar signup no **Supabase Dashboard** → Authentication → Settings → "Allow new users to sign up" = OFF |
| INFO-2 | 🟢 | Remover `console.log` com dados de auth em modo produção |

### Itens aceitos (não-vulnerabilidades confirmadas)

| Item | Realidade verificada |
|------|---------------------|
| ~~Rate limiting em memória (volátil)~~ | **Já usa banco de dados** — tabela `login_attempts` |
| ~~Views sem security_invoker~~ | **Já implementado** — migration `20260312145739` |
| ~~Signup desabilitado no servidor~~ | **Desabilitado no frontend** — Supabase dashboard requer ação manual |
| INFO-1 | Auth settings expostos via API — comportamento padrão do Supabase, aceito |

---

## Migrations de Segurança Criadas

| Arquivo | O que resolve | Status |
|---------|--------------|--------|
| `supabase/migrations/20260421180000_security_approved_users_rls.sql` | CRÍTICO-1, CRÍTICO-3, CRÍTICO-4 | ⏳ Aguarda deploy |
| `supabase/migrations/20260428000001_harden_destructive_rpcs.sql` | CRIT-01, CRIT-02, CRIT-03 | ⏳ Aguarda deploy |
| `supabase/migrations/20260428000002_revoke_anon_execute.sql` | ALTO-2 | ⏳ Aguarda deploy |
| `supabase/migrations/20260428000003_fix_import_events_policy.sql` | MÉDIO-3 | ⏳ Aguarda deploy |

---

## Como fazer o deploy das correções

### 1. Aplicar migrations no Supabase

```bash
# Via Supabase CLI (recomendado para produção)
supabase db push --linked

# Ou via Dashboard → SQL Editor → cole o conteúdo de cada migration em ordem
```

### 2. Fazer deploy das Edge Functions

```bash
# Todas as funções foram atualizadas com CORS seguro
supabase functions deploy --no-verify-jwt

# Ou individualmente:
supabase functions deploy auth-rate-limit
supabase functions deploy consultar-vdesk
# ... (demais funções)
```

### 3. Desabilitar signup no Dashboard

Acesse: **Supabase Dashboard → Authentication → Settings**
Desabilite: **"Allow new users to sign up"**

### 4. Validar após deploy

```sql
-- Confirmar que anon não executa funções (deve retornar apenas as 4 whitelistadas)
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY p.proname;

-- Confirmar guards nas RPCs destrutivas
SELECT proname, prosrc
FROM pg_proc
WHERE proname IN ('delete_tickets_by_network', 'purge_cs_implantacoes', 'purge_old_inactive_tickets')
  AND pronamespace = 'public'::regnamespace;
```

---

## Próxima Revisão

**Recomendado:** 21/05/2026 — após deploy das migrations e verificação em produção.

Ver [PLANO_REMEDIACAO_SEGURANCA.md](./PLANO_REMEDIACAO_SEGURANCA.md) para o roteiro completo.
