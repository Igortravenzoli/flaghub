# FlagHub Evolution - Dev Level Plan (VS Code + Lovable)

Last update: 2026-03-26

## Purpose
Este arquivo e o plano de execucao de desenvolvimento para seguranca, desempenho e cleanup.
Ele deve refletir o estado real implementado e reduzir drift entre VS Code e Lovable.

## Premises
- Backend nunca confia no frontend para autenticacao, autorizacao ou escopo de dados.
- Supabase URL e anon/publishable key sao publicos por design.
- Plataforma deve suportar 12 acessos simultaneos com estabilidade em login/refresh/KPI load.
- Kiosk usa conta dedicada read-only, sem privilegio administrativo.

---

## PRD — Evolução Estrutural do Operations Hub + Setores

### Fase 1 — Fundação Transversal (EM ANDAMENTO)
**Prioridade:** P0 | **Risco:** Baixo

#### 1.1 Paginação padronizada
- [x] Seletor de page size: 20 / 30 / 50 / 100 (default 30)
- [x] Aplicar em todas as DashboardDataTable
- [x] Preservar filtros e busca ao trocar page size

#### 1.2 Performance e concorrência
- [x] staleTime global de 2min para queries React Query (QueryClient defaults)
- [x] Lazy load de tabs (Settings, Importações) no SectorLayout
- [x] Reduzir refetchInterval agressivo (jobs: 10s → 60s, kiosk: preservar)
- [x] refetchOnWindowFocus: false em queries pesadas (global default no QueryClient)
- Meta: 10 sessões simultâneas mínimo, margem para 12

#### 1.3 Toggles padronizados
- [x] Switch verde quando On, cinza quando Off (Radix Switch com data-[state=checked]:bg-primary)
- [x] Garantir consistência visual em SectorSettings e SyncCentral (Switch substituiu Button On/Off)

#### 1.4 Observabilidade de Jobs
- [x] Exibir último run, status, próxima execução, erro resumido
- [x] Badges de saúde: ativo, falhando, degradado (baseado nas últimas 3 execuções)
- [x] Histórico mínimo operacional na Central de Sync (últimas 30 execuções com detalhes)

#### 1.5 Tabelas backend (Supabase)
- [x] sector_health — status de saúde por setor/dependência
- [x] alert_rules — regras de alerta por setor/KPI
- [x] alert_channels — canais (email, telegram, teams)
- [x] alert_deliveries — log de envios

### Fase 2 — Permissões e Visibilidade
**Prioridade:** P1 | **Dependência:** Fase 1

#### 2.1 Matriz de permissões
- [x] Roles refinados: leitura, operacional, owner (+ admin global)
- [x] Herança de permissão: HelpDesk → Tickets automático (hub_area_inheritance + hub_user_has_area)
- [x] Bloqueio visual de ações sem permissão (abas Importações/Configurações condicionais por role)

#### 2.2 Usuário monitor
- [x] monitor@flag.com.br: role operacional, somente leitura, somente Kiosk
- [x] Exceção de MFA exclusiva deste usuário
- [x] Sem acesso a importações, configurações ou administração

### Fase 3 — Estrutura Setorial e Navegação
**Prioridade:** P1 | **Dependência:** Fase 2

#### 3.1 HelpDesk reorganizado
- [ ] /dashboard HelpDesk: painel gerencial com tarja grande (padrão Fábrica)
- [ ] Submenu Tickets com abas: Painel Tickets, Importações, Configurações, Pesquisar, Busca VDesk
- [ ] Permissão Tickets herda do HelpDesk
- [ ] Importação JSON restrita a Owner

#### 3.2 Navegação consistente
- [ ] Padronizar menus laterais por setor
- [ ] Garantir compatibilidade sem quebrar rotas existentes

### Fase 4 — Alertas por Setor
**Prioridade:** P2 | **Dependência:** Fase 1 (tabelas)

#### 4.1 Configuração de alertas
- [ ] UI por setor: ativar/desativar, escolher canal, condição, limiar
- [ ] Canais: email, webhook Telegram, webhook Teams
- [ ] Destinatários: somente usuários cadastrados (sem email livre)
- [ ] SMTP/credentials: somente Admin configura

#### 4.2 Visualização
- [ ] Último disparo, status do alerta
- [ ] Log de entregas

### Fase 5 — Kiosk Otimizado por Setor
**Prioridade:** P2 | **Dependência:** Fase 3

#### 5.1 Curadoria de indicadores por setor (TV)
- Fábrica: atividades sprint, aguardando teste, aviões
- Helpdesk: registros hoje, horas acumuladas, top 3 sistemas
- Comercial: total clientes, ativos vs inativos, pipeline
- CS: implantações ativas, fila, finalizadas
- Qualidade: PBIs monitorados, saúde (verde/amarelo/vermelho)
- Infraestrutura: itens em fila, prioridade, bloqueios

#### 5.2 Atualização automática
- [ ] Sincronizar com próxima coleta válida
- [ ] Indicador discreto de última atualização
- [ ] Evitar refresh agressivo

### Fase 6 — Setores com PRD Próprio
**Prioridade:** P3 | **Dependência:** Fases anteriores

#### 6.1 Comercial
- Já incluído na malha geral (sidebar, configurações, sync, healthcheck)
- PRD específico já implementado (dashboard, base de clientes, fila operacional)
- Alertas e Kiosk seguirão regras transversais

#### 6.2 Normalização de Dados Comerciais

##### Fonte 1 — Pesquisa de Satisfação de Clientes (Pesquisa_FLAG_Clientes)
- **Formato:** XLSX, aba única, ~80+ linhas
- **Colunas-chave para normalização:**
  - `Codigo Puxada` → ID único do cliente (mapeia para `vdesk_clients.id`)
  - `Cliente` → nome curto / apelido
  - `Razao Social` → razão social completa
  - `Bandeira` → Danone, DPA, Froneri, Nestlé, Heineken, Nespresso, Outros
  - `Status` → Ativo / Inativo / Bloqueado
  - `Cidade`, `UF` → localização geográfica
  - `Servidor Flag` → S1, S4, SX (infraestrutura de hospedagem)
  - Notas por produto (0-5): Flexx ERP, Decision, Avante Sales, Flexx Sales, Connect Sales, Flexx GPS, Flexx Go, Connect Merchan, Flexx Promo, Sofia IA
  - Campos qualitativos: "Pensou em trocar?", "Indicaria a Flag?", relatos livres
- **Regras de normalização:**
  - Notas "Sem Relato" / "NÃO USA" → null (não contabilizar na média)
  - Notas numéricas (0-5) → int, validar range
  - Respostas S/N → boolean
  - Bandeira: padronizar capitalização (ex: "DPA" → "DPA", "Danone" → "Danone")
  - Codigo Puxada: int, chave de cruzamento com vdesk_clients
- **Tabela destino sugerida:** `comercial_pesquisa_satisfacao`
  - Campos: id, cliente_id (FK vdesk_clients), bandeira, data_pesquisa, responsavel_contato, notas_por_produto (JSONB), qualitativo (JSONB), created_at

##### Fonte 2 — Acompanhamento Comercial (Comercial_Informação_IGOR)
- **Formato:** XLSX, múltiplas abas por ano (2021-2025+)
- **Duas tabelas por aba:**
  - **Perdas:** Quant, Data, Codigo, Cliente, Sistema, Bandeira/Marca, Motivo, Valor Mensal, Encerramento, Status
  - **Novos (Ganhos):** Quant, Data, Codigo, Cliente, Sistema, Bandeira/Marca, Valor Mensal
- **Regras de normalização:**
  - Data: formatos mistos (MM/YYYY, "jan/2025", "Out/24") → normalizar para ISO date (primeiro dia do mês)
  - Bandeira: padronizar ("HNK" → "Heineken", "NESTLÉ" / "NESTLE" → "Nestlé", "OUTROS" → "Outros", "GAROTO" → "Garoto", "DAN" → "Danone", "NESTLE / PURINA" → "Purina")
  - Sistema: normalizar ("SUITE FLEXX" / "Suite Flexx" → "Suite Flexx", "Flexxgps ME LEVA" → "Flexx GPS")
  - Valor Mensal: parse BRL (R$ X.XXX,XX) → numeric, considerar nulos
  - Status: "Bloqueado", "Cancelado", "Encerrado em DD/MM/YY", "Não formalizado" → enum normalizado
  - Codigo: int, chave de cruzamento com vdesk_clients
- **Tabela destino sugerida:** `comercial_movimentacao_clientes`
  - Campos: id, cliente_codigo, cliente_nome, tipo (perda/ganho), data_evento, sistema, bandeira, motivo, valor_mensal, status_encerramento, ano_referencia, created_at

##### Fonte 3 — Intelliwan CRM (screenshots de referência)
- **Dados externos (não importados diretamente):**
  - Vendas realizadas por cliente (bar chart horizontal por bandeira)
  - Venda total (deal value BRL) com variação percentual
  - Negócios ganhos por mês (bar chart mensal com meta de R$ 110K)
- **Uso no Hub:** referência visual para KPIs do Comercial
  - KPI: Venda Total do período → card grande com variação
  - KPI: Vendas por Cliente/Bandeira → gráfico horizontal
  - KPI: Negócios ganhos mês a mês → bar chart com meta
  - Filtro por período customizado (Q1 2026: jan-mar)
- **Nota:** dados de CRM poderão ser sincronizados via API futura; por ora, importação manual XLSX/CSV

##### Regras transversais de importação Comercial
- Importação via SectorImportArea (incremental ou expurgo)
- Validação de MIME: .xlsx, .xls, .csv
- Limite 10MB por arquivo
- Deduplicação por (cliente_codigo + data_evento + tipo) para movimentação
- Deduplicação por (cliente_id + data_pesquisa) para pesquisa satisfação
- Histórico de importações segregado por setor "comercial"
- Owner pode importar; leitura para demais roles

---

## Regras Transversais
- Segregação por tenant/network_id e RLS
- Segredos nunca no frontend
- Estados obrigatórios: loading, vazio, erro, sucesso, sem permissão
- Ações destrutivas exigem confirmação
- Frontend não é autoridade de permissão

---

## Security Validation Snapshot (DEV)
Status: in progress

Eliminado em DEV:
- Integration Credentials Exposure: select de hub_integrations restrito para admin em migration dedicada de DEV.
- Cron Secret RPC Exposure: get_cron_secret com guard admin server-side.
- Sync Functions Without Role Check: verificacao de role admin adicionada nas 6 funcoes de sync, mantendo fluxo cron por x-cron-secret.

Em andamento no codigo:
- Trust boundary de manual upload fechado no tree principal e no tree espelhado, com rejeicao 403 sem role backend adequada.
- CORS critico de manual upload saiu de wildcard e passou a depender de allowlist de origens.
- Baseline inicial de auth/hydration foi instrumentado no frontend para comparacao antes/depois.
- MFA para role elevada saiu do caminho critico de readiness e passou para verificacao adiada apos liberar a UI.

## Execution Lanes (legado — mantido para referência)

### Lane A - Security Refactors (Priority P0)
Status: in progress — items migrated to PRD Fase 2

### Lane B - Performance Refactors (Priority P1)
Status: in progress — items migrated to PRD Fase 1

### Lane C - Legacy/Cleanup Refactors (Priority P1/P2)
Status: planned

## Synchronization Rule (VS Code + Lovable)
Quando alterar arquitetura, authz, KPI load ou cleanup:
1. Atualizar este arquivo na mesma PR/commit.
2. Atualizar docs operacionais impactados em docs/.
3. Registrar status por lane/milestone: done, in progress, planned, postponed.
