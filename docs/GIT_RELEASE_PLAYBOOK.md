# Playbook de Release: DEV -> MAIN (Vercel + Supabase SaaS)

## Objetivo
Padronizar a promoção de código de `dev` para `main`, garantindo:
- build/deploy no Vercel sem regressão;
- controle de migrations Supabase no fluxo SaaS adotado pelo time;
- sincronização final de branches para evitar conflitos recorrentes.

## Modelo operacional oficial
- `dev`: branch de integração (fonte de verdade para evolução funcional).
- `main`: branch de release/produção.
- Supabase SaaS DEV: migrations aplicadas pelo Lovable.
- Supabase SaaS PROD: aplicação manual (com remoção/ajuste do rastreio da last migration, conforme processo interno).

## Pré-requisitos
- Working tree limpa (`git status`).
- Acesso ao remoto `origin`.
- Dependências instaladas.
- Variáveis de ambiente corretas para build.

## Procedimento padrão (sempre nesta ordem)

### 1) Atualizar e corrigir `dev`
```bash
git fetch origin
git checkout dev
git pull --rebase origin dev
```

Se houver conflitos durante o rebase:
```bash
git status
# resolver arquivos conflitantes (priorizar conteúdo de dev)
git add .
git rebase --continue
```

Ao finalizar:
```bash
git push origin dev
```

### 2) Validar release antes de promover
```powershell
npm ci ; npm run build ; npm test
```

Se os testes não forem mandatórios no momento, ao menos o `npm run build` deve passar para seguir com deploy no Vercel.

### 3) Promover `dev` para `main`
```bash
git checkout main
git pull --ff-only origin main
git merge --no-ff dev
```

Se houver conflitos no merge:
```bash
# resolver conflitos (priorizar dev, mantendo hotfix exclusivo de main quando necessário)
git add .
git commit -m "release: merge dev into main"
```

Se não houver conflito, o commit de merge é criado automaticamente.

Publicar:
```bash
git push origin main
```

### 4) Verificação de deploy no Vercel
Checklist mínimo:
- build do Vercel concluído com sucesso;
- aplicação abre sem erro crítico;
- rotas principais e telas críticas respondem;
- nenhuma variável de ambiente faltando.

### 5) Migrations Supabase (modelo DEV/PROD)

#### DEV (SaaS)
- Não aplicar manualmente se o Lovable já aplicou.
- Validar que os arquivos de migration estão versionados no git.

#### PROD (SaaS)
- Aplicação manual de migrations no ambiente PROD.
- Antes de aplicar, executar o procedimento interno de remoção/ajuste do rastreio da `last migration` (quando necessário).
- Registrar evidência operacional: migration aplicada, data/hora, responsável e resultado.

### 6) Pós-release: nivelar branches
```bash
git checkout dev
git fetch origin
git merge origin/main
git push origin dev
```

Este passo evita que `dev` fique atrás de `main` e reduz conflito no próximo ciclo.

## Troubleshooting rápido

### Erro no `git push origin dev` (rejeitado)
Causa comum: branch remota avançou.

Correção:
```bash
git checkout dev
git pull --rebase origin dev
# resolver conflitos se houver
git push origin dev
```

### Conflito recorrente em `.lovable/plan.md`
Esse arquivo é gerenciado pelo Lovable. Em conflito, sempre manter versão de `dev`:
```bash
git checkout --ours .lovable/plan.md
git add .lovable/plan.md
git rebase --continue
# ou
git commit -m "resolve merge: keep dev wording"
```

### Conflitos frequentes em arquivos críticos
- Fazer resolução local com editor (não resolver cegamente no GitHub UI).
- Rodar build/teste imediatamente após resolver.

### Rebase/merge ficou inconsistente
Abortar operação atual e recomeçar:
```bash
git rebase --abort
# ou
git merge --abort
```

### PowerShell: erro ao usar `stash@{0}`
PowerShell interpreta `{}` de forma especial. Use aspas simples:
```bash
git stash show 'stash@{0}' --name-only
git stash pop 'stash@{0}'
```

## Regras de ouro
1. Não rebasear `main`.
2. Sempre atualizar `dev` com `pull --rebase` antes de push.
3. Sempre validar build antes de merge em `main`.
4. Sempre sincronizar `dev` com `origin/main` após release.
5. Em conflito, `dev` é default; exceções devem ser justificadas (hotfix de produção).
6. `.lovable/plan.md` em conflito: sempre manter `--ours` (versão de `dev`).
