// Tipos baseados nos dados reais Nestlé + VDESK

// Ticket Nestlé (ServiceNow) - Incidente ou Requisição
export interface TicketNestle {
  number: string;               // INC22852384 ou RITM06140280
  opened_at: string;           // "27-01-2026 10:51"
  short_description: string;   // Descrição do ticket
  caller_id: string;           // Solicitante
  due_date: string;            // Data limite
  priority: string;            // "5 - Standard"
  state: string;               // "New", "On Hold", "In Progress"
  category: string;            // "Failure"
  assignment_group: string;    // "BR_ECOMMERCE_FLAG"
  assigned_to: string;         // Responsável
  sys_updated_on: string;      // Última atualização
  type: 'incident' | 'request';
}

// OS VDESK (Sistema interno)
export interface OrdemServico {
  cliente: string;              // Apeli_At
  bandeira: 'Nestlé' | 'Heineken' | 'DPA' | 'Garoto' | 'Danone' | 'Brahma' | 'Pakera' | 'Nespresso' | 'Froneri' | 'Outros';
  programador: string;          // Funrpsos_
  os: string;                   // NUMOS_ - ex: "754104"
  ticketNestle: string;         // NumChamadoB1_At - INC ou RITM
  sequencia: number;            // IntSeqRealizacao
  dataRegistro: string;         // Data_At
  sistema: string;              // Descr_Sis - ex: "Visual Desk", "Flexx"
  componente: string;           // Programa
  descricao: string;            // Descricao do programa
  descricaoOS: string;          // DUVIDA
  previsao: string | null;      // DataPrevEnt_De
  dataHistorico: string | null; // MAX(Dathorhtros_)
  previsaoMinutos: string;      // Tempo formatado
  tipoChamado: string;          // ERROPADRAO - "Preventiva", "Problema"
  criticidade: string | null;   // CODCRITICIDADE
  retorno: 'Sim' | 'Não' | '';  // RetErrOS_
}

// Status normalizado para o sistema
export type StatusNormalizado = 
  | 'novo'
  | 'em_andamento'
  | 'aguardando'
  | 'resolvido'
  | 'fechado'
  | 'nao_mapeado';

// Severidade do ticket
export type Severidade = 'critical' | 'warning' | 'info' | 'success';

// Ticket consolidado (com análise de vinculação)
export interface TicketConsolidado {
  ticket: TicketNestle;
  osVinculada: OrdemServico | null;
  osMultiplas?: OrdemServico[];
  statusNormalizado: StatusNormalizado;
  severidade: Severidade;
  horasSemOS: number | null;
  inconsistencias: string[];
  vdeskPayload?: any[] | null;
}

// Importação de arquivo
export interface ImportacaoArquivo {
  id: string;
  dataHora: string;
  usuario: string;
  tipo: 'CSV' | 'JSON';
  fonte: 'nestle' | 'vdesk';
  quantidadeRegistros: number;
  status: 'sucesso' | 'erro' | 'processando';
  mensagemErro?: string;
}

// Usuário do sistema
export interface Usuario {
  id: string;
  nome: string;
  email: string;
  papel: 'Operacional' | 'Gestão' | 'Qualidade' | 'Admin';
  redeAssociada: string;
  ativo: boolean;
}

// Mapeamento de status
export interface MapeamentoStatus {
  statusExterno: string;
  statusInterno: StatusNormalizado;
}

// Configurações do sistema
export interface Configuracoes {
  prazoTicketSemOS: number; // horas
  mapeamentosStatus: MapeamentoStatus[];
}

// Estatísticas do dashboard
export interface EstatisticasDashboard {
  totalTickets: number;
  ticketsOK: number;
  ticketsSemOS: number;
  ticketsObservacao: number;
  ticketsPorSeveridade: Record<Severidade, number>;
}
