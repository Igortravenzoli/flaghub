# Plano DevOps — Nivelamento DEV/PROD, CI/CD, Qualidade, Segurança e Backup

| Campo | Valor |
|-------|-------|
| **Data** | 12/06/2026 |
| **Status** | 📋 Plano aprovado para execução em fases |
| **Referência de esteira existente** | Pipeline GitHub do cenário Flavia Baroni (único pipeline ativo hoje — usar como base/inspiração) |
| **Docs relacionados** | `docs/GIT_RELEASE_PLAYBOOK.md`, `docs/security/PLANO_REMEDIACAO_SEGURANCA.md`, `supabase/SETUP_DEV_DATABASE.md` |

---

## Estado atual (verificado em 12/06/2026)

| Item | Situação |
|------|----------|
| CI/CD GitHub | ❌ Inexistente — `.github/workflows/` não existe |
| Validação de release | Manual (`npm ci ; npm run build ; npm test` antes de promover `dev` → `main`) |
| Testes | ✅ 10 suítes vitest em `src/test/` |
| Lint | ✅ ESLint 9 configurado (`npm run lint`) |
| Typecheck dedicado | ❌ Sem script `tsc --noEmit` no `package.json` |
| Deploy front | Vercel (preview em `dev`, produção em `main`); `netlify.toml` legado ainda no repo |
| Banco | Supabase SaaS — projetos separados PROD e DEV (`config.prod.toml` / `config.dev.toml`) |
| Migrations | ~100 arquivos em `supabase/migrations/`; aplicação em PROD é manual |
| Edge Functions | 20+ em `supabase/functions/`; deploy manual via CLI |
| Segurança | Plano de remediação com CRÍTICOS pendentes (CORS wildcard, RPCs sem auth, policies `USING (true)`) |
| Backup PROD | ❌ Nenhuma rotina própria além do backup nativo do Supabase |
| `.gitignore` | ✅ Robusto (`.env*` ignorado, exemplos versionados) |

---

## FASE 0 — Higiene GitHub (1 dia, sem código)

Configurações no repositório/organização — nenhum deploy envolvido, zero risco:

1. **Secret Scanning + Push Protection**: Settings → Code security and analysis → ativar ambos. Push Protection bloqueia segredo *antes* de entrar no histórico.
2. **Dependabot**: ativar *alerts* + *security updates*. Adicionar `.github/dependabot.yml` para atualizações semanais de `npm` e `github-actions`.
3. **Branch Protection em `main`**: exigir PR antes do merge, exigir status checks verdes (os workflows da Fase 1), bloquear force-push. Em `dev`: exigir status checks (PR opcional para manter agilidade).
4. **MFA obrigatório** na organização GitHub.
5. **Varredura retroativa de segredos**: rodar `gitleaks detect` no histórico completo uma vez. Se encontrar credencial real → rotacionar a chave (apagar do código não basta, o histórico preserva).
6. Remover `payload.json` e `query.sql` da raiz se contiverem dados reais (avaliar antes).

---

## FASE 1 — CI básico: bloquear regressão (2–3 dias)

Workflow `.github/workflows/ci.yml` rodando em PR e push para `dev` e `main`:

```
jobs:
  quality:
    - bun install --frozen-lockfile   (repo usa bun.lock)
    - lint        → npm run lint
    - typecheck   → npx tsc --noEmit   (adicionar script "typecheck" ao package.json)
    - test        → npm run test
    - build       → npm run build
```

- Esses 4 checks viram **required status checks** na branch protection da Fase 0.
- Cache de dependências para manter o pipeline < 3 min.
- A partir daqui, o passo 2 do `GIT_RELEASE_PLAYBOOK.md` ("Validar release antes de promover") fica automático.

**Critério de pronto:** PR com teste quebrado não consegue mergear em `main`.

---

## FASE 2 — Segurança na esteira (3–5 dias)

Camadas adicionais no CI (workflows separados para não travar o ciclo rápido da Fase 1):

1. **SAST — CodeQL** (`github/codeql-action`): análise de JS/TS em PR + agendado semanal. Gratuito em repos com GitHub Advanced Security ou público; alternativa: **Semgrep CI** com regras `p/react`, `p/typescript`, `p/supabase`.
2. **Secrets — Gitleaks** como step de PR (além do Push Protection da Fase 0, cobre padrões customizados: chaves vdesk, tokens DevOps/SharePoint).
3. **Dependências — `bun audit` / `npm audit --audit-level=high`** como check informativo (não bloqueante no início, bloqueante após zerar o passivo).
4. **Headers/CSP**: validar paridade entre `netlify.toml` e a config Vercel (hoje os security headers estão só no netlify.toml; ver ALTO-4 do plano de remediação). Decidir: se o deploy é Vercel, migrar headers para `vercel.json` e remover `netlify.toml`.
5. **Amarrar com o plano de remediação**: os CRÍTICOS do `PLANO_REMEDIACAO_SEGURANCA.md` (CORS wildcard, RPCs sem auth, policies `USING (true)`) entram como issues rastreadas — a esteira impede *novas* falhas, mas o passivo existente precisa ser pago.

**Segredos no pipeline:** tudo via GitHub Actions Secrets (`${{ secrets.* }}`) — `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL_PROD`, `SUPABASE_PROJECT_REF_DEV/PROD`. Nunca em YAML ou código.

---

## FASE 3 — Qualidade de queries e banco (1 semana, paralelo à Fase 2)

1. **Lint de migrations no CI**: job que sobe Postgres efêmero (`supabase db start` no runner) e aplica todas as migrations do zero — pega migration quebrada/fora de ordem antes do merge.
2. **`supabase db lint`** (usa plpgsql_check): valida funções e RPCs.
3. **Testes de integridade SQL** (Fase 4 do plano de remediação): suíte pgTAP ou script SQL que verifica invariantes — RLS habilitada em toda tabela nova, nenhuma policy `USING (true)` nova, `search_path` fixado em SECURITY DEFINER, nenhuma função executável por `anon` sem allowlist. Roda no CI contra o banco efêmero.
4. **Performance — Supabase Advisors + pg_stat_statements**:
   - Habilitar/consultar `pg_stat_statements` em PROD; revisão mensal das top-10 queries por tempo total.
   - Rodar os **Performance Advisors** do dashboard Supabase (índices ausentes, RLS initplan, políticas duplicadas) e converter achados em migrations.
   - Padrão de revisão: toda RPC nova com `EXPLAIN (ANALYZE, BUFFERS)` no PR quando tocar tabela > 100k linhas (helpdesk_tickets, timelogs).
5. **Convenção de migrations**: nomes descritivos (`yyyymmddhhmmss_descricao.sql`) em vez de UUIDs do Lovable, daqui pra frente.

---

## FASE 4 — Nivelamento DEV ↔ PROD (1 semana)

Objetivo: DEV ser uma réplica fiel de PROD em **schema, functions e config** (dados via backup — ver Fase 6).

1. **Schema**: `supabase db diff --linked` entre DEV e PROD → gerar migration de reconciliação para o que divergiu (migrations aplicadas só num lado, hotfixes manuais em PROD).
2. **Edge Functions**: deploy das 20+ functions em DEV na mesma versão de PROD; secrets equivalentes (`supabase secrets list` nos dois e nivelar chaves — valores podem diferir, as *chaves* não).
3. **Config Auth/API**: comparar `config.dev.toml` vs `config.prod.toml` e documentar divergências intencionais (ex.: `disable_signup`, rate limits). O que não for intencional, nivelar.
4. **Frontend**: garantir `.env` DEV apontando para o projeto DEV; preview Vercel da branch `dev` usando env vars de DEV (hoje o risco é preview apontando para PROD).
5. **Automatizar a manutenção do nivelamento (CD)** — workflow `deploy.yml`:
   - push em `dev` → `supabase db push` + `functions deploy` no projeto **DEV** (Vercel já cuida do front);
   - push em `main` → mesmo fluxo no projeto **PROD**, com *environment protection rule* exigindo aprovação manual (substitui o processo manual atual descrito no playbook).

**Critério de pronto:** `supabase db diff` entre DEV e PROD retorna vazio; deploy em PROD acontece só via esteira.

---

## FASE 5 — Backup da base PROD (2–3 dias, pode começar imediatamente)

Agora que há dados históricos (helpdesk, timelogs, comercial, sprints), backup próprio é obrigatório — o backup nativo do Supabase fica preso à plataforma e não cobre exclusão lógica/acidental com retenção controlada.

1. **Camada 1 — nativo**: confirmar plano do projeto PROD; se Pro, backups diários já existem. Avaliar **PITR** (point-in-time recovery) se o RPO desejado for < 24h.
2. **Camada 2 — dump lógico próprio** (workflow `backup.yml`, cron diário ~03:00 BRT):
   ```
   supabase db dump --db-url $SUPABASE_DB_URL_PROD -f roles.sql --role-only
   supabase db dump --db-url $SUPABASE_DB_URL_PROD -f schema.sql
   supabase db dump --db-url $SUPABASE_DB_URL_PROD -f data.sql --data-only --use-copy
   ```
   - Comprimir + **criptografar** (age/gpg com chave em Actions Secret) → enviar para storage privado fora do Supabase (S3/Azure Blob/SharePoint corporativo).
   - **Retenção**: 7 diários, 4 semanais, 12 mensais (GFS). Job de expurgo no mesmo workflow.
   - Alerta em falha (notificação do próprio Actions ou webhook Teams).
3. **Camada 3 — teste de restore mensal**: restaurar o dump mais recente no projeto **DEV** (cron mensal ou manual). Isso valida o backup **e** entrega o nivelamento de *dados* DEV↔PROD da Fase 4 de graça. Backup que nunca foi restaurado não é backup.
4. **Documentar RPO/RTO**: alvo inicial RPO 24h / RTO 4h; revisar após o primeiro restore cronometrado.

---

## Ordem de execução e dependências

```
FASE 0 (higiene GitHub)        → imediato, 1 dia
FASE 1 (CI básico)             → depende da 0 (branch protection usa os checks)
FASE 5 (backup PROD)           → independente, pode rodar em paralelo com a 1
FASE 2 (segurança na esteira)  → depois da 1
FASE 3 (qualidade banco)       → paralelo à 2
FASE 4 (nivelamento + CD)      → por último (CD pressupõe CI confiável e DEV nivelado)
```

## Riscos e observações

- **Lovable aplica migrations direto no DEV** (playbook §"Modelo operacional"): o CD da Fase 4 precisa conviver com isso — `db push` é idempotente, mas conflitos de histórico de migration podem exigir `migration repair`. Tratar na implementação.
- **`netlify.toml` vs Vercel**: há config de dois provedores no repo. Antes da Fase 2 item 4, confirmar qual é o deploy oficial e remover o legado.
- **Dump lógico em base grande**: se `data.sql` passar de ~1–2 GB, migrar o backup para um runner self-hosted ou usar `pg_dump -Fc` direto (formato custom, mais rápido para restore seletivo).
- **Pipeline Flavia Baroni**: revisar o YAML existente desse cenário e aproveitar steps/secrets já validados como ponto de partida da Fase 1.
