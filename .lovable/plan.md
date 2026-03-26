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
- [ ] Reduzir refetchInterval agressivo (jobs: 30s → 60s, kiosk: preservar)
- [ ] refetchOnWindowFocus: false em queries pesadas
- Meta: 10 sessões simultâneas mínimo, margem para 12

#### 1.3 Toggles padronizados
- [x] Switch verde quando On, cinza quando Off (Radix Switch com data-[state=checked]:bg-primary)
- [ ] Garantir consistência visual em SectorSettings e SyncCentral

#### 1.4 Observabilidade de Jobs
- [ ] Exibir último run, status, próxima execução, erro resumido
- [ ] Badges de saúde: ativo, falhando, degradado
- [ ] Histórico mínimo operacional na Central de Sync

#### 1.5 Tabelas backend (Supabase)
- [ ] sector_health — status de saúde por setor/dependência
- [ ] alert_rules — regras de alerta por setor/KPI
- [ ] alert_channels — canais (email, telegram, teams)
- [ ] alert_deliveries — log de envios

### Fase 2 — Permissões e Visibilidade
**Prioridade:** P1 | **Dependência:** Fase 1

#### 2.1 Matriz de permissões
- [ ] Roles refinados: leitura, operacional, owner, admin
- [ ] Herança de permissão: HelpDesk → Tickets automático
- [ ] Bloqueio visual de ações sem permissão

#### 2.2 Usuário monitor
- [ ] monitor@flag.com.br: role operacional, somente leitura, somente Kiosk
- [ ] Exceção de MFA exclusiva deste usuário
- [ ] Sem acesso a importações, configurações ou administração

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
