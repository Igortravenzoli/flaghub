# Análise — TimeLog Híbrido (VDESK ↔ Azure DevOps)

> **Documento de decisão** • Data: 30/04/2026
> **Contexto**: avaliar caminho para unificar apontamentos de horas hoje espalhados entre **VDESK (Tb_Avd / HISTORICOOS)** e **Azure DevOps + extensão TechsBCN/DevOps-TimeLog**.
> **Stakeholders**: FlagHub (portal), Flag.AI.Gateway (não envolvido nesta fase), Supabase (FlagHubDB) e Azure DevOps (FlagIW).

---

## 1. Diagnóstico dos dados (período 2026-01-01 → 2026-12-31, dados até 30/04/2026)

### 1.1 VDESK — apontamentos com `NUM_TASK_DEVOPS > 0`

| Métrica | Valor |
|---|---:|
| Registros | 674 |
| Tasks DevOps distintas | 247 |
| OS distintas | 248 |
| Usuários distintos | 8 |
| **Horas apontadas no VDESK** | **1.908,63 h** |
| Período com dados | 02/01/2026 → 30/04/2026 |

**Apontamentos por mês (VDESK):**

| Mês | Horas |
|---|---:|
| 2026-01 | 473,34 |
| 2026-02 | 449,57 |
| 2026-03 | 494,33 |
| 2026-04 | 491,39 |

**Apontamentos por usuário (VDESK):**

| Usuário | Registros | Tasks | Horas |
|---|---:|---:|---:|
| Emerson Luis | 204 | 48 | 540,84 |
| Carlos | 171 | 49 | 528,31 |
| Anderson | 143 | 70 | 391,71 |
| Elder | 75 | 28 | 328,85 |
| Klelbio | 44 | 35 | 82,97 |
| Alessandro | 6 | 4 | 20,17 |
| Thales | 26 | 24 | 14,78 |
| Thiago | 5 | 5 | 1,00 |

### 1.2 Azure DevOps TimeLog (TechsBCN) — base `devops_time_logs`

| Métrica | Valor |
|---|---:|
| Total de registros (todas as datas) | 4.302 |
| Usuários distintos | 28 |
| Work items distintos | 1.583 |

**Para as 247 tasks que aparecem no VDESK em 2026:**

| Métrica | Valor |
|---:|---:|
| Tasks com algum apontamento DevOps | 69 |
| Registros TimeLog | 164 |
| **Horas apontadas no DevOps** | **480,45 h** |

### 1.3 Gap (visão híbrida)

| Indicador | Valor |
|---|---:|
| Horas só no VDESK (gap) | **~1.428 h** |
| Tasks VDESK sem qualquer TimeLog DevOps | **178 (72 %)** |
| Cobertura Task↔WorkItem (existem em `devops_work_items`) | **242 / 247 (97,9 %)** |

> **Conclusão dos dados**: o VDESK é hoje a fonte mais completa. Mais de 70 % das tasks com apontamento no VDESK estão **completamente vazias** no TimeLog do DevOps. O JOIN é direto por `NUM_TASK_DEVOPS = devops_work_items.id` — não precisa parsear "OS" do título.

---

## 2. Estado atual do ecossistema FlagHub

| Componente | Função |
|---|---|
| Edge function `devops-sync-timelog` (v62, ACTIVE) | GET read-only no endpoint `extmgmt.dev.azure.com/.../TechsBCN/DevOps-TimeLog/Data/Scopes/Default/Current/Collections/{TimeLogData,TimeLog,timelog,Logs}/Documents` → upsert em `devops_time_logs`. PAT (`DEVOPS_PAT`) já configurado nas secrets do Supabase. |
| Tabela `devops_time_logs` | Dedup duplo: UPSERT por `ext_entry_id` quando disponível, senão insert-only por chave de conteúdo `(work_item_id, log_date, user_name, start_time, time_minutes)`. |
| Tabela `devops_work_items` (7.685 linhas) | `id` = ID Azure DevOps. Pivô natural para correlação. |
| Tabela `devops_collaborator_map` | Mapeia `timelog_name` → `canonical_name` (parcialmente preenchida — precisa ser auditada para os 8 usuários do VDESK). |
| Hook `useFabricaKpis` + `FabricaDashboard.tsx` | Já consome `devops_time_logs` via RPC `rpc_devops_timelog_agg`. |
| Edge functions ativas relacionadas | `devops-sync-all`, `devops-sync-query`, `devops-sync-qualidade`, `devops-qa-alert`, `vdesk-tickets-os`, `vdesk-sync-helpdesk`, `vdesk-sync-base-clientes`, `consultar-vdesk`. |

---

## 3. Fluxo "mundo perfeito" (referência do usuário)

```
VdWork (Tb_Avd / HISTORICOOS)
   ↓ apontamentos com NUM_TASK_DEVOPS
   ↓
Identifica OS interna (NumOS_)
   ↓
Localiza Task DevOps correspondente
   ↓ (atualmente usamos NUM_TASK_DEVOPS direto = 97,9% match)
Valida se a Task existe (devops_work_items)
   ↓
Consulta lançamentos existentes no TimeLog (devops_time_logs / API TechsBCN)
   ↓
Verifica duplicidade
   chave = (task_id, colaborador, data, minutos, ext_ref)
   ↓
Se já existir → "Ignorado - já existente"
Se não existir → monta lançamento:
   - Task Azure DevOps
   - colaborador (mapeado VDESK → DevOps unique_name)
   - data
   - minutos
   - notes = "VDESK OS <NumOS_> — <ultimo histórico>"
   - ext_ref = "vdesk:<Nro_OS>:<Dathorahistorico>"
   ↓
Grava no TimeLogData/Documents
   ↓
Registra resultado em tabela de controle (devops_post_timelog_runs)
   ↓
Renderiza status na plataforma
```

---

## 4. Comparação das opções

### Opção 1 — Tela consolidada (read-only, VDESK + DevOps lado a lado)

| Eixo | Avaliação |
|---|---|
| Esforço | 🟢 Baixo (1–2 dias) |
| Risco operacional | 🟢 Mínimo — tudo read-only |
| Resolve híbrido | 🟡 **Não** — só dá visibilidade; ~1.428 h continuam fora do TimeLog DevOps |
| Pré-requisito p/ Opção 2 | 🟢 Sim — gera o "diff" que a Opção 2 vai postar |
| Componentes | • Edge `vdesk-sync-timelog` espelhando o SQL validado<br>• Tabela `vdesk_time_logs` (chave natural anti-dup)<br>• View `v_timelog_unified` com `match / only_vdesk / only_devops / divergent`<br>• Página `/timelog` no FlagHub com filtros + export CSV |

### Opção 2 — Edge function que **POSTA** no TimeLog do DevOps

| Eixo | Avaliação |
|---|---|
| Esforço | 🟡 Médio (3–5 dias com testes) |
| Risco operacional | 🟠 **Alto** — escrita em sistema externo, duplicidades irreversíveis sem dedup robusto |
| Resolve híbrido | 🟢 Sim — DevOps vira fonte única |
| Limitação técnica | A API da TechsBCN é **storage de extensão** (`ExtensionManagement/.../Documents`), não API pública de TimeLog:<br>• Concorrência otimista via `__etag` → POSTs simultâneos retornam 412<br>• Não há endpoint oficial de escrita documentado — pode quebrar em release nova da TechsBCN<br>• Sem rate limit documentado, mas comportamento esperado: 1 documento por POST, sequencial |
| Dedup obrigatório | Antes de postar:<br>1. GET no Document atual da Task<br>2. Comparar `(work_item_id, log_date, user_id, time_minutes, ext_ref=vdesk:<NumOS>:<Dathorahistorico>)`<br>3. POST somente o delta |
| Identidade de usuário | `Funrpsos_` (VDESK) ≠ `userId / UserName` no DevOps → **necessário popular `devops_collaborator_map`** com os 8 usuários ativos. **Bloqueador**. |

---

## 5. Recomendação

**Executar nas duas fases, em sequência.**

### Fase 1 — *Foundation* (Opção 1)
1. Edge function nova `vdesk-sync-timelog` — espelha o SQL validado, grava em `vdesk_time_logs` com chave natural `(Nro_OS, Dathorahistorico, Cod_Usu_Avd, Ini_Avd)` (idempotência determinística).
2. `devops_collaborator_map` populada para os 8 usuários ativos (mapeamento `Funrpsos_` → DevOps `unique_name` / e-mail).
3. View `v_timelog_unified`:
   - colunas: `task_id, log_date, user_canonical, minutes_vdesk, minutes_devops, gap_minutes, status` (`only_vdesk` / `only_devops` / `match` / `divergent`).
4. Página `/timelog` no FlagHub:
   - filtros (período, colaborador, task, status)
   - export CSV
   - badge de origem (VDESK / DevOps / Ambos / Divergente)

### Fase 2 — *Posting* (Opção 2)
5. Edge `devops-post-timelog`:
   - lê `v_timelog_unified` filtrado em `status='only_vdesk'`
   - GET → diff → POST/PUT individual respeitando `__etag`
   - **modo `dry-run` obrigatório no 1.º deploy** (loga sem executar)
6. Tabela `devops_post_timelog_runs` (auditoria por tentativa: payload, status, duplicado/inserido/erro, etag antes/depois).
7. **Approval gate** na UI: admin revisa o diff por lote e aprova antes do POST.
8. Política de retomada: se uma sincronização cair, o próximo run **continua de onde parou** usando a `ext_ref`.

---

## 6. Bloqueadores / decisões pendentes

| # | Pergunta | Quem decide |
|---|---|---|
| 1 | Mapeamento dos 8 usuários VDESK → DevOps `unique_name` (preciso da lista para popular `devops_collaborator_map`). | Gestor de área |
| 2 | `Tb_Avd` tem PK explícita? Se não, usar hash determinístico de `(Nro_OS + Dathorahistorico + Cod_Usu_Avd + Ini_Avd)`. | A confirmar via consulta SQL ao VDESK |
| 3 | Políticas de **horas históricas**: posto retroativamente as ~1.428 h faltantes, ou só a partir de uma data de corte? | Negócio |
| 4 | **Conflito de divergência** (ex.: VDESK=4h, DevOps=2h na mesma task/dia/user): adicionar diff, sobrescrever, ou marcar como "conflito manual"? | Negócio |
| 5 | A política de RLS da nova tabela `vdesk_time_logs` segue o padrão `hub_*` (admin escreve, leitura por área)? | Arquitetura |

---

## 7. Métricas-chave para validação posterior

- **Cobertura**: `% horas VDESK que foram postadas no DevOps` (alvo: > 95 %).
- **Idempotência**: 0 duplicados em 5 runs consecutivos com os mesmos dados.
- **Latência**: tempo médio do sync VDESK + post DevOps por dia útil < 90 s.
- **Saúde**: 0 falhas 412 (etag) em 24 h.

---

## 8. Referências (arquivos do workspace)

- [FlagHub/supabase/functions/devops-sync-timelog/index.ts](FlagHub/supabase/functions/devops-sync-timelog/index.ts)
- [FlagHub/src/hooks/useFabricaKpis.ts](FlagHub/src/hooks/useFabricaKpis.ts)
- [FlagHub/src/pages/setores/FabricaDashboard.tsx](FlagHub/src/pages/setores/FabricaDashboard.tsx)
- [FlagHub/src/services/vdeskProxyService.ts](FlagHub/src/services/vdeskProxyService.ts)
- SQL base do VDESK: `Downloads/SQL 30-10-2025 (Historico - Apontamento - DevOps).sql`
