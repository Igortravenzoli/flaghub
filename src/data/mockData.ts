// Mock data para fallback quando não autenticado ou sem dados no banco
import { 
  TicketNestle, 
  OrdemServico, 
  MapeamentoStatus, 
  ImportacaoArquivo,
  Usuario,
  StatusNormalizado 
} from '@/types';

// Tickets mock
export const mockTicketsNestle: TicketNestle[] = [
  {
    number: 'INC0012345',
    opened_at: '27-01-2026 10:51',
    short_description: 'Sistema não carrega tela de pedidos',
    state: 'Work in Progress',
    assigned_to: 'João Silva',
    type: 'incident',
    priority: '2',
    caller_id: 'Maria Santos',
    due_date: '30-01-2026',
    category: 'Failure',
    assignment_group: 'BR_ECOMMERCE_FLAG',
    sys_updated_on: '27-01-2026 11:00'
  },
  {
    number: 'INC0012346',
    opened_at: '26-01-2026 14:30',
    short_description: 'Erro ao gerar relatório de vendas',
    state: 'New',
    assigned_to: '',
    type: 'incident',
    priority: '1',
    caller_id: 'Carlos Oliveira',
    due_date: '28-01-2026',
    category: 'Failure',
    assignment_group: 'BR_ECOMMERCE_FLAG',
    sys_updated_on: '26-01-2026 14:30'
  },
  {
    number: 'RITM0054321',
    opened_at: '25-01-2026 09:00',
    short_description: 'Solicitar acesso ao sistema SAP',
    state: 'Awaiting User Info',
    assigned_to: 'Ana Costa',
    type: 'request',
    priority: '3',
    caller_id: 'Pedro Lima',
    due_date: '01-02-2026',
    category: 'Request',
    assignment_group: 'BR_ECOMMERCE_FLAG',
    sys_updated_on: '25-01-2026 10:00'
  },
  {
    number: 'INC0012347',
    opened_at: '24-01-2026 16:45',
    short_description: 'Tela de login travando',
    state: 'Resolved',
    assigned_to: 'João Silva',
    type: 'incident',
    priority: '2',
    caller_id: 'Fernanda Souza',
    due_date: '26-01-2026',
    category: 'Failure',
    assignment_group: 'BR_ECOMMERCE_FLAG',
    sys_updated_on: '25-01-2026 12:00'
  },
  {
    number: 'INC0012348',
    opened_at: '20-01-2026 08:00',
    short_description: 'Integração com ERP falhou',
    state: 'Work in Progress',
    assigned_to: 'Carlos Tech',
    type: 'incident',
    priority: '1',
    caller_id: 'Roberto Alves',
    due_date: '22-01-2026',
    category: 'Failure',
    assignment_group: 'BR_ECOMMERCE_FLAG',
    sys_updated_on: '21-01-2026 15:00'
  }
];

// Ordens de Serviço mock (vinculadas aos tickets)
export const mockOrdensServico: OrdemServico[] = [
  {
    cliente: 'Nestlé',
    bandeira: 'Nestlé',
    programador: 'Dev Team A',
    os: 'OS202601001',
    ticketNestle: 'INC0012345',
    sequencia: 1,
    dataRegistro: '27-01-2026',
    sistema: 'Portal Vendas',
    componente: 'PV001',
    descricao: 'Correção de carregamento',
    descricaoOS: 'Ajuste no carregamento da tela de pedidos',
    previsao: '30-01-2026',
    dataHistorico: '27-01-2026 14:00',
    previsaoMinutos: '04:00',
    tipoChamado: 'Problema',
    criticidade: '2',
    retorno: 'Não'
  },
  {
    cliente: 'Nestlé',
    bandeira: 'Nestlé',
    programador: 'Infra Team',
    os: 'OS202601002',
    ticketNestle: 'RITM0054321',
    sequencia: 1,
    dataRegistro: '25-01-2026',
    sistema: 'SAP',
    componente: 'AC001',
    descricao: 'Configuração de acesso',
    descricaoOS: 'Liberação de acesso ao módulo SAP',
    previsao: '28-01-2026',
    dataHistorico: '25-01-2026 10:00',
    previsaoMinutos: '02:00',
    tipoChamado: 'Preventiva',
    criticidade: '3',
    retorno: 'Não'
  },
  {
    cliente: 'Nestlé',
    bandeira: 'Nestlé',
    programador: 'Dev Team B',
    os: 'OS202601003',
    ticketNestle: 'INC0012347',
    sequencia: 1,
    dataRegistro: '24-01-2026',
    sistema: 'Auth Service',
    componente: 'AU001',
    descricao: 'Fix de sessão',
    descricaoOS: 'Correção de timeout na sessão',
    previsao: '25-01-2026',
    dataHistorico: '25-01-2026 11:00',
    previsaoMinutos: '01:30',
    tipoChamado: 'Problema',
    criticidade: '2',
    retorno: 'Sim'
  }
];

// Mapeamentos de status padrão
export const defaultMapeamentosStatus: MapeamentoStatus[] = [
  { statusExterno: 'New', statusInterno: 'novo' },
  { statusExterno: 'Work in Progress', statusInterno: 'em_andamento' },
  { statusExterno: 'Awaiting User Info', statusInterno: 'aguardando' },
  { statusExterno: 'Resolved', statusInterno: 'resolvido' },
  { statusExterno: 'Closed', statusInterno: 'fechado' },
  { statusExterno: 'On Hold', statusInterno: 'aguardando' },
  { statusExterno: 'Pending', statusInterno: 'aguardando' },
];

// Configurações padrão
export const defaultConfiguracoes = {
  prazoTicketSemOS: 24, // horas
  mapeamentosStatus: defaultMapeamentosStatus,
};

// Histórico de importações mock
export const mockImportacoes: ImportacaoArquivo[] = [
  {
    id: '1',
    dataHora: '27/01/2026 10:30:00',
    usuario: 'Admin',
    tipo: 'JSON',
    fonte: 'nestle',
    quantidadeRegistros: 156,
    status: 'sucesso'
  },
  {
    id: '2',
    dataHora: '26/01/2026 15:45:00',
    usuario: 'Gestao User',
    tipo: 'CSV',
    fonte: 'nestle',
    quantidadeRegistros: 89,
    status: 'sucesso'
  },
  {
    id: '3',
    dataHora: '25/01/2026 09:00:00',
    usuario: 'Admin',
    tipo: 'JSON',
    fonte: 'vdesk',
    quantidadeRegistros: 45,
    status: 'erro',
    mensagemErro: 'Formato de data inválido em 3 registros'
  }
];

// Usuários mock
export const mockUsuarios: Usuario[] = [
  {
    id: '1',
    nome: 'Administrador',
    email: 'admin@empresa.com',
    papel: 'Admin',
    redeAssociada: 'Nestlé BR',
    ativo: true
  },
  {
    id: '2',
    nome: 'Maria Gestora',
    email: 'maria.gestora@empresa.com',
    papel: 'Gestão',
    redeAssociada: 'Nestlé BR',
    ativo: true
  },
  {
    id: '3',
    nome: 'João Operador',
    email: 'joao.operador@empresa.com',
    papel: 'Operacional',
    redeAssociada: 'Nestlé BR',
    ativo: true
  },
  {
    id: '4',
    nome: 'Ana Qualidade',
    email: 'ana.qualidade@empresa.com',
    papel: 'Qualidade',
    redeAssociada: 'Nestlé BR',
    ativo: false
  }
];
