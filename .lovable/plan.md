
# FlagHub Evolution — Living Plan (VS Code + Lovable)

Last update: 2026-03-16

## Purpose
Este arquivo e a referencia de roadmap para times que alternam entre VS Code e Lovable.
Quando houver divergencia, este arquivo deve refletir o estado real implementado.

## Current Delivery Status

### Phase 1 — Contencao de custo/performance (Backend)
Status: done

- Retencao automatica implementada para snapshots/raw ingestions
- `devops-sync-all` com processamento incremental para iteration history e QA retorno
- `devops-sync-query` com snapshot incremental (upsert + cleanup)

### Phase 2 — Separacao KPI Oficial x Visao Operacional
Status: done

- Comercial: abas separadas (KPI Oficial / Visao Operacional)
- Fabrica: abas operacionais (Backlog para Priorizar e Fila UX-UI)
- Hook comum para filas operacionais (`useDevopsOperationalQueue`)

### Phase 3 — Sprint como filtro primario
Status: done

- Sprint primario + data drill-down em Fabrica, Qualidade, Infraestrutura e customer_service
- Hook centralizado de sprint (`useSprintFilter`)

### Phase 4 — Saneamento de metricas
Status: in progress (major items done)

Done now:
- Regra anti-dupla-contagem Task/PBI via `count_in_kpi` em `vw_fabrica_kpis`
- Harden de dedup de timelog com `ext_entry_id` + unique partial index
- Tabela de normalizacao de colaborador (`devops_collaborator_map`)
- Home otimizada para nao disparar carga pesada de `devops_time_logs` fora do dashboard de Fabrica

Remaining:
- Atualizar tipos gerados do Supabase para incluir novas tabelas/colunas
- Popular `devops_collaborator_map` com aliases reais
- Validar reconciliacao por sprint entre KPI oficial e operacao

## Next Phases

### Phase 5 — Correcoes funcionais e consistencia visual
- Finalizar ajustes de calculo/denominador nos KPIs remanescentes
- Validar cenarios de periodo (dia/mes/ano/custom) por setor

### Phase 6 — Campos custom DevOps (Cliente/SistemaProduto)
Status: postponed

- Entrar apenas com aprovacao funcional

## Synchronization Rule (VS Code + Lovable)

Quando alterar arquitetura, filtros, ou formulas de KPI:

1. Atualizar este arquivo na mesma PR/commit
2. Atualizar docs operacionais impactados em `docs/`
3. Registrar fases alteradas com status: `done`, `in progress`, `postponed`

Isso evita drift entre o que foi planejado no Lovable e o que foi implementado no VS Code.

