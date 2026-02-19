

# FLAG Hub de Operacoes & Inteligencia Setorial

## Resumo

Reestruturar a plataforma atual (focada apenas em HelpDesk/Tickets) para se tornar um Hub multi-setorial com 7 setores independentes, cada um com seu dashboard, KPIs e area de importacao. O modulo HelpDesk existente sera preservado integralmente. Todos os novos setores usarao dados mock nesta fase.

---

## Fase 1 -- Fundacao (Estrutura base)

### 1.1 Pagina Welcome atualizada
- Titulo: "FLAG" / "Hub de Operacoes"
- Subtitulo: "Sistema de Automacoes e Dashboards Setoriais"
- Botao: "Acessar Sistema de Correlacao" com subtexto "Tickets <-> OS - v1.0.0"
- Manter visual Navy/Gold, tema claro

### 1.2 Pagina Home pos-login (nova rota `/home`)
- Grid de cards clicaveis (thumbs) para cada setor:
  - HelpDesk, Qualidade, Comercial, CustomerService, Infraestrutura, Programacao, Comunicacao
- Cada card exibe:
  - Icone do setor
  - Nome do setor
  - KPI principal (mock)
  - Ultima atualizacao
  - Indicador de conexao (quando aplicavel)
  - Badge UP/DOWN

### 1.3 Sidebar reestruturada
- Header: "FLAG" / "Hub de Operacoes"
- Menu:
  - "Dashboards" (link para `/home` - visao geral)
  - Separador "Setores"
  - Setores em ordem alfabetica (Comercial, Comunicacao, CustomerService, HelpDesk, Infraestrutura, Programacao, Qualidade)
  - Separador "Admin"
  - Usuarios, Configuracoes (admin only)
- Ao clicar em setor, navega para `/setor/{slug}`

### 1.4 Roteamento atualizado
- `/` -> Welcome (sem mudanca)
- `/login` -> Login (sem mudanca)
- `/home` -> Home pos-login (grid de setores)
- `/setor/helpdesk` -> Redireciona para `/dashboard` (modulo existente)
- `/setor/qualidade` -> Dashboard Qualidade
- `/setor/comercial` -> Dashboard Comercial
- `/setor/customer-service` -> Dashboard CustomerService
- `/setor/infraestrutura` -> Dashboard Infraestrutura
- `/setor/programacao` -> Dashboard Programacao
- `/setor/comunicacao` -> Dashboard Comunicacao
- `/dashboard`, `/tickets`, `/importacoes`, `/acompanhamento`, `/ticket-busca` -> Mantidos (HelpDesk)

---

## Fase 2 -- Dashboards Setoriais (todos com dados mock)

### 2.1 HelpDesk (sem alteracao)
Modulos existentes mantidos integralmente:
- Centro de Operacoes (Dashboard)
- Tickets
- Acompanhamento
- Importacoes

### 2.2 Qualidade
Baseado na referencia DASH_QUALIDADE.jpg:
- KPIs em cards dourados:
  - Total de OSs na fila (com breakdown Sistema A / Sistema B %)
  - Total OSs encerradas (com breakdown por sistema)
  - % de OSs Encerradas sem retorno (com breakdown)
- Indicadores de conexao: Vdesk, DevOps
- Revisao Atual: Sistema A e Sistema B (versao + data liberacao)
- Dados mock

### 2.3 Comercial
Baseado na referencia DASH_COMERCIAL.jpg:
- 4 blocos integrados:
  - Topo Executivo: Receita Q1, % meta atingida, forecast
  - Bloco Pipeline: Deals por etapa, valor por etapa (funil)
  - Bloco Clientes: Novos vs perdidos, motivos de churn
  - Bloco Satisfacao: NPS, alertas criticos
- Area de importacao XLSX
- Dados mock

### 2.4 CustomerService
Baseado nos dados do arquivo Fila_de_CS_Atualizado.xlsx:
- Visao Executiva: Total na fila, distribuicao por sistema, por responsavel
- Visao Operacional: Tabela com itens da fila (Id, Descricao, Fila, Resp, Sistema, Prioridade, Esforco, Acao, Tags)
- Indicadores de Performance: itens por prioridade, esforco total, distribuicao por acao (Descoberta, Criar EF, Retorno)
- Dados mock populados a partir da estrutura do XLSX

### 2.5 Infraestrutura
Baseado nas referencias DASH_INFRA_ACESSOS e DASH_INFRA_FATURAMENTO:
- Conexoes Ativas (numero grande) + graficos de barras horizontais:
  - Conexoes por Ambiente (S1, S4, S6, SX, Froneri)
  - Conexoes por Distribuidora
- Usuarios por distribuidor (tabela)
- Faturamento por ambiente (barras coloridas com valores em R$)
- Indicadores: Zabbix UP/DOWN, Banco UP/DOWN
- Dados mock

### 2.6 Programacao
Baseado nos dados do arquivo 03-Em_Fila_Backlog_para_Priorizar.csv:
- Estilo painel aeroporto (fundo escuro, fonte monospacada para dados)
- Categorias: Tasks, Bugs, Melhorias, Backlog
- Contadores por estado (New, Em desenvolvimento)
- Distribuicao por responsavel (Assigned To)
- Alertas animados para prioridade alta (Priority 0-1)
- Tabela com items do backlog
- Dados mock populados do CSV

### 2.7 Comunicacao
Baseado na referencia DASH_COMUNICACAO.jpg (estilo RD Station):
- KPIs topo: Emails enviados, Entregues, Aberturas unicas, Leads, Conversoes
- Tabela de emails: Nome, Data envio, Selecionados, Abertura %, Cliques %, Bounces %, Spam %, Descadastros %
- Filtros: Busca, Periodo, Filtros
- Dados mock

---

## Fase 3 -- Modo Kiosk Setorial

- Modo unico: cada setor tem seu proprio modo Kiosk (layout simplificado TV)
- Modo rotativo: alterna entre setores automaticamente
- Tempo configuravel (padrao 30s por setor)
- Botao "Modo TV" disponivel em cada dashboard setorial

---

## Fase 4 -- Importacoes por Setor

- Cada dashboard setorial tera um tab/botao "Importacoes"
- Area de upload (arrastar/soltar)
- Historico de importacoes do setor
- Indicador de ultima atualizacao
- Nesta fase: apenas UI, sem processamento real (mock)

---

## Detalhes Tecnicos

### Estrutura de arquivos novos

```text
src/
  pages/
    Home.tsx                          -- Grid de setores
    setores/
      QualidadeDashboard.tsx
      ComercialDashboard.tsx
      CustomerServiceDashboard.tsx
      InfraestruturaDashboard.tsx
      ProgramacaoDashboard.tsx
      ComunicacaoDashboard.tsx
  components/
    setores/
      SectorCard.tsx                  -- Card clicavel do grid
      SectorLayout.tsx                -- Layout wrapper (header + tabs)
      SectorKioskMode.tsx             -- Modo TV setorial
      SectorImportArea.tsx            -- Area de importacao generica
      qualidade/
        QualidadeKPICards.tsx
        QualidadeConexoes.tsx
      comercial/
        ComercialExecutivo.tsx
        ComercialPipeline.tsx
        ComercialClientes.tsx
        ComercialSatisfacao.tsx
      customer-service/
        CSVisaoExecutiva.tsx
        CSVisaoOperacional.tsx
        CSIndicadores.tsx
      infraestrutura/
        InfraConexoes.tsx
        InfraFaturamento.tsx
        InfraIndicadores.tsx
      programacao/
        ProgramacaoBoard.tsx
        ProgramacaoAlertas.tsx
      comunicacao/
        ComunicacaoKPIs.tsx
        ComunicacaoEmailTable.tsx
  data/
    mockSectorData.ts                 -- Dados mock de todos os setores
```

### Roteamento (App.tsx)
- Novas rotas protegidas dentro do MainLayout
- Rota `/home` como pagina inicial pos-login (redirect do Welcome atualizado)
- Rotas `/setor/:slug` para cada setor
- HelpDesk mantido nas rotas existentes (`/dashboard`, `/tickets`, etc.)

### Sidebar
- Reorganizada com secoes: Dashboards, Setores (alfabetico), Admin
- Icones por setor (Headphones -> HelpDesk, ShieldCheck -> Qualidade, TrendingUp -> Comercial, Users -> CustomerService, Server -> Infraestrutura, Code -> Programacao, Mail -> Comunicacao)
- Suporte a sub-rotas do HelpDesk (Dashboard, Tickets, Importacoes, Acompanhamento) como items aninhados

### Dados Mock
- Arquivo unico `mockSectorData.ts` com dados estruturados por setor
- Dados de CS baseados na estrutura real do XLSX fornecido
- Dados de Programacao baseados na estrutura real do CSV fornecido
- Demais setores com dados ficticios representativos

### Principios
- Nenhuma alteracao no modulo HelpDesk existente
- Sem criacao de backend/tabelas -- tudo frontend com mock
- Preparado para integracao futura com Supabase (interfaces tipadas)
- Visual corporativo, tema claro, foco em leitura rapida
- Componentes reutilizaveis (`SectorLayout`, `SectorCard`, etc.)

