
## Plano: Painéis Gerenciais — Fábrica e QA

### Contexto atual
O projeto já possui:
- Tabelas `pbi_lifecycle_summary` e `pbi_health_summary` com saúde calculada (verde/amarelo/vermelho)
- RPC `rpc_pbi_bottleneck_summary` para gargalos por etapa
- `state_history` e `iteration_history` em JSONB no `devops_work_items`
- Hooks `useFabricaKpis` e `useQualidadeKpis` com métricas básicas
- Dashboards setoriais existentes com abas (Sprint Board, Gargalos, Retrabalho)

### Fase 1 — Enriquecimento de dados (Backend/SQL)

**1.1 Campos derivados na `pbi_lifecycle_summary`**
Adicionar colunas:
- `foi_despriorizada` (boolean)
- `retornou_para_backlog` (boolean)  
- `transbordou_sprint` (boolean)
- `motivo_transbordo` (text — enum: falta_especificacao, dependencia_externa, erro_dev, priorizacao_alterada, bloqueio_cliente)
- `dias_sem_atualizacao` (integer)
- `tempo_retrabalho_dias` (numeric)
- `ultimo_motivo_retorno` (text)

**1.2 Atualizar `compute_pbi_health_all()` para popular os novos campos**
Lógica derivada do `state_history` e `iteration_history`:
- Se item saiu de sprint ativa e voltou para backlog → `retornou_para_backlog = true`
- Se esteve em sprint e foi removido antes de concluir → `foi_despriorizada = true`
- Se migrou para sprint seguinte sem Done → `transbordou_sprint = true`

**1.3 Nova RPC: `rpc_gerencial_fabrica_summary`**
Retorna por sprint:
- Total de itens, done, transbordos, despriorizações, tempo médio backlog→done
- Gargalo principal (etapa com maior tempo médio)

**1.4 Nova RPC: `rpc_gerencial_qa_summary`**  
Retorna por sprint:
- Tasks testadas, aprovadas, reprovadas, retornadas
- Tempo médio de teste, taxa de aprovação
- Vazão (entrada vs saída)

**1.5 Nova RPC: `rpc_qa_desempenho_responsavel`**
Retorna por colaborador QA:
- Tasks testadas, tempo médio, reprovações, % aprovação

### Fase 2 — Página Gerencial Fábrica

**2.1 Nova página `src/pages/setores/GerencialFabricaDashboard.tsx`**
- Rota: `/setores/fabrica/gerencial`
- Filtros globais: sprint, período, squad, responsável, criticidade

**2.2 Seção KPIs (topo)**
Cards: Tempo médio por etapa | Gargalo principal | Transbordos na sprint | Despriorizações | Lead time médio (backlog→done)

**2.3 Seção Gráficos (meio)**
- Barras: tasks paradas por etapa
- Heatmap: tempo médio por etapa × sprint (usando Recharts)
- Linha: evolução de transbordos por sprint
- Ranking: top causas de atraso

**2.4 Seção Timeline (drill-down)**
- Clique em item → drawer com timeline cronológica
- Cada fase mostra: entrada, saída, duração, responsável, quantidade de passagens
- Reutiliza `PbiTimeline` existente, estendido com as novas fases

**2.5 Tabela detalhada (base)**
- Lista de itens com saúde, etapa atual, dias parado, transbordos, retornos QA
- Link para DevOps, drill-down para timeline

### Fase 3 — Página Gerencial QA

**3.1 Nova página `src/pages/setores/GerencialQaDashboard.tsx`**
- Rota: `/setores/qualidade/gerencial`

**3.2 Seção KPIs**
Cards: % em teste | % done | % retrabalho | % críticas (2+ retornos) | Backlog QA | SLA médio

**3.3 Evolução sprint a sprint**
- Tabela comparativa: sprint × testadas × aprovadas × reprovadas × retornadas × tempo médio × % aprovação
- Gráfico de barras empilhadas por sprint

**3.4 Desempenho por responsável QA**
- Tabela: colaborador × tasks testadas × tempo médio × reprovações × % aprovação
- Cruzamento com desenvolvedor responsável

**3.5 Retrabalho avançado**
- Gráfico de tendência de retrabalho por sprint
- Heatmap de gargalos por responsável
- Classificação: baixo (1 retorno), alto (2+), crítico (3+)

**3.6 Vazão de testes**
- Gráfico de entrada vs saída acumulada
- Indicadores: vazão diária, semanal, backlog atual

### Fase 4 — Navegação e UX

**4.1 Adicionar link "Gerencial" no sidebar dos setores Fábrica e Qualidade**
**4.2 Tooltips com regras de cálculo em cada KPI**
**4.3 Drill-down: KPI → gráfico → lista de tasks**

### Ordem de implementação sugerida
1. **Fase 1** (backend) — migrações e RPCs
2. **Fase 2** (Gerencial Fábrica) — página + hooks + componentes
3. **Fase 3** (Gerencial QA) — página + hooks + componentes  
4. **Fase 4** (navegação e polish)

### Arquivos impactados
| Tipo | Arquivos |
|------|----------|
| Migrações SQL | Nova migration para colunas + RPCs |
| Novas páginas | `GerencialFabricaDashboard.tsx`, `GerencialQaDashboard.tsx` |
| Novos hooks | `useGerencialFabrica.ts`, `useGerencialQa.ts`, `useQaDesempenho.ts` |
| Componentes | Timeline estendida, Heatmap, cards gerenciais |
| Sidebar | Atualizar navegação |
| App.tsx | Novas rotas |
