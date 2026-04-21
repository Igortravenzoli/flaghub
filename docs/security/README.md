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

> **Auditoria realizada em 21/04/2026 diretamente no código-fonte.** Nenhuma correção foi aplicada em produção até esta data. Os relatórios #1 e #2 marcaram incorretamente alguns controles como "resolvidos" — o estado real foi verificado manualmente.

### Controles já implementados (não requerem ação)

| Controle | Evidência |
|----------|-----------|
| ✅ RLS habilitada em 100% das tabelas | `relrowsecurity=true` confirmado |
| ✅ Azure AD SSO ativo | `AuthContext.tsx:606` — `signInWithOAuth({provider:"azure"})` |
| ✅ Rate limiting com persistência em banco | Tabela `login_attempts`; Edge Function `auth-rate-limit` |
| ✅ MFA com TOTP para auth local | `MfaEnroll.tsx`, `MfaVerify.tsx`, `ProtectedRoute` |
| ✅ Views KPI com `security_invoker=on` | Migration `20260312145739` |
| ✅ `search_path` fixado em SECURITY DEFINER | 100% das funções — confirmado Relatório #2 |
| ✅ `service_role` nunca no frontend | `grep -R SERVICE_ROLE src/` → 0 resultados |

### Vulnerabilidades abertas (nenhuma corrigida em produção)

| ID | Severidade | Descrição | Fonte | Status |
|----|:----------:|-----------|:-----:|:------:|
| CRÍTICO-1 | 🔴 | MFA bypass via `mfa_exempt` self-update | #3 | 🔧 Migration pronta, aguarda deploy |
| CRÍTICO-2 | 🔴 | CORS wildcard em todas as Edge Functions | #3 | ⏳ Pendente |
| CRÍTICO-3 | 🔴 | Unapproved user lê 20+ tabelas com PII LGPD | #3 | 🔧 Migration pronta, aguarda deploy |
| CRÍTICO-4 | 🔴 | Auto-aprovação via INSERT status='approved' | #3 | 🔧 Migration pronta, aguarda deploy |
| CRIT-01 | 🔴 | RPC `delete_tickets_by_network` sem is_admin() | #2 | ⏳ Pendente |
| CRIT-02 | 🔴 | RPC `purge_cs_implantacoes` sem is_admin() | #2 | ⏳ Pendente |
| CRIT-03 | 🔴 | RPC `purge_old_inactive_tickets` sem is_admin() | #2 | ⏳ Pendente |
| ALTO-1 | 🟠 | Signup não desabilitado server-side | #3 | ⏳ Pendente |
| ALTO-2 | 🟠 | 52 funções executáveis por `anon` | #2 | ⏳ Pendente |
| ALTO-3 | 🟠 | Senha transmitida ao Edge Function auth-rate-limit | #1 | ⏳ Pendente |
| ALTO-4 | 🟠 | Security headers ausentes no deployment | #1/#3 | ⏳ Pendente |
| ALTO-5 | 🟠 | MFA ausente para usuários Azure SSO | #3 | ⏳ Decisão arquitetural |
| MÉDIO-1 | 🟡 | Anon key hardcoded em `client.ts` | #1 | ⏳ Pendente |
| MÉDIO-2 | 🟡 | Open redirect pós-login sem validação | #1 | ⏳ Pendente |
| MÉDIO-3 | 🟡 | Policy INSERT `public` em `import_events` | #1/#2 | ⏳ Pendente |
| INFO-1 | 🟢 | Auth settings expostos publicamente | #3 | ✔️ Aceitar — comportamento Supabase |
| INFO-2 | 🟢 | `console.log` com dados de auth em produção | #1 | ⏳ Pendente |

### Itens removidos da lista (confirmados como não-vulnerabilidades)

| Item (afirmado em relatório anterior) | Realidade verificada |
|--------------------------------------|---------------------|
| ~~Rate limiting em memória (volátil)~~ | **Já usa banco de dados** — tabela `login_attempts` com `locked_until` |
| ~~Views sem security_invoker~~ | **Já implementado** — migration `20260312145739` aplica `security_invoker=on` nas views KPI |
| ~~Signup desabilitado (✅ Resolvido)~~ | **NÃO está desabilitado** — `signUp()` existe em `AuthContext.tsx:575` |

---

## Migrations de Segurança Criadas

| Arquivo | O que resolve |
|---------|--------------|
| `supabase/migrations/20260421180000_security_approved_users_rls.sql` | CRÍTICO-1, CRÍTICO-3, CRÍTICO-4, VULN-05 |

---

## Próxima Revisão

**Recomendado:** 21/05/2026 — após aplicação das correções da Fase 1 e Fase 2.

Ver [PLANO_REMEDIACAO_SEGURANCA.md](./PLANO_REMEDIACAO_SEGURANCA.md) para o roteiro completo.
