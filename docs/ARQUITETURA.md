# 🏗️ Arquitetura do Sistema de Correlação Ticket-OS

> Nota de alinhamento (2026-03-16): este documento descreve principalmente o modulo Ticket-OS.
> Para roadmap e evolucao do hub (Fases 1-4), consulte [.lovable/plan.md](../.lovable/plan.md).

## Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React + TypeScript)                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  Dashboard   │  │   Tickets    │  │  Correlação  │  ← Páginas   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                  │                       │
│         └──────────────────┼──────────────────┘                       │
│                            │                                          │
│  ┌─────────────────────────▼─────────────────────────┐              │
│  │         Hooks (React Query)                        │              │
│  │  ┌──────────────────┐  ┌─────────────────────┐   │              │
│  │  │ useTicketAnalysis│  │useTicketOSCorrelation│   │              │
│  │  └──────────────────┘  └─────────────────────┘   │              │
│  └─────────────────────────┬─────────────────────────┘              │
│                            │                                          │
│  ┌─────────────────────────▼─────────────────────────┐              │
│  │              Services                              │              │
│  │     ┌──────────────────────────────────┐          │              │
│  │     │  TicketOSCorrelationService      │          │              │
│  │     │  • correlateTicket()             │          │              │
│  │     │  • correlateTickets()            │          │              │
│  │     │  • getCorrelationMetrics()       │          │              │
│  │     │  • updateOSValidation()          │          │              │
│  │     └──────────────────────────────────┘          │              │
│  └─────────────────────────┬─────────────────────────┘              │
│                            │                                          │
└────────────────────────────┼──────────────────────────────────────────┘
                             │
                             │ HTTP/WebSocket
                             │
┌────────────────────────────▼──────────────────────────────────────────┐
│                    SUPABASE (Backend as a Service)                    │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                  PostgreSQL Database                          │   │
│  │                                                                │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐             │   │
│  │  │  networks  │  │  tickets   │  │  imports   │             │   │
│  │  │            │  │            │  │            │             │   │
│  │  │ id         │  │ id         │  │ id         │             │   │
│  │  │ name       │  │ network_id │  │ file_name  │  Tabelas    │   │
│  │  └────────────┘  │ ticket_id  │  │ status     │             │   │
│  │                  │ os_number  │  └────────────┘             │   │
│  │  ┌────────────┐  │ severity   │                             │   │
│  │  │ settings   │  │ has_os     │  ┌──────────────────┐      │   │
│  │  │            │  │ os_found   │  │ status_mapping   │      │   │
│  │  │ grace_hrs  │  └────────────┘  │                  │      │   │
│  │  └────────────┘                  │ external → int   │      │   │
│  │                                   └──────────────────┘      │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                       RPC Functions                           │   │
│  │                                                                │   │
│  │  get_tickets()                  - Busca tickets com filtros   │   │
│  │  get_dashboard_summary()        - Métricas consolidadas       │   │
│  │  get_correlation_stats()        - Estatísticas correlação    │   │
│  │  get_tickets_needing_os_validation() - Pendentes             │   │
│  │  batch_validate_os()            - Validação em lote          │   │
│  │  recalculate_ticket_severities() - Recalcula criticidade     │   │
│  │  get_inconsistency_report()     - Relatório de problemas     │   │
│  │  get_ticket_timeline()          - Histórico do ticket        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                  Row Level Security (RLS)                     │   │
│  │                                                                │   │
│  │  • Usuários veem apenas dados da sua network_id               │   │
│  │  • Admin vê todos os dados                                    │   │
│  │  • Gestão pode executar correlações                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
                             │
                             │ API (Futuro)
                             │
┌────────────────────────────▼──────────────────────────────────────────┐
│                        SISTEMAS EXTERNOS                               │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────────────────┐              ┌─────────────────────┐        │
│  │  ServiceNow (INC)   │              │   VDESK (OS)        │        │
│  │                     │              │                     │        │
│  │  • Tickets          │              │  • Ordens Serviço   │        │
│  │  • Incidentes       │              │  • Programadores    │        │
│  │  • Requisições      │              │  • Componentes      │        │
│  │                     │              │  • Histórico        │        │
│  └─────────────────────┘              └─────────────────────┘        │
│           │                                      │                     │
│           │ JSON/CSV Import                      │ CSV Import          │
│           │ (Manual/Webhook)                     │ (Manual)            │
│           └──────────────────┬───────────────────┘                     │
│                              │                                         │
└──────────────────────────────┼─────────────────────────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  CORRELAÇÃO ENGINE   │
                    │                      │
                    │  1. Importar dados   │
                    │  2. Normalizar       │
                    │  3. Correlacionar    │
                    │  4. Validar          │
                    │  5. Alertar          │
                    └──────────────────────┘
```

---

## Fluxo de Dados - Correlação

```
┌───────────────────────────────────────────────────────────────────┐
│                    FLUXO DE CORRELAÇÃO                             │
└───────────────────────────────────────────────────────────────────┘

1. IMPORTAÇÃO
   ┌──────────────┐
   │ Upload File  │  → JSON/CSV com tickets
   └──────┬───────┘
          │
          ▼
   ┌──────────────────────┐
   │ useImport Hook       │  → Parse e validação
   └──────┬───────────────┘
          │
          ▼
   ┌──────────────────────┐
   │ Supabase Insert      │  → Armazena em 'tickets'
   │ (via upsert)         │    com 'os_number'
   └──────┬───────────────┘
          │
          ▼

2. CORRELAÇÃO
   ┌───────────────────────────────┐
   │ correlationService            │
   │ .correlateTicket(ticketId)    │
   └──────┬────────────────────────┘
          │
          ▼
   ┌─────────────────────────────────────┐
   │ 1. Buscar ticket no DB              │
   │ 2. Verificar se tem os_number       │
   │ 3. Validar existência no VDESK      │
   │ 4. Calcular horasSemOS              │
   │ 5. Identificar inconsistências      │
   │ 6. Atualizar severity               │
   └──────┬──────────────────────────────┘
          │
          ▼
   ┌─────────────────────────────────┐
   │ Atualizar BD:                   │
   │ • os_found_in_vdesk = true/false│
   │ • severity = critico/atencao    │
   │ • inconsistency_code            │
   └──────┬──────────────────────────┘
          │
          ▼

3. VISUALIZAÇÃO
   ┌─────────────────────────────┐
   │ useTicketOSCorrelation Hook │
   └──────┬──────────────────────┘
          │
          ▼
   ┌─────────────────────────────┐
   │ React Query busca:          │
   │ • Métricas                  │
   │ • Tickets pendentes         │
   │ • Inconsistências           │
   └──────┬──────────────────────┘
          │
          ▼
   ┌─────────────────────────────┐
   │ Página Correlação           │
   │ • Dashboard visual          │
   │ • Tabelas interativas       │
   │ • Ações de validação        │
   └─────────────────────────────┘
```

---

## Estrutura de Componentes React

```
App.tsx
├── BrowserRouter
│   ├── Route: /login → Login.tsx
│   └── Route: MainLayout.tsx
│       ├── Sidebar.tsx
│       │   ├── NavLink: Dashboard
│       │   ├── NavLink: Tickets
│       │   ├── NavLink: Importações
│       │   ├── NavLink: Correlação ← NOVO
│       │   ├── NavLink: Usuários
│       │   └── NavLink: Configurações
│       │
│       └── Outlet (páginas)
│           ├── Route: / → Dashboard.tsx
│           │   ├── useTicketAnalysisDB()
│           │   ├── StatCard (4x)
│           │   └── TicketsTable
│           │
│           ├── Route: /tickets → Tickets.tsx
│           │   └── useTickets()
│           │
│           ├── Route: /importacoes → Importacoes.tsx
│           │   └── useImport()
│           │
│           ├── Route: /correlacao → Correlacao.tsx ← NOVO
│           │   ├── useTicketOSCorrelation()
│           │   ├── Tabs
│           │   │   ├── TabsContent: overview
│           │   │   │   ├── Card: Tickets com OS
│           │   │   │   └── Card: Tickets sem OS
│           │   │   ├── TabsContent: pending
│           │   │   │   └── Table: Tickets pendentes
│           │   │   └── TabsContent: inconsistencies
│           │   │       └── Table: Relatório
│           │   └── Métricas (4x Card)
│           │
│           ├── Route: /usuarios → Usuarios.tsx
│           └── Route: /configuracoes → Configuracoes.tsx
```

---

## Fluxo de Autenticação e Segurança

```
┌─────────────────────────────────────────────────────────┐
│                  AUTENTICAÇÃO                            │
└─────────────────────────────────────────────────────────┘

Login.tsx
    │
    ▼
Supabase Auth
    │
    ▼
┌───────────────────────────────┐
│ JWT Token + Session           │
│ • user_id (UUID)              │
│ • email                       │
└───────┬───────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│ Lookup em 'profiles'          │
│ • network_id                  │
│ • full_name                   │
└───────┬───────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│ Lookup em 'user_roles'        │
│ • role (operacional/admin)    │
└───────┬───────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────┐
│ RLS Policies aplicadas                        │
│                                               │
│ SELECT on tickets:                            │
│   WHERE network_id = auth_network_id()        │
│   OR is_admin()                               │
│                                               │
│ INSERT/UPDATE on tickets:                     │
│   WHERE is_admin_or_gestao()                  │
└───────────────────────────────────────────────┘
```

---

## Modelo de Dados - Relacionamentos

```
┌─────────────┐
│  networks   │
│             │
│ id ◄────────┼────────┐
│ name        │        │
└─────────────┘        │
                       │
                       │ FK: network_id
                       │
    ┌──────────────────┼──────────────────┐
    │                  │                  │
    │                  │                  │
┌───▼──────┐    ┌──────▼───┐    ┌────────▼─────┐
│ profiles │    │ tickets  │    │   imports    │
│          │    │          │    │              │
│ user_id  │    │ id       │    │ id           │
│ network  │    │ network  │    │ network_id   │
└──────────┘    │ ticket_id│◄───┤ file_name    │
                │ os_number│    │ total_records│
                │ severity │    └──────────────┘
                │ has_os   │
                │ os_found │    ┌───────────────┐
                └──────────┘    │ settings      │
                                │               │
                                │ network_id PK │
                                │ grace_hours   │
                                └───────────────┘

                ┌──────────────────┐
                │ status_mapping   │
                │                  │
                │ network_id       │
                │ external_status  │
                │ internal_status  │
                └──────────────────┘
```

---

## Ciclo de Vida de um Ticket

```
┌─────────────────────────────────────────────────────────────┐
│              CICLO DE VIDA DO TICKET                         │
└─────────────────────────────────────────────────────────────┘

1. CRIAÇÃO (ServiceNow)
   ┌──────────────────┐
   │ INC12345678      │  Estado: New
   │ opened_at: hoje  │  Prioridade: Standard
   │ os_number: null  │  Assigned: null
   └────────┬─────────┘
            │
            ▼

2. IMPORTAÇÃO (Sistema)
   ┌──────────────────────────────┐
   │ Upload JSON/CSV              │
   │ Parse → Validate → Insert    │
   └────────┬─────────────────────┘
            │
            ▼
   ┌──────────────────────────────┐
   │ Ticket salvo no BD           │
   │ • severity = 'atencao'       │
   │ • has_os = false             │
   │ • inconsistency = NO_OS...   │
   └────────┬─────────────────────┘
            │
            ▼

3. VINCULAÇÃO DE OS
   ┌──────────────────────────────┐
   │ Técnico cria OS no VDESK     │
   │ OS 754104 → INC12345678      │
   └────────┬─────────────────────┘
            │
            ▼
   ┌──────────────────────────────┐
   │ Reimportação/Update          │
   │ • os_number = '754104'       │
   │ • has_os = true              │
   │ • os_found = null            │
   └────────┬─────────────────────┘
            │
            ▼

4. CORRELAÇÃO
   ┌──────────────────────────────┐
   │ correlationService.validate()│
   └────────┬─────────────────────┘
            │
            ├─── OS encontrada no VDESK?
            │    ├─ SIM → severity = 'info'
            │    │        inconsistency = null
            │    │
            │    └─ NÃO → severity = 'critico'
            │             inconsistency = 'OS_NOT_FOUND'
            │
            ▼

5. MONITORAMENTO
   ┌──────────────────────────────┐
   │ Dashboard atualiza           │
   │ • Métricas em tempo real     │
   │ • Alertas para críticos      │
   │ • Relatórios automáticos     │
   └──────────────────────────────┘
```

---

## Tecnologias e Ferramentas

```
┌─────────────────────────────────────────────────────────┐
│                   STACK TECNOLÓGICO                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Frontend                                               │
│  ├─ React 18.3                                          │
│  ├─ TypeScript 5.6                                      │
│  ├─ Vite 5.4 (Build tool)                               │
│  ├─ React Router 7.1                                    │
│  ├─ React Query 5.83 (State management)                 │
│  ├─ Tailwind CSS 3.4                                    │
│  └─ shadcn/ui (Component library)                       │
│                                                          │
│  Backend                                                │
│  ├─ Supabase (BaaS)                                     │
│  ├─ PostgreSQL 14.1                                     │
│  ├─ PostgREST (Auto API)                                │
│  ├─ GoTrue (Auth)                                       │
│  └─ Realtime (WebSocket)                                │
│                                                          │
│  Desenvolvimento                                        │
│  ├─ ESLint 9                                            │
│  ├─ Vitest (Testing)                                    │
│  ├─ Git                                                 │
│  └─ VS Code                                             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

**Versão**: 1.0.0  
**Data**: 27 de Janeiro de 2026
