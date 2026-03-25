---
name: release-main-supabase-saas
description: Skill operacional para promover dev para main com validação de deploy no Vercel e controle de migrations Supabase SaaS (DEV via Lovable, PROD manual).
version: 1.1.0
owner: time-devops
---

# Skill: Release DEV -> MAIN com Vercel + Supabase SaaS

## Quando usar
Use esta skill sempre que for enviar correções/novas features para `main`.

## Regra de bolso
- `dev` validou, `main` publicou.
- Se o commit está apenas em `dev`, o Vercel ainda está em preview.
- Produção só muda quando o commit entra em `main`.

## Relação Git -> Vercel
| Ação no Git | Resultado no Vercel |
|---|---|
| push na `dev` | Preview deploy |
| push na `main` | Production deploy |
| merge PR -> `main` | Production deploy |
| commit em branch diferente de `main` | Preview deploy |

## Entradas esperadas
- Branch fonte: `dev`
- Branch alvo: `main`
- Ambiente Supabase: SaaS
- Estratégia de migration:
  - DEV: Lovable aplica
  - PROD: aplicação manual com ajuste de rastreio da last migration

## Passos obrigatórios

### PASSO 1 — Sincronizar e estabilizar `dev`
```bash
git fetch origin
git checkout dev
git pull --rebase origin dev
```

Se houver conflito (ex: `.lovable/plan.md`):
```bash
git checkout --ours .lovable/plan.md
git add .lovable/plan.md
git rebase --continue
```

Push:
```bash
git push origin dev
```

Gate: `git status -sb` deve mostrar `## dev...origin/dev` sem ahead/behind.

---

### PASSO 2 — Validar artefato para Vercel
```powershell
npm ci ; npm run build ; npm test
```

Gate de qualidade:
- `npm run build` falhou → **interromper release**
- testes críticos falharam → **interromper release**

---

### PASSO 3 — Promover para `main`
```bash
git checkout main
git pull --ff-only origin main
git merge --no-ff dev
git push origin main
```

Conflitos:
- Resolver localmente priorizando `dev`.
- Manter em `main` apenas hotfix exclusivo de produção, se houver.
- Verificar que não sobraram marcadores:
```bash
git grep -n "<<<<<<\|=======\|>>>>>>>"
```

---

### PASSO 4 — Garantir deploy no Vercel
Checklist:
- [ ] build completou sem erro
- [ ] app acessível na URL de produção
- [ ] rotas críticas funcionam
- [ ] env vars válidas (sem `undefined` em runtime)

Regra operacional:
- `dev` pode estar correta e ainda assim a produção estar atrasada.
- Só considerar release concluída quando `main` estiver atualizada e o deploy de produção do Vercel estiver saudável.

---

### PASSO 5 — Executar disciplina de migrations Supabase

#### DEV (SaaS via Lovable)
- [ ] confirmar migrations versionadas em `supabase/migrations/`
- [ ] Lovable já aplicou no DEV (não aplicar manualmente)

#### PROD (SaaS manual)
1. Identificar migrations novas desde último deploy:
   ```bash
   git diff origin/main HEAD -- supabase/migrations/
   ```
2. Aplicar manualmente no painel Supabase PROD.
3. Executar procedimento interno de remoção/ajuste do rastreio da `last migration` antes da execução quando necessário.
4. Registrar evidência:
   - Migration aplicada (nome do arquivo)
   - Data/hora
   - Responsável
   - Resultado (sucesso/erro)

---

### PASSO 6 — Fechar ciclo e nivelar branches
```bash
git checkout dev
git fetch origin
git merge origin/main
git push origin dev
```

Gate final: `git status -sb` deve mostrar `## dev...origin/dev` sem divergência.

---

## Saída esperada ao final
- `main` atualizado e publicado no GitHub
- deploy Vercel saudável e validado
- migrations em PROD aplicadas com rastreabilidade
- `dev` nivelado com `main`

---

## Referência rápida de conflitos

| Arquivo | Decisão padrão |
|---|---|
| `.lovable/plan.md` | `--ours` (manter dev) |
| Componentes React | resolver manual + build |
| `package.json` | resolver manual (evitar duplicar deps) |
| Arquivos de config | resolver manual conforme ambiente |

---

## Anti-padrões proibidos
- Rebase direto de `main`
- Pular validação de build antes do merge
- Push em `dev` sem `pull --rebase` prévio
- Aplicar migration manual em DEV quando Lovable já é responsável
- Usar `git push --force` em `main`
