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

## Resumo Consolidado de Vulnerabilidades

| ID | Severidade | Descrição | Relatório | Status |
|----|:----------:|-----------|:---------:|:------:|
| CRÍTICO-1 | 🔴 | MFA bypass via `mfa_exempt` self-update | #3 | 🔧 Migration criada |
| CRÍTICO-2 | 🔴 | CORS wildcard em todas as Edge Functions | #3 | ⏳ Pendente |
| CRÍTICO-3 | 🔴 | Unapproved user lê 20+ tabelas (LGPD) | #3 | 🔧 Migration criada |
| CRÍTICO-4 | 🔴 | Auto-aprovação via INSERT status='approved' | #3 | 🔧 Migration criada |
| CRIT-01 | 🔴 | RPC `delete_tickets_by_network` sem auth | #2 | ⏳ Pendente |
| CRIT-02 | 🔴 | RPC `purge_cs_implantacoes` sem auth | #2 | ⏳ Pendente |
| CRIT-03 | 🔴 | RPC `purge_old_inactive_tickets` sem auth | #2 | ⏳ Pendente |
| VULN-01 | 🔴 | Anon key + URL hardcoded no client.ts | #1 | ⏳ Pendente |
| ALTO-1 | 🟠 | Rate limiting em memória (volátil) | #3 | ⏳ Pendente |
| ALTO-01 | 🟠 | Views sem `security_invoker=true` | #2 | ⏳ Pendente |
| ALTO-02 | 🟠 | 52 funções executáveis por `anon` | #2 | ⏳ Pendente |
| ALTO-03 | 🟠 | INSERT `import_events` com role `public` | #2 | ⏳ Pendente |
| ALTO-2 | 🟠 | HTTP fallback VDESK proxy | #3 | ⏳ Pendente |
| ALTO-3 | 🟠 | Security headers ausentes | #3 | ⏳ Pendente |
| VULN-02 | 🟠 | Security headers ausentes (deployment) | #1 | ⏳ Pendente |
| VULN-03 | 🟠 | IP spoofing no rate limit (X-Forwarded-For) | #1 | ⏳ Pendente |
| VULN-04 | 🟠 | Senha transmitida ao Edge Function | #1 | ⏳ Pendente |
| VULN-05 | 🟡 | 37 políticas `USING (true)` sem filtro área | #1 | 🔧 Migration criada |
| VULN-06 | 🟡 | Policy INSERT `public` em import_events | #1 | ⏳ Pendente |
| VULN-07 | 🟡 | Open redirect pós-login sem validação | #1 | ⏳ Pendente |

---

## Migrations de Segurança Criadas

| Arquivo | O que resolve |
|---------|--------------|
| `supabase/migrations/20260421180000_security_approved_users_rls.sql` | CRÍTICO-1, CRÍTICO-3, CRÍTICO-4, VULN-05 |

---

## Próxima Revisão

**Recomendado:** 21/05/2026 — após aplicação das correções da Fase 1 e Fase 2.

Ver [PLANO_REMEDIACAO_SEGURANCA.md](./PLANO_REMEDIACAO_SEGURANCA.md) para o roteiro completo.
