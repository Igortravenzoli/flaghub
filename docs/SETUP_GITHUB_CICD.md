# Setup GitHub CI/CD — Passos manuais (uma vez)

Os workflows em `.github/workflows/` (ci, security, migrate-dev, migrate-prod) já estão no repo.
Para ativá-los por completo, faça as configurações abaixo no GitHub (`Igortravenzoli/flaghub`).

## 1. Secrets (Settings → Secrets and variables → Actions)

### Environment `dev` (Settings → Environments → New environment: `dev`)
| Secret | Onde obter |
|--------|-----------|
| `SUPABASE_DEV_PROJECT_REF` | Dashboard Supabase do projeto DEV → Settings → General → Reference ID |
| `SUPABASE_DEV_DB_PASSWORD` | Senha do banco do projeto DEV |

### Environment `prod` (New environment: `prod`)
| Secret | Onde obter |
|--------|-----------|
| `SUPABASE_PROD_PROJECT_REF` | Dashboard Supabase do projeto PROD → Settings → General → Reference ID |
| `SUPABASE_PROD_DB_PASSWORD` | Senha do banco do projeto PROD |

No environment `prod`, ative **Required reviewers** (você mesmo) — assim toda migration
em PROD exige aprovação explícita além do `yes-prod` digitado.

### Repository secret (vale para os dois)
| Secret | Onde obter |
|--------|-----------|
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens → Generate new token |

## 2. Code security (Settings → Code security and analysis)

- ✅ **Secret scanning** + **Push protection** (bloqueia segredo antes de entrar no histórico)
- ✅ **Dependabot alerts** + **Dependabot security updates** (o `.github/dependabot.yml` já cobre as atualizações semanais)

## 3. Branch protection (Settings → Branches → Add rule)

### Branch `main`
- ✅ Require a pull request before merging
- ✅ Require status checks to pass:
  - `Lint + Typecheck + Test + Build` (workflow CI)
  - `Secret scanning (gitleaks)` (workflow Security)
  - `Migrations do zero (Postgres efêmero)` (workflow Security)
- ✅ Block force pushes

### Branch `dev`
- ✅ Require status checks (os mesmos), sem exigir PR — mantém agilidade.

## 4. MFA

Settings da conta GitHub → Password and authentication → Two-factor authentication.

## Fluxo resultante

```
push em dev ──► CI + Security rodam ──► migrate-dev aplica migrations no DEV (se houver)
                                   └──► Vercel faz preview deploy
PR dev → main ──► CI + Security como required checks ──► merge só se verde
push em main ──► Vercel faz production deploy
migrations PROD ──► manual: Actions → "Migration — PROD" → confirm "yes-prod" + aprovação
```

## Observações

- O job `audit` (bun audit) é **informativo** (`continue-on-error: true`) até zerarmos o
  passivo de vulnerabilidades; depois, remover essa linha para torná-lo bloqueante.
- `@typescript-eslint/no-explicit-any` está como *warning* (≈360 ocorrências legadas) —
  não introduzir novos `any`; reduzir gradualmente.
- Os testes pgTAP de RLS (Fase 3 do plano) entram depois no job `db-migrations`
  via `supabase test db`.
- Plano completo: `docs/PLANO_DEVOPS_CICD_BACKUP.md`.
