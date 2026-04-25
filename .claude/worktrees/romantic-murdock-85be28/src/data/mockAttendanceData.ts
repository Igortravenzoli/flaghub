// Mock data para Acompanhamento de Atendimentos (UI-First)

export interface AgentTelephony {
  id: string;
  agentName: string;
  extension: string;
  direction: 'inbound' | 'outbound' | 'idle';
  state: 'LIVRE' | 'EM_CHAMADA' | 'NAO_ATENDIDA' | 'PAUSA';
  queue: string;
  loggedTime: number; // segundos
  answeredCalls: number;
  missedCalls: number;
  outboundCalls: number;
  talkTime: number; // segundos
  avgTalkTime: number; // segundos
  stateStartTime: Date;
}

export interface QueueTelephony {
  id: string;
  queueName: string;
  waitTime: number; // segundos
  phone: string;
  origin: string;
  priority: 'alta' | 'media' | 'baixa';
  entryTime: Date;
}

export interface ActiveAttendanceVdesk {
  id: string;
  consultor: string;
  loginConsultor: string;
  os: string;
  cliente: string;
  contato: string;
  meioContato: 'Telefone' | 'WhatsApp' | 'Email' | 'Chat' | 'Presencial';
  sistema: string;
  status: 'Em Atendimento' | 'Aguardando Retorno' | 'Em Análise';
  inicioAtendimento: Date;
  ramal?: string;
}

export interface ClosedAttendanceVdesk {
  id: string;
  consultor: string;
  os: string;
  cliente: string;
  sistema: string;
  tempoTotal: number; // segundos
  inicioAtendimento: Date;
  fimAtendimento: Date;
  statusFinal: 'Resolvido' | 'Encaminhado' | 'Pendente Cliente' | 'Cancelado';
}

export interface IntegrationHealth {
  vdesk: boolean;
  telephony: boolean;
}

// Dados mock de agentes de telefonia
export const mockAgentsTelephony: AgentTelephony[] = [
  {
    id: '1',
    agentName: 'Carlos Silva',
    extension: '1001',
    direction: 'inbound',
    state: 'EM_CHAMADA',
    queue: 'Suporte N1',
    loggedTime: 14400,
    answeredCalls: 23,
    missedCalls: 2,
    outboundCalls: 5,
    talkTime: 7200,
    avgTalkTime: 313,
    stateStartTime: new Date(Date.now() - 300000), // 5 min atrás
  },
  {
    id: '2',
    agentName: 'Maria Oliveira',
    extension: '1002',
    direction: 'idle',
    state: 'LIVRE',
    queue: 'Suporte N1',
    loggedTime: 12000,
    answeredCalls: 18,
    missedCalls: 1,
    outboundCalls: 3,
    talkTime: 5400,
    avgTalkTime: 300,
    stateStartTime: new Date(Date.now() - 60000),
  },
  {
    id: '3',
    agentName: 'João Santos',
    extension: '1003',
    direction: 'outbound',
    state: 'EM_CHAMADA',
    queue: 'Comercial',
    loggedTime: 18000,
    answeredCalls: 31,
    missedCalls: 0,
    outboundCalls: 12,
    talkTime: 9000,
    avgTalkTime: 280,
    stateStartTime: new Date(Date.now() - 180000),
  },
  {
    id: '4',
    agentName: 'Ana Costa',
    extension: '1004',
    direction: 'idle',
    state: 'PAUSA',
    queue: 'Suporte N2',
    loggedTime: 21600,
    answeredCalls: 15,
    missedCalls: 3,
    outboundCalls: 2,
    talkTime: 4500,
    avgTalkTime: 300,
    stateStartTime: new Date(Date.now() - 420000),
  },
  {
    id: '5',
    agentName: 'Pedro Lima',
    extension: '1005',
    direction: 'inbound',
    state: 'NAO_ATENDIDA',
    queue: 'Suporte N1',
    loggedTime: 10800,
    answeredCalls: 12,
    missedCalls: 4,
    outboundCalls: 1,
    talkTime: 3600,
    avgTalkTime: 300,
    stateStartTime: new Date(Date.now() - 30000),
  },
  {
    id: '6',
    agentName: 'Fernanda Souza',
    extension: '1006',
    direction: 'idle',
    state: 'LIVRE',
    queue: 'Comercial',
    loggedTime: 16200,
    answeredCalls: 20,
    missedCalls: 1,
    outboundCalls: 8,
    talkTime: 6000,
    avgTalkTime: 300,
    stateStartTime: new Date(Date.now() - 120000),
  },
];

// Dados mock de fila de telefonia
export const mockQueueTelephony: QueueTelephony[] = [
  {
    id: '1',
    queueName: 'Suporte N1',
    waitTime: 180,
    phone: '(11) 98765-4321',
    origin: 'Site',
    priority: 'alta',
    entryTime: new Date(Date.now() - 180000),
  },
  {
    id: '2',
    queueName: 'Suporte N1',
    waitTime: 120,
    phone: '(11) 91234-5678',
    origin: 'URA',
    priority: 'media',
    entryTime: new Date(Date.now() - 120000),
  },
  {
    id: '3',
    queueName: 'Comercial',
    waitTime: 60,
    phone: '(21) 99876-5432',
    origin: 'Retorno',
    priority: 'baixa',
    entryTime: new Date(Date.now() - 60000),
  },
];

// Dados mock de atendimentos ativos (Vdesk)
export const mockActiveAttendancesVdesk: ActiveAttendanceVdesk[] = [
  {
    id: '1',
    consultor: 'Carlos Silva',
    loginConsultor: 'carlos.silva',
    os: 'OS-2026-001234',
    cliente: 'Indústrias ABC Ltda',
    contato: 'Roberto Almeida',
    meioContato: 'Telefone',
    sistema: 'ERP Fiscal',
    status: 'Em Atendimento',
    inicioAtendimento: new Date(Date.now() - 300000),
    ramal: '1001',
  },
  {
    id: '2',
    consultor: 'João Santos',
    loginConsultor: 'joao.santos',
    os: 'OS-2026-001235',
    cliente: 'Comércio XYZ S.A.',
    contato: 'Mariana Costa',
    meioContato: 'WhatsApp',
    sistema: 'Portal Vendas',
    status: 'Em Atendimento',
    inicioAtendimento: new Date(Date.now() - 180000),
    ramal: '1003',
  },
  {
    id: '3',
    consultor: 'Luciana Ferreira',
    loginConsultor: 'luciana.ferreira',
    os: 'OS-2026-001236',
    cliente: 'Tech Solutions ME',
    contato: 'André Martins',
    meioContato: 'Email',
    sistema: 'CRM',
    status: 'Aguardando Retorno',
    inicioAtendimento: new Date(Date.now() - 600000),
  },
  {
    id: '4',
    consultor: 'Ricardo Mendes',
    loginConsultor: 'ricardo.mendes',
    os: 'OS-2026-001237',
    cliente: 'Distribuidora Norte',
    contato: 'Paula Ribeiro',
    meioContato: 'Telefone',
    sistema: 'WMS',
    status: 'Em Análise',
    inicioAtendimento: new Date(Date.now() - 900000),
  },
];

// Dados mock de atendimentos encerrados (Vdesk)
export const mockClosedAttendancesVdesk: ClosedAttendanceVdesk[] = [
  {
    id: '1',
    consultor: 'Maria Oliveira',
    os: 'OS-2026-001230',
    cliente: 'Empresa Beta',
    sistema: 'ERP Fiscal',
    tempoTotal: 1200,
    inicioAtendimento: new Date(Date.now() - 7200000),
    fimAtendimento: new Date(Date.now() - 6000000),
    statusFinal: 'Resolvido',
  },
  {
    id: '2',
    consultor: 'Carlos Silva',
    os: 'OS-2026-001229',
    cliente: 'Alpha Comercial',
    sistema: 'Portal Vendas',
    tempoTotal: 900,
    inicioAtendimento: new Date(Date.now() - 10800000),
    fimAtendimento: new Date(Date.now() - 9900000),
    statusFinal: 'Resolvido',
  },
  {
    id: '3',
    consultor: 'Ana Costa',
    os: 'OS-2026-001228',
    cliente: 'Mega Store',
    sistema: 'CRM',
    tempoTotal: 2400,
    inicioAtendimento: new Date(Date.now() - 14400000),
    fimAtendimento: new Date(Date.now() - 12000000),
    statusFinal: 'Encaminhado',
  },
  {
    id: '4',
    consultor: 'Pedro Lima',
    os: 'OS-2026-001227',
    cliente: 'Fast Delivery',
    sistema: 'WMS',
    tempoTotal: 600,
    inicioAtendimento: new Date(Date.now() - 18000000),
    fimAtendimento: new Date(Date.now() - 17400000),
    statusFinal: 'Pendente Cliente',
  },
  {
    id: '5',
    consultor: 'Fernanda Souza',
    os: 'OS-2026-001226',
    cliente: 'Global Tech',
    sistema: 'ERP Fiscal',
    tempoTotal: 1800,
    inicioAtendimento: new Date(Date.now() - 21600000),
    fimAtendimento: new Date(Date.now() - 19800000),
    statusFinal: 'Resolvido',
  },
];

// Estado da integração (mock)
export const mockIntegrationHealth: IntegrationHealth = {
  vdesk: true,
  telephony: true,
};

// Tipos para dados mesclados
export interface MergedAttendance {
  id: string;
  consultor: string;
  os?: string;
  cliente?: string;
  contato?: string;
  meioContato?: string;
  sistema?: string;
  status: string;
  tempoAtendimento: number;
  inicioAtendimento: Date;
  // Dados de telefonia (quando disponível)
  telephonyState?: 'LIVRE' | 'EM_CHAMADA' | 'NAO_ATENDIDA' | 'PAUSA';
  extension?: string;
  hasTelephonyMatch: boolean;
  hasVdeskData: boolean;
}

// Função de merge entre Vdesk e Telefonia
export function mergeAttendanceData(
  vdeskData: ActiveAttendanceVdesk[],
  telephonyData: AgentTelephony[]
): MergedAttendance[] {
  const merged: MergedAttendance[] = [];
  const matchedTelephonyIds = new Set<string>();

  // Primeiro, processar dados do Vdesk e tentar casar com telefonia
  vdeskData.forEach((vdesk) => {
    const telephonyMatch = telephonyData.find(
      (tel) =>
        tel.extension === vdesk.ramal ||
        tel.agentName.toLowerCase() === vdesk.consultor.toLowerCase()
    );

    if (telephonyMatch) {
      matchedTelephonyIds.add(telephonyMatch.id);
    }

    merged.push({
      id: vdesk.id,
      consultor: vdesk.consultor,
      os: vdesk.os,
      cliente: vdesk.cliente,
      contato: vdesk.contato,
      meioContato: vdesk.meioContato,
      sistema: vdesk.sistema,
      status: vdesk.status,
      tempoAtendimento: Math.floor((Date.now() - vdesk.inicioAtendimento.getTime()) / 1000),
      inicioAtendimento: vdesk.inicioAtendimento,
      telephonyState: telephonyMatch?.state,
      extension: telephonyMatch?.extension || vdesk.ramal,
      hasTelephonyMatch: !!telephonyMatch,
      hasVdeskData: true,
    });
  });

  // Adicionar agentes de telefonia que não têm match no Vdesk (apenas em chamada)
  telephonyData
    .filter((tel) => !matchedTelephonyIds.has(tel.id) && tel.state === 'EM_CHAMADA')
    .forEach((tel) => {
      merged.push({
        id: `tel-${tel.id}`,
        consultor: tel.agentName,
        status: 'Em Chamada (Telefonia)',
        tempoAtendimento: Math.floor((Date.now() - tel.stateStartTime.getTime()) / 1000),
        inicioAtendimento: tel.stateStartTime,
        telephonyState: tel.state,
        extension: tel.extension,
        hasTelephonyMatch: true,
        hasVdeskData: false,
      });
    });

  return merged;
}
