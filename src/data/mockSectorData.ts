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
    slug: 'customer-service',
    name: 'Customer Service',
    icon: 'LayoutGrid',
    kpiLabel: 'Em atuação CS',
    kpiValue: 25,
    lastUpdate: '19/02/2026 08:45',
    status: 'up',
  },
  {
    slug: 'fabrica',
    name: 'Fábrica',
    icon: 'Factory',
    kpiLabel: 'Backlog Sprint',
    kpiValue: 83,
    lastUpdate: '19/02/2026 08:00',
    hasConnection: true,
    connectionStatus: 'up',
    status: 'up',
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
  {
    slug: 'tickets_os',
    name: 'Tickets & OS',
    icon: 'Headphones',
    kpiLabel: 'Tickets ativos',
    kpiValue: 142,
    lastUpdate: '19/02/2026 09:15',
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
  revisaoAtual: {
    sistemaA: { versao: '26.01.300', dataLiberacao: '09/02/2026' },
    sistemaB: { versao: '25.12.150', dataLiberacao: '20/01/2026' },
  },
  // Dados por sistema (referência imagem Gestão à Vista)
  ordensAberto: 457,
  registroOsDia: 30,
  registroOsD1: 46,
  semReclamacaoAT: 0,
  semReclamacaoSIS: 0,
  porSistema: {
    desenvolvimento: [
      { sistema: 'Avante Sales', qtd: 2 },
      { sistema: 'Connect Merchan', qtd: 1 },
      { sistema: 'Connect Sales', qtd: 1 },
    ],
    backlog: [
      { sistema: 'Flexx', qtd: 40 },
      { sistema: 'Decision', qtd: 8 },
      { sistema: 'Avante Sales', qtd: 2 },
    ],
    teste: [
      { sistema: 'Avante Sales', qtd: 2 },
      { sistema: 'Decision', qtd: 8 },
      { sistema: 'Flexx', qtd: 40 },
    ],
  },
  faixaTempo: [
    { faixa: 'Menos de 30 dias', qtd: 228, pct: 52.66, cor: '#22c55e' },
    { faixa: '30+', qtd: 79, pct: 18.24, cor: '#3b82f6' },
    { faixa: '60+', qtd: 51, pct: 11.78, cor: '#eab308' },
    { faixa: '90+', qtd: 48, pct: 11.09, cor: '#f97316' },
    { faixa: '180+', qtd: 27, pct: 6.24, cor: '#ef4444' },
  ],
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

// CS KPIs extras
export const csKPIs = {
  executiva: { emAtuacao: 25, leadTimeMedio: 17, acima15Dias: 100, taxaRetrabalho: 15 },
  operacional: { semDtEntrega: 29, responsaveisAtivos: 3, filasAtivas: 2, backlog30Dias: 24 },
  performance: { throughputMedio: 4, leadTimeMedio: 17, backlogEnvelhecido: 100, taxaConclusao: 100 },
  demandasPorSprint: [
    { sprint: 'Sprint 1', finalizadas: 4 },
    { sprint: 'Sprint 2', finalizadas: 4 },
    { sprint: 'Sprint 3', finalizadas: 4 },
    { sprint: 'Sprint 4', finalizadas: 3 },
    { sprint: 'Sprint 5', finalizadas: 3 },
  ],
  volumePorSistema: [
    { sistema: 'Flexx', pct: 33 },
    { sistema: 'Flexx Sales', pct: 33 },
    { sistema: 'Flexx Promo', pct: 4 },
    { sistema: 'Decision', pct: 4 },
    { sistema: 'Flexx Lead', pct: 4 },
    { sistema: 'Suite Flexx', pct: 4 },
    { sistema: 'Flexx GO', pct: 8 },
    { sistema: 'Flexx Gps', pct: 4 },
    { sistema: 'Flexx Merchan', pct: 4 },
  ],
  filaPorResp: [
    { resp: 'Não atribuído', qtd: 20 },
    { resp: 'Wilker', qtd: 5 },
    { resp: 'Diniz', qtd: 1 },
  ],
  agingFila: [
    { faixa: '0-7 dias', qtd: 0 },
    { faixa: '8-15 dias', qtd: 0 },
    { faixa: '16-30 dias', qtd: 0 },
    { faixa: '30+ dias', qtd: 24 },
  ],
  throughputPorSprint: [
    { sprint: 'Sprint 1', valor: 4 },
    { sprint: 'Sprint 2', valor: 4 },
    { sprint: 'Sprint 3', valor: 4 },
    { sprint: 'Sprint 4', valor: 3 },
    { sprint: 'Sprint 5', valor: 3 },
  ],
  taxaConclusaoPorSprint: [
    { sprint: 'Sprint 1', taxa: 100 },
    { sprint: 'Sprint 2', taxa: 100 },
    { sprint: 'Sprint 3', taxa: 100 },
    { sprint: 'Sprint 4', taxa: 100 },
    { sprint: 'Sprint 5', taxa: 100 },
  ],
};

// ── Infraestrutura (now part of Fábrica) ──
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
  histogramaAcessos: [
    { hora: '00:00', acessos: 2 }, { hora: '01:00', acessos: 1 }, { hora: '02:00', acessos: 1 },
    { hora: '03:00', acessos: 0 }, { hora: '04:00', acessos: 1 }, { hora: '05:00', acessos: 3 },
    { hora: '06:00', acessos: 12 }, { hora: '07:00', acessos: 35 }, { hora: '08:00', acessos: 28 },
    { hora: '09:00', acessos: 22 }, { hora: '10:00', acessos: 18 }, { hora: '11:00', acessos: 16 },
    { hora: '12:00', acessos: 10 }, { hora: '13:00', acessos: 14 }, { hora: '14:00', acessos: 17 },
    { hora: '15:00', acessos: 19 }, { hora: '16:00', acessos: 32 }, { hora: '17:00', acessos: 38 },
    { hora: '18:00', acessos: 25 }, { hora: '19:00', acessos: 8 }, { hora: '20:00', acessos: 5 },
    { hora: '21:00', acessos: 3 }, { hora: '22:00', acessos: 2 }, { hora: '23:00', acessos: 1 },
  ],
};

// ── Programação (Sprint Tasks — now part of Fábrica) ──
export interface SprintTask {
  id: number;
  type: string;
  title: string;
  assignedTo: string;
  state: string;
  tags: string;
  iteration: string;
  parent: number;
}

export const sprintTasksData: SprintTask[] = [
  { id: 2733, type: 'Task', title: 'Padronizar rotinas de backup ambientes', assignedTo: 'Bruna B. de Oliveira', state: 'To Do', tags: 'INFRA', iteration: 'S4-2026', parent: 2700 },
  { id: 4630, type: 'Task', title: 'Gestão de Ativos (GLPI + OCS)', assignedTo: 'Bruna B. de Oliveira', state: 'In Progress', tags: 'MELHORIA', iteration: 'S4-2026', parent: 2700 },
  { id: 4640, type: 'Task', title: 'Validar Backups PVC - Merchan', assignedTo: 'Igor Cardoso Travenzoli', state: 'In Progress', tags: '', iteration: 'S4-2026', parent: 2700 },
  { id: 8141, type: 'Task', title: 'Rever e Comparar Subredes Portal IBM com o Firewall Juniper', assignedTo: 'Rodolfo F. Almeida', state: 'In Progress', tags: 'INFRA', iteration: 'S4-2026', parent: 2700 },
  { id: 11515, type: 'Task', title: 'Modificar a senha Porta Help Desk', assignedTo: 'Ronaldo V. de Souza', state: 'In Progress', tags: '', iteration: 'S4-2026', parent: 2700 },
  { id: 11580, type: 'Task', title: 'Realizar manutencao Note Anderson', assignedTo: 'Ronaldo V. de Souza', state: 'In Progress', tags: '', iteration: 'S4-2026', parent: 2700 },
  { id: 11751, type: 'Task', title: 'Verificando backups BAREVEEAM - FLAGCLOUD + PLANET', assignedTo: 'Bruna B. de Oliveira', state: 'In Progress', tags: '', iteration: 'S4-2026', parent: 2700 },
  { id: 12224, type: 'Task', title: 'Monitoramento SuiteFlexx/Merchan', assignedTo: 'Igor Cardoso Travenzoli', state: 'In Progress', tags: '', iteration: 'S4-2026', parent: 2700 },
  { id: 12408, type: 'Task', title: 'OS 747648 - Enviar push notification HeiShop', assignedTo: 'Marco Aurélio Pimenta', state: 'Done', tags: 'FLEXXGO; HEINEKEN; HEISHOP', iteration: 'S4-2026', parent: 12232 },
  { id: 12889, type: 'Task', title: 'OS 750364 - Validação Carga Cega', assignedTo: 'Carlos R. Alves', state: 'Done', tags: 'FLEXXGO', iteration: 'S4-2026', parent: 12887 },
  { id: 12994, type: 'Task', title: 'Estruturar PipeLine Froneri', assignedTo: 'Igor Cardoso Travenzoli', state: 'In Progress', tags: '', iteration: 'S4-2026', parent: 2700 },
  { id: 12995, type: 'Task', title: 'Efetuar expurgo merchan filestorage', assignedTo: '', state: 'In Progress', tags: '', iteration: 'S4-2026', parent: 2700 },
  { id: 13066, type: 'Task', title: 'O.S.: 752059 - Refazer Tela Inicial Flexx', assignedTo: 'Klélbio B. Miranda', state: 'In Progress', tags: 'TRANSBORDO', iteration: 'S4-2026', parent: 8488 },
  { id: 13282, type: 'Task', title: 'OS 752819 - Lentidão na importação', assignedTo: 'Klélbio B. Miranda', state: 'In Progress', tags: 'TRANSBORDO', iteration: 'S4-2026', parent: 13246 },
  { id: 13285, type: 'Task', title: 'OS 752826 - Análise segunda via boleto via app', assignedTo: 'Carlos Nunes', state: 'In Progress', tags: '', iteration: 'S4-2026', parent: 11468 },
  { id: 13326, type: 'Task', title: 'Ajustes para deploy', assignedTo: 'Johnny C. dos Santos', state: 'Done', tags: 'FLEXXGO', iteration: 'S4-2026', parent: 12232 },
  { id: 13352, type: 'Task', title: 'OS 753121 - Busca automática de cargas', assignedTo: 'Johnny C. dos Santos', state: 'In Progress', tags: 'FLEXXGO; RETORNO QA', iteration: 'S4-2026', parent: 13342 },
  { id: 13371, type: 'Task', title: 'OS 744948 - Integrar ao Flexx GPS', assignedTo: 'Fabiano Almeida', state: 'In Progress', tags: 'FLEXXGPS; RETORNO QA', iteration: 'S4-2026', parent: 11605 },
  { id: 13375, type: 'Task', title: 'Melhorar tela atual do Flexx Tools', assignedTo: 'José Zozimo', state: 'In Progress', tags: 'FLEXXTOOLS; STAGING', iteration: 'S4-2026', parent: 8493 },
  { id: 13378, type: 'Task', title: 'OS 752850 - DEVOPS Integração VDESK', assignedTo: 'Alex Amaral', state: 'In Progress', tags: 'STAGING', iteration: 'S4-2026', parent: 13337 },
  { id: 13391, type: 'Task', title: 'Segunda via boleto', assignedTo: 'Thyago Porto', state: 'In Progress', tags: 'FLEXXSALES; FLG; TRANSBORDO', iteration: 'S4-2026', parent: 4412 },
  { id: 13399, type: 'Task', title: 'Criar api para enviar base 64 boleto', assignedTo: 'José Zozimo', state: 'In Progress', tags: 'FLEXXSALES; FLG', iteration: 'S4-2026', parent: 4412 },
  { id: 13404, type: 'Task', title: 'OS 753402 - Layout Boleto QRCODE ITAÚ', assignedTo: 'Emerson L. Baldana', state: 'In Progress', tags: '', iteration: 'S4-2026', parent: 12772 },
  { id: 13408, type: 'Task', title: 'OS 753410 - Correção texto vdesk com IA', assignedTo: 'Carlos Nunes', state: 'In Progress', tags: 'TRANSBORDO', iteration: 'S4-2026', parent: 12950 },
  { id: 13493, type: 'Task', title: 'Instalar novo Servidor PLTSTGSQL', assignedTo: 'Rodolfo F. Almeida', state: 'In Progress', tags: '', iteration: 'S4-2026', parent: 2700 },
  { id: 13536, type: 'Task', title: 'Implantação Pronta Entrega - Planet', assignedTo: 'Rodolfo F. Almeida', state: 'In Progress', tags: '', iteration: 'S4-2026', parent: 2700 },
  { id: 13570, type: 'Task', title: 'OS 753254 - Carga finalizadas Flexx/FlexxGO', assignedTo: 'Johnny C. dos Santos', state: 'In Progress', tags: 'FLEXXGO', iteration: 'S4-2026', parent: 13568 },
  { id: 13698, type: 'Task', title: 'OS 754429 - Erro na importação XML', assignedTo: 'Elder Ribeiro', state: 'Done', tags: '', iteration: 'S4-2026', parent: 13693 },
  { id: 13706, type: 'Task', title: 'Resolução de Problemas Flag Geral - S3', assignedTo: 'Rodolfo F. Almeida', state: 'Done', tags: '', iteration: 'S4-2026', parent: 2700 },
  { id: 13715, type: 'Task', title: 'OS vdWork - HEISHOP B2B Customer Auto Registration', assignedTo: 'Anderson S. dos Santos', state: 'In Progress', tags: '', iteration: 'S4-2026', parent: 12648 },
  { id: 13725, type: 'Task', title: 'OS 740243 - Nova visão mapa relatório clientes', assignedTo: 'Fabiano Almeida', state: 'In Progress', tags: 'FLEXXGPS', iteration: 'S4-2026', parent: 11195 },
  { id: 13734, type: 'Task', title: 'OS 747648 - Push notification HeiShop', assignedTo: 'Carlos R. Alves', state: 'In Progress', tags: 'ESCOPOPAGO; FLEXXGO; PRIORIZACAO; TRANSBORDO', iteration: 'S4-2026', parent: 12232 },
  { id: 13770, type: 'Task', title: 'Correção busca endereço', assignedTo: 'Thyago Porto', state: 'In Progress', tags: 'CONNECTSALES; FLAG', iteration: 'S4-2026', parent: 13393 },
  { id: 13776, type: 'Task', title: 'OS 754969 Erro processamento Carga', assignedTo: 'Emerson L. Baldana', state: 'To Do', tags: 'BUG; TRANSBORDO', iteration: 'S4-2026', parent: 13771 },
  { id: 13780, type: 'Task', title: 'OS 742990 - Agrupamento Boletos emissão conjunta', assignedTo: 'Carlos Nunes', state: 'In Progress', tags: 'RETORNO QA', iteration: 'S4-2026', parent: 9951 },
  { id: 13790, type: 'Task', title: 'Corrigir regra negócio validação multiplo', assignedTo: 'Thyago Porto', state: 'In Progress', tags: 'FLAG; FLEXXSALES', iteration: 'S4-2026', parent: 13789 },
  { id: 13828, type: 'Task', title: 'Fazer Front-end do layout', assignedTo: 'Ronald E. Carvalho', state: 'In Progress', tags: 'FLAG; FLEXXSALES', iteration: 'S4-2026', parent: 8479 },
  { id: 13908, type: 'Task', title: 'OS 756027 - Desconto FDS', assignedTo: 'Anderson S. dos Santos', state: 'To Do', tags: 'AVANTESALES; HEINEKEN; HEISHOP', iteration: 'S4-2026', parent: 13650 },
  { id: 13950, type: 'Task', title: 'OS 756035 - Erro prestação de conta', assignedTo: 'Elder Ribeiro', state: 'To Do', tags: 'BUG; FLEXX', iteration: 'S4-2026', parent: 13937 },
  { id: 13951, type: 'Task', title: 'OS 756040 - Importação RF', assignedTo: 'Anderson S. dos Santos', state: 'To Do', tags: 'BUG; FLEXX', iteration: 'S4-2026', parent: 13944 },
  { id: 13956, type: 'Task', title: 'OS 756050 - Opção excluir carga não ativa', assignedTo: 'Johnny C. dos Santos', state: 'To Do', tags: 'FLEXXGO', iteration: 'S4-2026', parent: 13953 },
];

// Keep old programacaoData for backward compat
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

// ── Comunicação (now part of Produtos) ──
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
