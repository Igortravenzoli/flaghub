# Guia Técnico e Operacional por Setor

Este documento consolida o comportamento atualmente implementado no FlagHub por setor, com foco em quatro perguntas:

1. O que o usuário vê no dashboard.
2. Como cada KPI é calculado no código.
3. Como os dados entram no sistema.
4. Onde os dados ficam armazenados e como são consumidos.

Objetivo deste guia:

- servir como referência técnica para manutenção;
- servir como manual operacional para usuários-chave;
- servir como base para uma futura central de ajuda dentro do próprio sistema.

## Visão geral do sistema

O FlagHub é um hub operacional em React + TypeScript com Supabase como backend. A aplicação combina quatro modelos de origem de dados:

- sincronização com Azure DevOps;
- sincronização com Gateway/VDesk;
- uploads manuais em CSV, XLSX e JSON;
- dados mockados em setores ainda não integrados.

Fluxo técnico predominante:

1. A origem externa ou o arquivo manual entrega dados brutos.
2. O Supabase armazena os dados em tabelas raw e tabelas derivadas.
3. Views no banco simplificam a leitura por setor.
4. Hooks React Query consultam essas views e aplicam regras complementares em TypeScript.
5. As páginas de setor exibem KPIs, tabelas, filtros, exportação, sync manual e, em alguns casos, importação manual.

## Estrutura operacional comum aos setores

O layout de setor é padronizado por `SectorLayout` e expõe, conforme permissões e configuração:

- aba `Dashboard`;
- abas extras específicas do setor;
- aba `Importações`, quando o setor informa `templateKey` e a área permite importação;
- aba `Configurações`, onde ficam integrações e funções de sincronização.

Regras atuais do layout:

- acesso é controlado por área (`areaKey`) e permissões do hub;
- a aba de importação genérica hoje aparece apenas para áreas compatíveis com `customer-service`, `comercial` e `tickets_os` quando a página fornece `templateKey`;
- syncs operacionais são expostos por `syncFunctions` em cada dashboard.

## Camadas de dados

### Principais tabelas raw

- `devops_work_items`: base completa de work items do Azure DevOps.
- `devops_query_items_current`: fotografia atual dos itens retornados por queries salvas.
- `vdesk_clients`: base sincronizada de clientes do VDesk/Gateway.
- `helpdesk_dashboard_snapshots`: snapshots diários do dashboard de helpdesk.
- `hub_raw_ingestions`: payloads crus coletados de integrações.
- `manual_import_batches`: lotes de upload manual.
- `manual_import_rows`: linhas normalizadas e validadas de uploads.
- `cs_implantacoes_records`: registros manuais de implantações do CS.
- `cs_fila_manual_records`: registros manuais da fila CS.

### Tabelas derivadas e analíticas

- `pbi_stage_events`: eventos de entrada/saída por etapa.
- `pbi_lifecycle_summary`: resumo de ciclo de vida por item.
- `pbi_health_summary`: classificação de saúde dos PBIs.

### Views usadas pelo frontend

- `vw_fabrica_kpis`
- `vw_qualidade_kpis`
- `vw_infraestrutura_kpis`
- `vw_helpdesk_kpis`
- `vw_customer_service_kpis`
- `vw_comercial_clientes_ativos`
- `vw_devops_queue_items`
- `vw_devops_work_items_hierarchy`

## Setores

## Fábrica

### Finalidade operacional

O dashboard de Fábrica monitora o andamento da sprint, a carga de trabalho, itens em desenvolvimento, itens aguardando teste, distribuição por colaborador e sinais de transbordo entre sprints.

### Integrações e ações operacionais

- Fonte principal: Azure DevOps.
- Fonte complementar: TimeLog DevOps.
- Syncs expostos na UI:
  - `devops-sync-query` para atualizar a query da Fábrica;
  - `devops-sync-all` para sincronização geral da base DevOps;
  - `devops-sync-timelog` para horas registradas.

### KPIs implementados

#### Total

- Fórmula: `kpiItems.length`
- Regra importante: `kpiItems` exclui Tasks/Bugs cujo PBI pai já está presente, evitando dupla contagem de pai e filho.

#### Em progresso

- Fórmula: contagem de itens cujo `state` pertence a:
  - `In Progress`
  - `Active`
  - `Em desenvolvimento`
  - `Aguardando Teste`

#### To do

- Fórmula: contagem de itens com `state` em `To Do` ou `New`.

#### Done

- Fórmula: contagem de itens com `state` em `Done`, `Closed` ou `Resolved`.

#### AVIÃO

- Regra: identificação pela tag `AVIAO` no campo `tags`.
- Uso: filtro visual de itens urgentes/escapados da rotina normal.

#### Aguardando Teste

- Regra: itens com `state = Aguardando Teste`.
- Observação importante: esse estado permanece em Fábrica. Qualidade considera apenas `Em Teste` e `Aguardando Deploy`.

#### Lead time médio exibido na Fábrica

- Regra atual do hook:
  - se houver timelogs, o valor é `totalHoursLogged / quantidade de PBIs`;
  - se não houver timelogs, usa fallback por esforço médio: `soma do effort / quantidade de PBIs com effort`.
- Unidade prática atual: horas médias por PBI, não dias corridos.
- Observação: existe também `pbi_lifecycle_summary.total_lead_time_days` no banco, mas esse valor não é o KPI principal calculado pelo hook da Fábrica.

#### Velocidade média

- Regra atual do hook:
  - com timelog: `totalHoursLogged / número de sprints`;
  - fallback: média do `effort` por sprint.

#### Transbordo e migração de sprint

Há duas leituras diferentes no código:

- `sprintMigrationCount`: quantidade de mudanças relevantes detectadas em `iteration_history`.
- `realOverflowCount`: `max(0, sprintMigrationCount - 1)` por item.

O item é considerado com mudança relevante quando:

- o histórico traz `oldValue` e `newValue` com sprint code válido e diferentes; ou
- o item entrou em sprint a partir de algo que não era backlog.

Regras adicionais:

- entradas de backlog não contam como transbordo inicial;
- o transbordo real desconta o primeiro compromisso da sprint.

Interpretação operacional recomendada:

- `Trocas de sprint` mostra quantas mudanças houve;
- `Transbordo real` mostra quanto ultrapassou o primeiro compromisso assumido.

### Filtros e leitura operacional

- Filtro principal: sprint.
- Em modo de sprint, a sprint selecionada é a principal segmentação.
- Em modo customizado, o intervalo de datas atua sobre `created_date` e `changed_date`.
- Há busca cruzada entre setores e exportação CSV/PDF.

### Ingestão de dados

Fluxo principal:

1. Queries do Azure DevOps alimentam `devops_query_items_current`.
2. Work items completos são persistidos em `devops_work_items`.
3. TimeLog alimenta agregações via RPC `rpc_devops_timelog_agg`.
4. O frontend consulta `vw_fabrica_kpis` e, em paralelo, busca metadados de `devops_work_items` para tags, hierarchy e `iteration_history`.

### Armazenamento

- `vw_fabrica_kpis`: base principal do dashboard.
- `devops_work_items`: tags, hierarchy, área, responsáveis e histórico de sprint.
- `devops_collaborator_map`: padronização de nomes para horas.
- `pbi_lifecycle_summary` e `pbi_health_summary`: suporte a saúde e esteira.

### Configurações e regras específicas

- Query operacional de referência: Query 08 da Fábrica.
- O nome visual da query pode mudar; a lógica deve depender do setor/ID, não do rótulo.
- Produtos conhecidos nas tags:
  - `FLEXX`
  - `FLEXXSALES`
  - `CONNECTSALES`
  - `FLEXXGO`
  - `FLEXXGPS`
  - `HEISHOP`
  - `PORTALBROKER`
  - `PORTAL BROKER`
  - `FLEXXLEAD`
  - `QUICKONE`
  - `CONNECTMERCHAN`

### Observações técnicas importantes

- Há exclusão explícita de itens de Infra na leitura da Fábrica.
- O dashboard usa `count_in_kpi` para reduzir dupla contagem.
- A lógica de transbordo depende de `iteration_history`; se o histórico vier vazio, o item não entra como migrado.

## Qualidade

### Finalidade operacional

O dashboard de Qualidade controla a fila de QA, a passagem para deploy e o retrabalho medido por retornos para teste.

### Integrações e ações operacionais

- Fonte principal: Azure DevOps.
- Sync exposto na UI: `devops-sync-qualidade`.
- Query oficial de Qualidade: `wiql_id 7b0a8298-5890-42d8-b280-1121b21786da`.

### KPIs implementados

#### Fila atual / Total QA

- Regra de fila QA: somente itens com `state` em:
  - `Em Teste`
  - `Aguardando Deploy`
- Fórmula de `filaAtual`: todos os itens atuais de QA sem depender do filtro de sprint.

#### Em Teste

- Fórmula: contagem de itens com `state = Em Teste`.

#### Aguardando Deploy

- Fórmula: contagem de itens com `state = Aguardando Deploy`.

#### Taxa de vazão

- Fórmula: `Math.round((aguardandoDeploy / total) * 100)`.
- Interpretação: percentual da fila de QA que já chegou no estágio imediatamente anterior ao deploy.

#### Herdados da sprint passada

- Fórmula: quando uma sprint está selecionada, conta itens da fila atual cujo `iteration_path` é diferente da sprint filtrada.
- Interpretação: itens que continuam ocupando a fila, mas não pertencem ao recorte da sprint corrente.

#### Retorno QA

O cálculo segue ordem de prioridade:

1. `state_history` em `devops_work_items`.
2. `pbi_lifecycle_summary.qa_return_count`.
3. fallback em `custom_fields.qa_return_count` ou `custom_fields.qa_retorno_count`.

Fórmula principal por histórico:

- contar quantas vezes `newValue === Em Teste`;
- subtrair a primeira entrada em teste;
- resultado final: `max(0, entradasEmTeste - 1)`.

#### Aviões testados

- Regra: tag `AVIAO` combinada com estado em `Em Teste` ou `Aguardando Deploy`.

### Filtros e leitura operacional

- Filtro principal: sprint.
- Filtro complementar: intervalo de datas.
- KPIs macro usam base atemporal; tabela e esteira podem usar recorte por sprint.
- Há aba de saúde usando `usePbiHealthBatch`.

### Ingestão de dados

1. Query oficial de Qualidade alimenta `devops_query_items_current` com `sector = qualidade`.
2. A view `vw_qualidade_kpis` expõe a fila para o frontend.
3. O hook consulta a view e complementa retornos QA com leituras adicionais em `devops_work_items` e `pbi_lifecycle_summary`.

### Armazenamento

- `vw_qualidade_kpis`
- `devops_work_items.state_history`
- `pbi_lifecycle_summary.qa_return_count`
- `pbi_health_summary`

### Configurações e regras específicas

- `Aguardando Teste` não pertence a Qualidade; permanece em Fábrica.
- Qualidade conta apenas `Em Teste` e `Aguardando Deploy`.

### Observações técnicas importantes

- Se `state_history` estiver ausente, a contagem de retorno pode ficar subestimada.
- `finalizados` hoje retorna `0` no hook, então não é um KPI operacional efetivo nessa versão.

## Infraestrutura

### Finalidade operacional

O dashboard de Infraestrutura acompanha atividades, melhorias, itens de ISO 27001, backlog, execução e transbordo entre sprints.

### Integrações e ações operacionais

- Fonte principal: Azure DevOps.
- Syncs expostos na UI:
  - `devops-sync-query` para a query `07-Infraestrutura`;
  - `devops-sync-all` para base DevOps.
- Query oficial: `wiql_id e6af59bf-64c5-4bf5-b926-d5039e9222f2`.

### KPIs implementados

#### Total

- Fórmula: quantidade de itens visíveis após filtro de sprint/data.

#### Pendentes

- Fórmula: itens com `state = New` ou `To Do`.

#### Em andamento

- Fórmula: itens com `state = In Progress` ou `Active`.

#### Concluídos

- Fórmula: itens com `state = Done`, `Closed` ou `Resolved`.

#### Melhorias

- Fórmula: contagem de itens cujo `tags` contém `MELHORIA`.

#### ISO 27001

- Fórmula atual: `countByTag('ISO27001') + countByTag('ISO')`.
- Observação: um mesmo item pode ser contado duas vezes se contiver ambas as marcações.

#### Trocas de sprint

- Fórmula: soma de `sprint_migration_count` dos itens.
- `sprint_migration_count` é calculado a partir de mudanças relevantes em `iteration_history`.

#### Transbordo

- Fórmula: soma de `real_overflow_count` dos itens.
- Regra por item: `real_overflow_count = max(0, relevantChanges.length - 1)`.

### Filtros e leitura operacional

- Filtro principal: sprint.
- Filtro complementar: intervalo de datas.
- A aba `Esteira / Saúde` usa os mesmos itens monitoráveis e classificação de saúde.

### Ingestão de dados

1. Query de Infraestrutura carrega a fila corrente em `devops_query_items_current`.
2. A view `vw_infraestrutura_kpis` expõe os campos do queue item.
3. O hook busca `iteration_history` diretamente em `devops_work_items` para enriquecer transbordo.

### Armazenamento

- `vw_infraestrutura_kpis`
- `devops_work_items.iteration_history`
- `pbi_health_summary`

### Configurações e regras específicas

- Tag principal para melhoria: `MELHORIA`.
- Tags relacionadas a compliance/segurança: `ISO27001`, `ISO`.

### Observações técnicas importantes

- A classificação de transbordo depende do histórico de sprint vir preenchido.
- O KPI de ISO pode supercontar itens quando o mesmo registro atende aos dois filtros textuais.

## Customer Service

### Finalidade operacional

O dashboard de Customer Service combina fila DevOps, implantações manuais, rastreabilidade de entrada VDesk e sinais de atraso operacional.

### Integrações e ações operacionais

- Fontes principais:
  - Azure DevOps para fila operacional;
  - upload manual para implantações;
  - tabela manual de fila CS, ainda sem peso central nos KPIs principais.
- Sync exposto na UI: `devops-sync-all`.
- A página informa `templateKey = cs_implantacoes_v1`, então possui aba genérica de importação.

### KPIs implementados

#### Fila CS

- Fórmula: quantidade de itens de `source = devops_queue` após filtro de sprint e período.

#### Por responsável

- Fórmula: agrupamento dos itens DevOps por `assigned_to_display`.

#### Implantações em andamento

- Base: registros de `source = manual_implantacao`.
- Regra: `status_implantacao` que não esteja em:
  - `finalizado`
  - `concluído`
  - `concluido`
  - `8 - encerrado`
  - `encerrado`
  - `11 - cancelado`
  - `cancelado`

#### Implantações finalizadas

- Base: mesma lista acima, mas com status contido no conjunto de encerramento.

#### Produto

- Regra: extraído das tags do work item a partir da whitelist de produtos conhecidos.
- Se houver mais de um produto conhecido na tag, o hook concatena os nomes com vírgula.

#### Aprovacao CS

- Regra: item cujo e-mail/responsável corresponda a `aprovacaocs@flag.com.br` ou variante textual equivalente.

#### Customer Service

- Regra: item cujo e-mail/responsável corresponda a `cs@flag.com.br` ou variante equivalente.

#### Itens em backlog

- Regra atual de backlog: `assigned_to_display` contém `lantim`.

#### Itens que saíram do CS

- Regra atual: responsável contém `lantim` ou `ari`, ou o estado contém `aprovação/aprovacao`.

#### Aging e alertas de atraso

O parser extrai datas estruturadas da descrição HTML do item:

- `Data Abertura Vdesk`
- `Data Inclusão Devops`

Métricas calculadas:

- `leadTimeVdeskToDevops`
- `leadTimeDevopsToNow`
- `agingTotal`

Thresholds atuais do código:

- VDesk até DevOps:
  - alerta: 7 dias
  - crítico: 14 dias
- DevOps até agora, enquanto o item ainda não caiu em backlog:
  - alerta: 14 dias
  - crítico: 30 dias

### Filtros e leitura operacional

- Filtro principal: sprint para itens DevOps.
- Registros manuais permanecem visíveis mesmo quando o filtro de sprint muda.
- Filtro de data atua como drill-down após o filtro de sprint.
- A tela possui abas de fila, implantações, saúde e monitoramento.

### Ingestão de dados

Fluxo DevOps:

1. Query do setor alimenta `vw_customer_service_kpis` via `vw_devops_queue_items`.
2. O hook consulta `devops_work_items.raw` para ler a descrição HTML.
3. O parser `csDescriptionParser` extrai datas e calcula aging.

Fluxo manual de implantações:

1. O usuário faz upload via `SectorImportArea`.
2. `useManualUpload` aceita `csv`, `json`, `xlsx`, `xls`.
3. O modo pode ser `overwrite` ou `purge`.
4. O lote entra em `manual_import_batches` e linhas em `manual_import_rows`.
5. Registros publicados alimentam `cs_implantacoes_records`.

### Armazenamento

- `vw_customer_service_kpis`
- `cs_implantacoes_records`
- `cs_fila_manual_records`
- `devops_work_items.raw`
- `manual_import_batches`
- `manual_import_rows`

### Configurações e regras específicas

Template manual atual de importação genérica na tela:

- `cs_implantacoes_v1`

Colunas requeridas do template:

- `cliente`
- `consultor`
- `solucao`
- `status_implantacao`
- `data_inicio`

Mapeamentos principais do template:

- `status` -> `status_implantacao`
- `horas` -> `horas_totais`
- `observacoes` -> `observacoes`

### Observações técnicas importantes

- `cs_fila_manual_records` é carregada pelo hook, mas não compõe os KPIs centrais de fila na mesma medida que os itens DevOps.
- O aging depende da presença padronizada das datas na descrição do item.

## Comercial

### Finalidade operacional

O dashboard de Comercial reúne base de clientes, esteira operacional do setor, movimentação de ganhos/perdas, pesquisa de satisfação e vendas carregadas em tabela.

### Integrações e ações operacionais

- Fonte principal de clientes: Gateway/VDesk.
- Fonte operacional complementar: fila DevOps `04-Em Fila Comercial`.
- Sync exposto na UI: `vdesk-sync-base-clientes`.
- Importações específicas ficam embutidas nas abas de Movimentação e Pesquisa, não na aba genérica de `SectorImportArea`.

### KPIs implementados

#### Base de clientes

- `totalClientes`: total de clientes após filtro.
- `bandeiras`: conjunto distinto de bandeiras.
- `lastSync`: último `synced_at` em `vdesk_clients`.

#### Estatísticas por status

- `ativos`: `status = ativo`
- `inativos`: `status = inativo`
- `bloqueados`: `status = bloqueado`

As estatísticas são calculadas em memória após leitura completa de `vw_comercial_clientes_ativos`.

#### Gráfico de clientes ativos por bandeira

- Base: clientes filtrados com `status = ativo`.
- Fórmula: agrupamento por `bandeira`.

#### Esteira / Saúde

- Base: `useDevopsOperationalQueue(['04-Em Fila Comercial'])`.
- Saúde: enriquecida por `usePbiHealthBatch`.

#### Movimentação comercial

Base: `comercial_movimentacao_clientes`.

KPIs:

- `totalPerdas`
- `totalGanhos`
- `valorPerdas`
- `valorGanhos`
- `saldo = valorGanhos - valorPerdas`
- `saldoClientes = ganhos.length - perdas.length`

#### Pesquisa de satisfação

Base: `comercial_pesquisa_satisfacao`.

KPIs:

- `total`: quantidade de pesquisas.
- `mediaGeral`: média de todos os valores numéricos encontrados em `notas_por_produto`.
- `bandeiras`: lista distinta por pesquisa.

#### Vendas

Base: `comercial_vendas`.

KPIs:

- `totalDeals`: total de registros.
- `vendasPorOrg`: distribuição percentual do valor vendido por organização.
- `vendasPorMes`: percentual sobre a média mensal histórica.

Observação importante:

- `vendasPorMes.percentualMeta` não compara com uma meta configurada de negócio.
- O cálculo atual usa a média de valor mensal como proxy de meta.

### Filtros e leitura operacional

- O filtro principal do topo atua em `synced_at` da base de clientes.
- A aba `KPI Oficial` foca em clientes.
- As abas `Movimentação`, `Pesquisa Satisfação` e `PipeDrive` têm bases próprias.

### Ingestão de dados

Clientes:

1. Gateway/VDesk sincroniza clientes em `vdesk_clients`.
2. A view `vw_comercial_clientes_ativos` normaliza a bandeira e expõe a base.

Movimentação:

1. Upload XLSX processado por `useMovimentacaoImport`.
2. Cabeçalhos são normalizados por aliases.
3. Datas aceitam serial Excel, ISO, formato brasileiro e `Mes/Ano`.
4. Valores monetários aceitam variações com ponto e vírgula.
5. Dados são inseridos em `comercial_movimentacao_clientes`.

Pesquisa:

1. Upload processado por `useManualUpload` ou parser de pesquisa wide/multi-sheet.
2. O formato multi-sheet combina `IMPORT_RESPONDENTES`, `IMPORT_AVALIACOES_PRODUTO` e, opcionalmente, `IMPORT_PERGUNTAS`.
3. Os dados publicados alimentam `comercial_pesquisa_satisfacao`.

Vendas:

- Leitura direta de `comercial_vendas`.

### Armazenamento

- `vdesk_clients`
- `vw_comercial_clientes_ativos`
- `comercial_movimentacao_clientes`
- `comercial_pesquisa_satisfacao`
- `comercial_vendas`

### Configurações e regras específicas

Template de pesquisa comercial:

- `comercial_pesquisa_v1`
- tipos aceitos: `csv`, `json`, `xlsx`, `xls`
- campos requeridos: `cliente_nome`, `bandeira`

Mapeamentos principais:

- `codigo_puxada` -> `cliente_codigo`
- `cliente` -> `cliente_nome`
- `data_contato` -> `data_pesquisa`

### Observações técnicas importantes

- A view `vw_comercial_clientes_ativos` não filtra mais apenas ativos; hoje ela expõe toda a `vdesk_clients` com normalização de bandeira.
- O card de vendas por meta usa proxy estatística, não meta de negócio persistida.

## Helpdesk

### Finalidade operacional

O dashboard de Helpdesk consolida snapshots operacionais do VDesk para leitura por consultor, sistema, bandeira, cliente, tipo de chamado e evolução histórica.

### Integrações e ações operacionais

- Fonte principal: VDesk Helpdesk API.
- Sync exposto na UI: `vdesk-sync-helpdesk`.
- A página possui `templateKey = helpdesk_v1`, portanto expõe aba genérica de importação.
- A área usada é `tickets_os`.

### KPIs implementados

#### Total registros

- Fórmula:
  - se houver um único snapshot útil, usa `raw.acumulado.totalRegistros` ou soma por consultor;
  - se houver vários dias no período, soma `historico.totalRegistros` por dia.

#### Total minutos e total horas

- Fórmula equivalente ao total de registros, com `totalHoras = totalMinutos / 60` arredondado para uma casa.

#### Consultores

- `registrosPorConsultor`: agregado por nome do consultor.
- O filtro de consultores é persistido em `localStorage` na chave `helpdesk_consultant_filter`.

#### Tipo de chamado x tempo médio

- Em modo multi-snapshot, o tempo médio é `totalMinutos / quantidade` por tipo.

#### Histórico

- O hook agrupa snapshots por dia e mantém apenas o snapshot mais recente de cada dia para compor a série histórica.

### Filtros e leitura operacional

- O filtro de período atua sobre `collected_at`.
- O usuário pode restringir consultores e navegar por abas de gráficos.
- A tela também incorpora páginas relacionadas a Tickets/OS em abas extras.

### Ingestão de dados

1. O sync do VDesk grava snapshots em `helpdesk_dashboard_snapshots`.
2. O frontend lê `vw_helpdesk_kpis`.
3. O hook agrupa snapshots por dia, reconstroi agregações e trata formatos diferentes do campo `raw`.

### Armazenamento

- `helpdesk_dashboard_snapshots`
- `vw_helpdesk_kpis`

### Configurações e regras específicas

Template genérico de importação:

- `helpdesk_v1`

Campos requeridos do template:

- `number`
- `short_description`
- `state`

Campos opcionais:

- `priority`
- `assigned_to`
- `opened_at`
- `closed_at`
- `category`
- `description`
- `sys_class_name`

Consultores padrão carregados no filtro local:

- `Leandrofaria`
- `Ailton`
- `Italo`
- `Vagner`
- `Bruna`
- `Ricardo`
- `Ronaldo`
- `Brunosassada`

### Observações técnicas importantes

- O campo `raw` pode variar de estrutura; o hook tenta resolver nomes alternativos como `registrosPorConsultor` e `porConsultor`.
- Em períodos com múltiplos snapshots por dia, apenas o mais recente do dia compõe o histórico agregado.

## Programação

### Situação atual

Setor ainda não integrado com base real. O dashboard usa dados mockados de `mockSectorData.ts`.

### KPIs exibidos hoje

- total de tasks
- em progresso
- to do
- aviões
- bugs
- transbordos
- retorno QA
- distribuição por programador

### Origem, ingestão e armazenamento

- origem: array local `sprintTasksData`
- ingestão: inexistente
- armazenamento: inexistente no backend

### Uso operacional

- serve apenas como painel demonstrativo/placeholder;
- não deve ser interpretado como fonte oficial de indicadores.

## Comunicação

### Situação atual

Setor ainda não integrado com RD Station real. O dashboard usa dados mockados.

### KPIs exibidos hoje

- emails enviados
- entregues
- aberturas únicas
- leads
- conversões
- métricas por campanha:
  - abertura
  - cliques
  - bounces
  - spam
  - descadastros

### Origem, ingestão e armazenamento

- origem: objeto local `comunicacaoData`
- ingestão: inexistente
- armazenamento: inexistente no backend

### Uso operacional

- painel ilustrativo, ainda não confiável para operação.

## Produtos

### Situação atual

Setor não implementado. A página mostra estado vazio informando ausência de fonte configurada.

### Origem, ingestão e armazenamento

- não há integração ativa;
- não há tabela/set de KPIs específicos consumidos pela página;
- a implementação futura menciona possibilidade de RD Station ou analytics interno.

## Templates de importação e modos operacionais

### Modos de importação manual

O fluxo genérico de importação suporta:

- `overwrite`: importa sem expurgo prévio.
- `purge`: limpa a base-alvo antes de publicar o novo lote.

Regras especiais:

- `helpdesk_v1` usa RPC para apagar tickets da rede antes do reload.
- `cs_implantacoes_v1` usa RPC dedicada de purge.
- outros templates podem deletar diretamente a tabela alvo.

### Tipos aceitos

- `csv`
- `json`
- `xlsx`
- `xls`

### Rastreabilidade do upload

Cada upload gera histórico em:

- `manual_import_batches`
- `manual_import_rows`

Estados do lote:

- `uploaded`
- `parsed`
- `validated`
- `rejected`
- `published`
- `error`

## Matriz setorial validada no Supabase remoto

Esta seção cruza os setores com os objetos realmente encontrados no ambiente remoto `nxmgppfyltwsqryfxkbm` em 2026-04-01.

Objetivo prático:

- mostrar quais objetos já existem no banco remoto;
- separar o que é consumo do frontend do que é processamento e automação;
- reduzir ambiguidade entre migration local e ambiente efetivamente publicado.

### Fábrica

- tabelas reais:
  - `devops_work_items`
  - `devops_query_items_current`
  - `devops_time_logs`
  - `devops_collaborator_map`
  - `pbi_stage_events`
  - `pbi_lifecycle_summary`
  - `pbi_health_summary`
  - `pbi_health_thresholds`
  - `pbi_stage_config`
- views reais:
  - `vw_fabrica_kpis`
  - `vw_devops_queue_items`
  - `vw_devops_work_items_hierarchy`
- funções SQL reais:
  - `compute_pbi_health_all`
  - `rpc_devops_timelog_agg`
  - `rpc_feature_pbi_summary`
  - `rpc_pbi_bottleneck_summary`
  - `rpc_pbi_health_overview`
- edge functions reais:
  - `devops-sync-query`
  - `devops-sync-all`
  - `devops-sync-timelog`
- cron jobs relacionados:
  - `sync-devops-all`
  - `sync-devops-timelog`

Leitura operacional:

- a Fábrica já está apoiada por objetos analíticos reais no banco remoto;
- o dashboard depende de sincronização DevOps e de horas para parte dos KPIs;
- a saúde dos PBIs não está apenas no frontend, ela já é calculada no backend.

### Qualidade

- tabelas reais:
  - `devops_work_items`
  - `devops_query_items_current`
  - `pbi_lifecycle_summary`
  - `pbi_health_summary`
  - `pbi_stage_events`
- views reais:
  - `vw_qualidade_kpis`
  - `vw_devops_queue_items`
- funções SQL reais:
  - `compute_pbi_health_all`
  - `rpc_feature_pbi_summary`
  - `rpc_pbi_bottleneck_summary`
  - `rpc_pbi_health_overview`
- edge functions reais:
  - `devops-sync-qualidade`
  - `devops-sync-all`
- cron jobs relacionados:
  - `sync-devops-all`

Leitura operacional:

- a fila QA está publicada por view setorial real;
- a atualização automática principal vem do sync DevOps geral;
- o cálculo de retorno QA continua dependente do histórico real do work item.

### Infraestrutura

- tabelas reais:
  - `devops_work_items`
  - `devops_query_items_current`
  - `pbi_health_summary`
  - `pbi_lifecycle_summary`
- views reais:
  - `vw_infraestrutura_kpis`
  - `vw_devops_queue_items`
- funções SQL reais:
  - `compute_pbi_health_all`
  - `rpc_pbi_health_overview`
- edge functions reais:
  - `devops-sync-query`
  - `devops-sync-all`
- cron jobs relacionados:
  - `sync-devops-all`

Leitura operacional:

- Infraestrutura já possui leitura remota setorial pronta por view;
- o enriquecimento de transbordo ainda depende do histórico bruto do item;
- não há cron exclusivo do setor, só o sincronismo DevOps compartilhado.

### Customer Service

- tabelas reais:
  - `cs_implantacoes_records`
  - `cs_fila_manual_records`
  - `manual_import_batches`
  - `manual_import_rows`
  - `manual_import_templates`
  - `devops_work_items`
  - `devops_query_items_current`
  - `pbi_health_summary`
- views reais:
  - `vw_customer_service_kpis`
  - `vw_devops_queue_items`
- funções SQL reais:
  - `purge_cs_implantacoes`
  - `hub_resolve_area_network_id`
  - `rpc_pbi_health_overview`
- edge functions reais:
  - `manual-upload-parse`
  - `manual-upload-publish`
  - `devops-sync-all`
- cron jobs relacionados:
  - `sync-devops-all`

Leitura operacional:

- o setor já combina dados DevOps com persistência manual publicada em tabelas próprias;
- a ingestão manual existe de forma real no remoto, não apenas no frontend;
- a fila DevOps do CS depende de infraestrutura compartilhada com outros setores.

### Comercial

- tabelas reais:
  - `vdesk_clients`
  - `comercial_movimentacao_clientes`
  - `comercial_pesquisa_satisfacao`
  - `comercial_vendas`
  - `manual_import_batches`
  - `manual_import_rows`
  - `manual_import_templates`
  - `devops_query_items_current`
  - `devops_work_items`
  - `pbi_health_summary`
- views reais:
  - `vw_comercial_clientes_ativos`
  - `vw_devops_queue_items`
- funções SQL reais:
  - `rpc_pbi_health_overview`
- edge functions reais:
  - `vdesk-sync-base-clientes`
  - `manual-upload-parse`
  - `manual-upload-publish`
  - `survey-import`
- cron jobs relacionados:
  - `sync-vdesk-clientes`

Leitura operacional:

- a base oficial de clientes está efetivamente sincronizada e publicada no remoto;
- movimentação, pesquisa e vendas já possuem tabelas dedicadas;
- a esteira comercial continua reutilizando componentes genéricos de DevOps.

### Helpdesk

- tabelas reais:
  - `helpdesk_dashboard_snapshots`
  - `tickets`
  - `imports`
  - `import_events`
  - `import_batches`
  - `settings`
  - `status_mapping`
- views reais:
  - `vw_helpdesk_kpis`
  - `v_dashboard_summary`
- funções SQL reais:
  - `get_dashboard_summary`
  - `get_tickets`
  - `get_ticket_detail`
  - `get_ticket_timeline`
  - `get_correlation_stats`
  - `get_tickets_needing_os_validation`
  - `batch_validate_os`
  - `recalculate_ticket_severities`
  - `delete_tickets_by_network`
- edge functions reais:
  - `vdesk-sync-helpdesk`
  - `vdesk-ticket-os`
  - `vdesk-tickets-os`
  - `consultar-vdesk`
  - `vdesk-proxy`
- cron jobs relacionados:
  - `sync-vdesk-helpdesk`
  - `cleanup-helpdesk-snapshots-daily`

Leitura operacional:

- Helpdesk é um dos domínios mais completos no ambiente remoto;
- há coleta periódica automatizada e limpeza diária dos snapshots;
- a área de Tickets/OS compartilha backend e funções com este setor.

### Programação

- tabelas reais exclusivas do setor: nenhuma confirmada
- views reais exclusivas do setor: nenhuma confirmada
- funções SQL exclusivas do setor: nenhuma confirmada
- edge functions exclusivas do setor: nenhuma confirmada
- cron jobs exclusivos do setor: nenhum confirmado

Leitura operacional:

- o remoto tem infraestrutura genérica de DevOps que pode ser reaproveitada;
- o dashboard atual de Programação continua sem backend setorial próprio e permanece mockado no frontend.

### Comunicação

- tabelas reais exclusivas do setor: nenhuma confirmada
- views reais exclusivas do setor: nenhuma confirmada
- funções SQL exclusivas do setor: nenhuma confirmada
- edge functions exclusivas do setor: nenhuma confirmada
- cron jobs exclusivos do setor: nenhum confirmado

Leitura operacional:

- não há backend remoto validado para Comunicação;
- o setor continua em estágio de placeholder do ponto de vista operacional.

### Produtos

- tabelas reais exclusivas do setor: nenhuma confirmada
- views reais exclusivas do setor: nenhuma confirmada
- funções SQL exclusivas do setor: nenhuma confirmada
- edge functions exclusivas do setor: nenhuma confirmada
- cron jobs exclusivos do setor: nenhum confirmado

Leitura operacional:

- o estado remoto confirma o que a UI já mostra: Produtos ainda não tem backend setorial ativo.

### Objetos compartilhados entre setores maduros

- tabelas compartilhadas:
  - `devops_work_items`
  - `devops_query_items_current`
  - `pbi_lifecycle_summary`
  - `pbi_health_summary`
  - `manual_import_batches`
  - `manual_import_rows`
  - `manual_import_templates`
- views compartilhadas:
  - `vw_devops_queue_items`
  - `vw_devops_work_items_hierarchy`
- funções SQL compartilhadas:
  - `compute_pbi_health_all`
  - `rpc_pbi_health_overview`
  - `hub_resolve_area_network_id`
- edge functions compartilhadas:
  - `devops-sync-all`
  - `manual-upload-parse`
  - `manual-upload-publish`

Interpretação arquitetural:

- o projeto remoto já está organizado em uma base compartilhada de DevOps e uploads manuais;
- os setores maduros são formados por views específicas sobre uma infraestrutura comum;
- os setores não maduros ainda não possuem a mesma camada setorial de persistência e automação.

## Saúde da esteira e métricas derivadas

Os setores que usam PBIs monitoráveis podem consultar saúde de esteira com base em `pbi_health_summary`.

Função central:

- `compute_pbi_health_all()`

Regras principais da função:

- identifica etapa atual a partir de `pbi_stage_config`;
- calcula dias na etapa atual a partir de `changed_date`;
- calcula migração/overflow a partir de `iteration_history`;
- classifica saúde em `verde`, `amarelo` ou `vermelho` com base em:
  - transbordo;
  - múltiplas migrações de sprint;
  - thresholds por etapa em `pbi_health_thresholds`.

## Lacunas e riscos atuais

### Lacunas funcionais

- Programação usa dados mockados.
- Comunicação usa dados mockados.
- Produtos ainda não possui integração ativa.

### Lacunas de cálculo

- Fábrica usa lead time médio em horas/esforço no frontend, enquanto o banco também mantém lead time em dias. É importante não misturar as duas leituras sem explicitar unidade.
- Infraestrutura pode supercontar o KPI de ISO quando um item contém `ISO` e `ISO27001` ao mesmo tempo.
- Customer Service depende de padrão textual na descrição HTML para aging e rastreabilidade.

### Lacunas operacionais

- Se `state_history` e `iteration_history` não vierem completos do DevOps, Qualidade e transbordo ficam subestimados.
- O campo `raw` de snapshots de Helpdesk não possui schema rígido validado no frontend.

## Recomendação para futura ajuda dentro do sistema

Para consumo in-app, este documento pode ser quebrado em cards por setor com a mesma estrutura:

1. `O que mede`
2. `Como calcular`
3. `Como interpretar`
4. `De onde vem o dado`
5. `Onde está salvo`
6. `Riscos e exceções`

O arquivo complementar `COLA_KPIS_SETORIAIS.md` já foi organizado nesse formato resumido para servir de base à futura central de ajuda.