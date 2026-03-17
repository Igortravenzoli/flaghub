
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

Status desta rodada (estabilizacao UX/filtros/performance): in progress

Implementado nesta rodada:
- Filtro padrao por setor:
	- Comercial, Customer Service e Helpdesk com dropdown `Periodo` (7d/30d/90d/6m/1a/Todos/Custom)
	- Fabrica, Infraestrutura e Qualidade com foco em `Sprint + Custom` (sem presets diarios como principal)
- Transparencia do filtro com badge de intervalo real (de/ate) no `DashboardFilterBar`
- Calendar custom com bloqueio de datas fora do range permitido (quando min/max informado)
- Correcoes de UX da sprint list (nao colapsa para apenas sprint selecionada apos filtro)
- KPI novo em Qualidade: `Avioes testados`
- Estabilizacao de views Qualidade/Infra via migration para deduplicacao por work_item
- Tooltips de formula/descricao em KPIs (camada transversal via `DashboardKpiCard`)

Implementado na batida seguinte (prioridade solicitada):
- Transbordo por sprint com regra historica coerente:
	- sprint unica: mostra sprint selecionada + historico imediato (mesmo ano)
	- todas as sprints: visao historica ampla
- TimeLog com camada agregada no backend:
	- RPC `rpc_devops_timelog_agg` para reduzir carga de leitura bruta em `devops_time_logs`
	- consumo da Fabrica migrado para agregacao via RPC
- Kiosk simplificado:
	- `DashboardFilterBar` oculta controles interativos de periodo/refresh/export quando em modo kiosk
	- mantem badge de intervalo para transparencia
- Tooltips com metadata persistida:
	- provider por setor lendo formulas/notas de `hub_metrics_registry` via view `vw_hub_metric_formulas`
	- `DashboardKpiCard` prioriza metadata persistida e usa mapa estatico como fallback

### Phase 6 — Campos custom DevOps (Cliente/SistemaProduto)
Status: postponed

- Entrar apenas com aprovacao funcional

## Synchronization Rule (VS Code + Lovable)

Quando alterar arquitetura, filtros, ou formulas de KPI:

1. Atualizar este arquivo na mesma PR/commit
2. Atualizar docs operacionais impactados em `docs/`
3. Registrar fases alteradas com status: `done`, `in progress`, `postponed`

Isso evita drift entre o que foi planejado no Lovable e o que foi implementado no VS Code.

