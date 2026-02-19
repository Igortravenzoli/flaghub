// Mock data for all sectors - FLAG Hub de Operações

export interface SectorInfo {
  slug: string;
  name: string;
  icon: string; // lucide icon name
  kpiLabel: string;
  kpiValue: string | number;
  lastUpdate: string;
  hasConnection?: boolean;
  connectionStatus?: 'up' | 'down';
  status: 'up' | 'down' | 'partial';
}

export const sectors: SectorInfo[] = [
  {
    slug: 'comercial',
    name: 'Comercial',
    icon: 'TrendingUp',
    kpiLabel: 'Receita Q1',
    kpiValue: 'R$ 4.2M',
    lastUpdate: '19/02/2026 09:30',
    status: 'up',
  },
  {
    slug: 'comunicacao',
    name: 'Comunicação',
    icon: 'Mail',
    kpiLabel: 'Emails enviados',
    kpiValue: '285',
    lastUpdate: '19/02/2026 09:10',
    status: 'up',
  },
  {
    slug: 'customer-service',
    name: 'Customer Service',
    icon: 'HeadphonesIcon',
    kpiLabel: 'Itens na fila',
    kpiValue: 38,
    lastUpdate: '19/02/2026 08:45',
    status: 'up',
  },
  {
    slug: 'helpdesk',
    name: 'HelpDesk',
    icon: 'Headphones',
    kpiLabel: 'Tickets ativos',
    kpiValue: 142,
    lastUpdate: '19/02/2026 09:15',
    hasConnection: true,
    connectionStatus: 'up',
    status: 'up',
  },
  {
    slug: 'infraestrutura',
    name: 'Infraestrutura',
    icon: 'Server',
    kpiLabel: 'Conexões ativas',
    kpiValue: 38,
    lastUpdate: '10/01/2025 07:16',
    hasConnection: true,
    connectionStatus: 'up',
    status: 'up',
  },
  {
    slug: 'programacao',
    name: 'Programação',
    icon: 'Code',
    kpiLabel: 'Backlog',
    kpiValue: 83,
    lastUpdate: '19/02/2026 08:00',
    status: 'partial',
  },
  {
    slug: 'qualidade',
    name: 'Qualidade',
    icon: 'ShieldCheck',
    kpiLabel: 'OSs na fila',
    kpiValue: 47,
    lastUpdate: '19/02/2026 09:00',
    hasConnection: true,
    connectionStatus: 'up',
    status: 'up',
  },
];

// ── Qualidade ──
export const qualidadeData = {
  osNaFila: { total: 47, sistemaA: 62, sistemaB: 38 },
  osEncerradas: { total: 183, sistemaA: 55, sistemaB: 45 },
  osEncerradasSemRetorno: { total: 12, sistemaA: 8, sistemaB: 4 },
  conexoes: { vdesk: 'up' as const, devops: 'up' as const },
  revisaoAtual: {
    sistemaA: { versao: '26.01.300', dataLiberacao: '09/02/2026' },
    sistemaB: { versao: '25.12.150', dataLiberacao: '20/01/2026' },
  },
};

// ── Comercial ──
export const comercialData = {
  executivo: {
    receitaQ1: 4200000,
    metaAtingida: 78,
    forecast: 5400000,
  },
  pipeline: [
    { etapa: 'Prospecção', deals: 45, valor: 1200000 },
    { etapa: 'Qualificação', deals: 32, valor: 980000 },
    { etapa: 'Proposta', deals: 18, valor: 750000 },
    { etapa: 'Negociação', deals: 12, valor: 620000 },
    { etapa: 'Fechamento', deals: 8, valor: 450000 },
  ],
  clientes: {
    novos: 23,
    perdidos: 5,
    motivosChurn: [
      { motivo: 'Preço', qtd: 2 },
      { motivo: 'Concorrência', qtd: 1 },
      { motivo: 'Insatisfação', qtd: 1 },
      { motivo: 'Outro', qtd: 1 },
    ],
  },
  satisfacao: {
    nps: 72,
    alertasCriticos: 3,
  },
};

// ── Customer Service ──
export interface CSItem {
  id: number;
  descricao: string;
  fila: string;
  resp: string;
  sistema: string;
  prioridade: number;
  esforco: number;
  acao: string;
  tags: string;
}

export const customerServiceData: CSItem[] = [
  { id: 8321, descricao: 'Ajustar tecla backspace nos campos de BIBLIOTECA E CHAT', fila: 'CS', resp: '', sistema: 'Flexx Merchan', prioridade: 4, esforco: 2, acao: 'Descoberta', tags: 'FLAG; FLEXXMERCHAN' },
  { id: 12790, descricao: 'Emissão de Documentos de Cobrança - data vencimento por data base', fila: 'CS', resp: 'Wilker', sistema: 'Flexx', prioridade: 3, esforco: 2, acao: 'Retorno', tags: 'FLEXX; MELHORIA' },
  { id: 8310, descricao: 'Descoberta Técnica - CNPJ 14 Posições Alfanumérico', fila: 'CS', resp: '', sistema: 'Flexx', prioridade: 3, esforco: 3, acao: 'Criar EF', tags: 'FLAG; FLEXX' },
  { id: 13092, descricao: 'Inclusão de Nova Regra para Liberação de Pedidos', fila: 'CS', resp: '', sistema: 'Flexx', prioridade: 0, esforco: 0, acao: 'Criar EF', tags: 'FLEXX; MELHORIA' },
  { id: 12647, descricao: 'HEISHOP - Loyalty - Customer Point Segmentation', fila: 'CS', resp: 'Diniz', sistema: 'Flexx', prioridade: 0, esforco: 0, acao: 'Criar EF', tags: 'ESCOPOPAGO; FLEXX' },
  { id: 12653, descricao: 'ROADMAP - Configurar Flexx LEAD no SUITEFLEXX', fila: 'CS', resp: '', sistema: 'Flexx Sales', prioridade: 0, esforco: 0, acao: 'Descoberta', tags: 'FLEXXSALES; ROADMAP2026' },
  { id: 12661, descricao: 'ROADMAP - Geração de Pedidos IA e Argumentação de Vendas', fila: 'CS', resp: '', sistema: 'Flexx Sales', prioridade: 0, esforco: 0, acao: 'Descoberta', tags: 'FLEXXSALES; ROADMAP2026' },
  { id: 12665, descricao: 'ROADMAP - Transferir Flexx GPS para Suite Flexx', fila: 'CS', resp: '', sistema: 'Flexx Gps', prioridade: 0, esforco: 0, acao: 'Descoberta', tags: 'FLEXXGPS; MELHORIA' },
  { id: 12721, descricao: 'Flexx Lead passar a ser multilíngua - Retorno KACE-IA', fila: 'CS', resp: '', sistema: 'Flexx Sales', prioridade: 0, esforco: 0, acao: 'Criar EF', tags: 'FLEXXSALES; MELHORIA' },
  { id: 12681, descricao: 'Cadastro de Promoções / Limite de promoções por mês e pedido', fila: 'CS', resp: 'Wilker', sistema: 'Flexx', prioridade: 0, esforco: 0, acao: 'Criar EF', tags: 'FLEXX; MELHORIA' },
  { id: 13277, descricao: 'Nova View Info - Dados de pesquisa de mercado', fila: 'CS', resp: 'Wilker', sistema: 'Flexx', prioridade: 0, esforco: 0, acao: 'Retorno', tags: 'FLEXX; MELHORIA' },
  { id: 13647, descricao: 'Flexx Lead - Novas informações para IS do Supervisor', fila: 'CS', resp: '', sistema: 'Flexx Sales', prioridade: 0, esforco: 0, acao: 'Descoberta', tags: 'FLEXXSALES; MELHORIA' },
];

// ── Infraestrutura ──
export const infraestruturaData = {
  conexoesAtivas: 38,
  ultimaAtualizacao: '10/01/2025 07:16:58',
  porAmbiente: [
    { ambiente: 'Ambiente S1', conexoes: 15 },
    { ambiente: 'Ambiente S6', conexoes: 10 },
    { ambiente: 'Ambiente S4', conexoes: 7 },
    { ambiente: 'Ambiente SX', conexoes: 5 },
    { ambiente: 'Ambiente Froneri', conexoes: 1 },
  ],
  porDistribuidora: [
    { distribuidora: 'Cagiu', conexoes: 4 },
    { distribuidora: 'Checon Matriz', conexoes: 3 },
    { distribuidora: 'Desenvolvedores', conexoes: 3 },
    { distribuidora: 'Cadisbel', conexoes: 2 },
    { distribuidora: 'Delta', conexoes: 2 },
    { distribuidora: 'Estacoes', conexoes: 2 },
    { distribuidora: 'MC Distribuidora', conexoes: 2 },
    { distribuidora: 'TI', conexoes: 2 },
    { distribuidora: 'Administradores', conexoes: 1 },
  ],
  faturamento: [
    { ambiente: 'SX', distribuidora: 'Dso 2 Consultoria', valor: 2280000 },
    { ambiente: 'SX', distribuidora: 'Mobel Moretto Distr.', valor: 376000 },
    { ambiente: 'SX', distribuidora: 'Lider Distribuidora', valor: 282000 },
    { ambiente: 'S1', distribuidora: 'Pedro Distribuidora', valor: 1050000 },
    { ambiente: 'S1', distribuidora: 'Cagiu Comercio', valor: 577000 },
    { ambiente: 'S4', distribuidora: 'RJR Comercio', valor: 319000 },
    { ambiente: 'S6', distribuidora: 'Checon Distribuidora', valor: 1620000 },
  ],
  indicadores: { zabbix: 'up' as const, banco: 'up' as const },
};

// ── Programação ──
export interface ProgramacaoItem {
  id: number;
  tipo: string;
  titulo: string;
  responsavel: string;
  estado: string;
  tags: string;
  prioridade: number;
  esforco: number;
}

export const programacaoData: ProgramacaoItem[] = [
  { id: 13488, tipo: 'Product Backlog Item', titulo: 'Analisar crescimento da pasta de imagens - limpeza', responsavel: 'Alessander Lantim', estado: 'Em desenvolvimento', tags: 'AVIAO; FLEXXGO', prioridade: 0, esforco: 1 },
  { id: 13556, tipo: 'Product Backlog Item', titulo: 'Integração distribuidor TOPFRIOS', responsavel: 'Alessander Lantim', estado: 'New', tags: 'FLEXX; MELHORIA', prioridade: 0, esforco: 1 },
  { id: 13562, tipo: 'Product Backlog Item', titulo: 'Limitar acessos simultâneos (RDP)', responsavel: 'Alessander Lantim', estado: 'New', tags: 'FLEXX; MELHORIA', prioridade: 1, esforco: 2 },
  { id: 10459, tipo: 'Product Backlog Item', titulo: 'Refatorar código das Pesquisas', responsavel: 'Alessander Lantim', estado: 'New', tags: 'CONNECTMERCHAN; MELHORIA', prioridade: 1, esforco: 4 },
  { id: 11264, tipo: 'Product Backlog Item', titulo: 'Pesquisa de Fachada Dashboard - modelo KACEI', responsavel: 'Alessander Lantim', estado: 'New', tags: 'BI; MELHORIA', prioridade: 1, esforco: 2 },
  { id: 9054, tipo: 'Product Backlog Item', titulo: 'Integração Pedidos Flexx com Guiramares (Dupont)', responsavel: 'Alessander Lantim', estado: 'New', tags: 'FLEXX', prioridade: 1, esforco: 3 },
  { id: 8401, tipo: 'Product Backlog Item', titulo: 'Vulnerabilidades - SuiteFlexX', responsavel: 'Alessander Lantim', estado: 'New', tags: 'FLAG; ISO27001', prioridade: 1, esforco: 4 },
  { id: 7216, tipo: 'Product Backlog Item', titulo: 'Vulnerabilidades - Merchan', responsavel: 'Alessander Lantim', estado: 'New', tags: 'FLAG; ISO27001', prioridade: 1, esforco: 4 },
  { id: 8460, tipo: 'Product Backlog Item', titulo: 'Refatorar telas Clientes, Produtos e Vendedor', responsavel: 'Alessander Lantim', estado: 'New', tags: 'FLAG; FLEXX; UX/UI', prioridade: 2, esforco: 5 },
  { id: 8535, tipo: 'Product Backlog Item', titulo: 'Geração Automática do Comercial 22', responsavel: 'Alessander Lantim', estado: 'New', tags: 'FLAG; FLEXX', prioridade: 2, esforco: 4 },
  { id: 8533, tipo: 'Product Backlog Item', titulo: 'QUICKONE NO DATA CENTER', responsavel: 'Alessander Lantim', estado: 'New', tags: 'FLAG; QUICKONEWEB', prioridade: 2, esforco: 5 },
  { id: 8315, tipo: 'Product Backlog Item', titulo: 'Modernização do Emissor CTE, NFE e MDF-e', responsavel: 'Alessander Lantim', estado: 'New', tags: 'FLAG; FLEXX; QUICKONE', prioridade: 2, esforco: 5 },
];

// ── Comunicação ──
export interface ComunicacaoEmail {
  nome: string;
  dataEnvio: string;
  selecionados: number;
  abertura: number;
  cliques: number;
  bounces: number;
  spam: number;
  descadastros: number;
}

export const comunicacaoData = {
  kpis: {
    emailsEnviados: 285,
    entregues: 94.2,
    aberturasUnicas: 32.5,
    leads: 1247,
    conversoes: 89,
  },
  emails: [
    { nome: 'Flag Informa | Liberação: Connect Sales | Versão: 2.5.2 [PROD]', dataEnvio: '19/02/2026 09:10', selecionados: 562, abertura: 14.93, cliques: 1.44, bounces: 1.07, spam: 0, descadastros: 0 },
    { nome: 'Flag Informa | Programação Carnaval 2026', dataEnvio: '14/02/2026 08:30', selecionados: 1173, abertura: 16.85, cliques: 0.52, bounces: 1.88, spam: 0, descadastros: 0.09 },
    { nome: 'Flag Informa | Novidades no FlexX GO [APP]', dataEnvio: '12/02/2026 11:45', selecionados: 7, abertura: 71.43, cliques: 14.29, bounces: 0, spam: 0, descadastros: 0 },
    { nome: 'Flag Informa | Liberação: Connect Sales | Versão: 2.5.2 [PA]', dataEnvio: '12/02/2026 09:01', selecionados: 113, abertura: 32.14, cliques: 3.57, bounces: 0.88, spam: 0, descadastros: 0 },
    { nome: 'Alerta de Segurança | Atualização obrigatória do Notepad++', dataEnvio: '11/02/2026 11:39', selecionados: 53, abertura: 62.26, cliques: 0, bounces: 0, spam: 0, descadastros: 0 },
    { nome: 'Parabéns, Ronald! Seu talento faz a diferença.', dataEnvio: '11/02/2026 08:00', selecionados: 53, abertura: 56.60, cliques: 0, bounces: 0, spam: 0, descadastros: 0 },
    { nome: 'Flag Informa | Agrupamento de pedidos para emissão de NF-e', dataEnvio: '09/02/2026 10:00', selecionados: 128, abertura: 28.91, cliques: 0, bounces: 0, spam: 0, descadastros: 0 },
    { nome: 'Flag Informa | Liberação de Revisão: Quick One DANFE | 26.01.300 [S6]', dataEnvio: '09/02/2026 10:00', selecionados: 128, abertura: 28.91, cliques: 4.69, bounces: 0, spam: 0, descadastros: 0 },
    { nome: 'Comunicado Interno | Atualização e Revogação de Senhas do Sistema de Alarme', dataEnvio: '09/02/2026 09:30', selecionados: 53, abertura: 58.49, cliques: 0, bounces: 0, spam: 0, descadastros: 0 },
    { nome: 'Flag Informa | Liberação de Revisão: Quick One DACTE | 25.12.300 - PROD', dataEnvio: '09/02/2026 08:00', selecionados: 585, abertura: 15.92, cliques: 1.37, bounces: 0.17, spam: 0, descadastros: 0 },
  ] as ComunicacaoEmail[],
};
