
# FlagHub Evolution - Dev Level Plan (VS Code + Lovable)

Last update: 2026-03-23

## Purpose
Este arquivo e o plano de execucao de desenvolvimento para seguranca, desempenho e cleanup.
Ele deve refletir o estado real implementado e reduzir drift entre VS Code e Lovable.

## Premises
- Backend nunca confia no frontend para autenticacao, autorizacao ou escopo de dados.
- Supabase URL e anon/publishable key sao publicos por design.
- Plataforma deve suportar 12 acessos simultaneos com estabilidade em login/refresh/KPI load.
- Kiosk usa conta dedicada read-only, sem privilegio administrativo.

## Security Validation Snapshot (DEV)
Status: in progress

Eliminado em DEV:
- Integration Credentials Exposure: select de hub_integrations restrito para admin em migration dedicada de DEV.
- Cron Secret RPC Exposure: get_cron_secret com guard admin server-side.
- Sync Functions Without Role Check: verificacao de role admin adicionada nas 6 funcoes de sync, mantendo fluxo cron por x-cron-secret.

Pendente no codigo:
- Trust boundary de manual upload ainda aberto: manual-upload-parse e manual-upload-publish usam service role apos validar apenas autenticacao.

Pendente fora de codigo:
- Configuracoes de plataforma Supabase e supply chain continuam no plano de hardening operacional.

## Execution Lanes

### Lane A - Security Refactors (Priority P0)
Objective:
- Corrigir trust boundary e fechar vetores de abuso em funcoes/rotas sensiveis.

Scope:
- Padronizar validacao server-side em Edge Functions que usam service role.
- Aplicar padrao de validacao privilegiada (jwt valido + role/escopo no backend).
- Restringir CORS para origens permitidas.
- Reduzir exposicao de logs sensiveis e tokens proprios.

Current status: in progress

Definition of done:
- Nenhuma acao administrativa e executada com base apenas em validacao de frontend.
- Chamadas diretas sem role adequada retornam 403.
- CORS wildcard removido de funcoes criticas.

### Lane B - Performance Refactors (Priority P1)
Objective:
- Reduzir latencia de login/hydration e eliminar cascata de queries em KPIs.

Scope:
- Otimizar Auth hydration e prefetch controlado.
- Deduplicar queries base/scoped em dashboards.
- Paralelizar chunking sequencial em cargas de KPI.
- Reduzir invalidacoes globais e adotar refresh mais previsivel.
- Implementar lazy load em tabs nao ativas.

Current status: planned

Definition of done:
- Queda mensuravel no tempo de primeira renderizacao de KPI apos login.
- Reducao de round-trips e de invalidacoes em cascata.
- Comportamento funcional preservado nos setores.

### Lane C - Legacy/Cleanup Refactors (Priority P1/P2)
Objective:
- Diminuir custo de manutencao e risco de regressao por codigo duplicado/obsoleto.

Scope:
- Consolidar gradualmente duplicacoes entre raiz e flaghub/.
- Isolar mock/demo por feature flag explicita.
- Reduzir logs verbosos e remover caminhos deprecados.

Current status: planned

Definition of done:
- Menor area duplicada com sincronia controlada.
- Nenhum fallback de demo ativo em producao sem flag.
- Cleanup sem quebra de contrato funcional.

## Milestones

### Milestone 0 - Baseline and Safe Rollout
Status: in progress

- Definir baseline de login, MFA, hydration e carga inicial de KPIs.
- Definir metricas alvo e monitoracao minima por feature.
- Garantir rollout seguro com flags e reversao rapida.

### Milestone 1 - Security First
Status: in progress

- Confirmar fechamento das 3 correcoes de DEV em todos os trees.
- Corrigir trust boundary de manual upload.
- Revisar headers de seguranca em deploy.

### Milestone 2 - Performance Core
Status: planned

- Priorizar otimizacao de query path em Auth e KPIs.
- Reduzir custo de refresh e rajadas desnecessarias no banco/views.
- Validar capacidade para 12 sessoes concorrentes.

### Milestone 3 - Cleanup and Consolidation
Status: planned

- Limpeza de legado apos correcoes P0/P1.
- Consolidacao estrutural sem misturar com hotfix critico.

## Risks and Mitigations
- Risk: regressao funcional por refatoracao extensa.
  Mitigation: diffs pequenos, flags e testes de regressao por fluxo critico.
- Risk: drift entre raiz e flaghub/.
  Mitigation: alterar em ambos os trees ate consolidacao final.
- Risk: otimizar desempenho sem medir.
  Mitigation: baseline antes/depois para cada mudanca relevante.

## Verification Gates
1. Gate Security:
   - Teste de chamada direta ao backend sem role correta deve falhar.
2. Gate Performance:
   - Medicao comparativa de login/hydration/first-kpi-load com 12 sessoes.
3. Gate Functional:
   - Rotas, MFA e dashboards sem regressao de comportamento.
4. Gate Cleanup:
   - Remocoes de legado sem quebrar fluxo produtivo.

## Synchronization Rule (VS Code + Lovable)
Quando alterar arquitetura, authz, KPI load ou cleanup:

1. Atualizar este arquivo na mesma PR/commit.
2. Atualizar docs operacionais impactados em docs/.
3. Registrar status por lane/milestone: done, in progress, planned, postponed.

Isso evita drift entre o planejado e o implementado.

