import { useMemo, useState, useCallback } from 'react';
import { useTickets, useDashboardSummary, useSettings, useStatusMappings, useResolvedAreaNetwork } from './useSupabaseData';
import { useAuth } from './useAuth';
import type { DBTicket, InternalStatus, TicketSeverity } from '@/types/database';
import type { 
  TicketConsolidado, 
  Severidade, 
  StatusNormalizado,
  EstatisticasDashboard,
  TicketNestle,
  OrdemServico
} from '@/types';

// Mapear severidade do DB para UI
function mapSeverity(dbSeverity: TicketSeverity): Severidade {
  const map: Record<TicketSeverity, Severidade> = {
    critico: 'critical',
    atencao: 'warning',
    info: 'info',
  };
  return map[dbSeverity] || 'info';
}

// Mapear status interno do DB para UI
function mapStatus(dbStatus: InternalStatus | null): StatusNormalizado {
  if (!dbStatus) return 'nao_mapeado';
  const map: Record<InternalStatus, StatusNormalizado> = {
    novo: 'novo',
    em_atendimento: 'em_andamento',
    em_analise: 'aguardando',
    finalizado: 'resolvido',
    cancelado: 'fechado',
  };
  return map[dbStatus] || 'nao_mapeado';
}

function hasLinkedOS(ticket: DBTicket): boolean {
  const hasPayloadOS = Array.isArray(ticket.vdesk_payload)
    && ticket.vdesk_payload.some((item) => Boolean(item?.os));

  return ticket.os_found_in_vdesk === true
    || Boolean(ticket.os_number?.trim())
    || hasPayloadOS
    || ticket.has_os === true;
}

// Converter DBTicket para formato legado da UI
function dbTicketToLegacy(ticket: DBTicket): { ticket: TicketNestle; os: OrdemServico | null; osMultiplas: OrdemServico[] } {
  const rawPayload = ticket.raw_payload as Record<string, string> || {};
  const vdeskData = ticket.vdesk_payload as any[] | null;
  
  // Resolve assigned_to: prefer VDesk programador over ServiceNow sys_id
  const rawAssignedTo = ticket.assigned_to || '';
  const isHexSysId = /^[0-9a-f]{32}$/i.test(rawAssignedTo);
  const vdeskProgramador = vdeskData?.[vdeskData.length - 1]?.programador;
  const resolvedAssignedTo = (isHexSysId || !rawAssignedTo) && vdeskProgramador
    ? vdeskProgramador
    : rawAssignedTo;

  // Extrair dados do ticket Nestlé do raw_payload
  const ticketNestle: TicketNestle = {
    number: ticket.ticket_external_id,
    opened_at: ticket.opened_at 
      ? new Date(ticket.opened_at).toLocaleString('pt-BR', { 
          day: '2-digit', month: '2-digit', year: 'numeric', 
          hour: '2-digit', minute: '2-digit' 
        }).replace(',', '')
      : '',
    short_description: rawPayload.short_description || '',
    caller_id: rawPayload.caller_id || '',
    due_date: rawPayload.due_date || '',
    priority: rawPayload.priority || '5 - Standard',
    state: ticket.external_status || '',
    category: rawPayload.category || '',
    assignment_group: rawPayload.assignment_group || 'BR_ECOMMERCE_FLAG',
    assigned_to: resolvedAssignedTo,
    sys_updated_on: ticket.updated_at 
      ? new Date(ticket.updated_at).toLocaleString('pt-BR', { 
          day: '2-digit', month: '2-digit', year: 'numeric', 
          hour: '2-digit', minute: '2-digit' 
        }).replace(',', '')
      : '',
    type: (ticket.ticket_type === 'incident' ? 'incident' : ticket.ticket_type === 'problem' ? 'problem' : 'request') as 'incident' | 'request' | 'problem',
  };

  // Construir OS a partir do vdesk_payload (dados completos) ou fallback
  let osVinculada: OrdemServico | null = null;
  const osMultiplas: OrdemServico[] = [];

  if (hasLinkedOS(ticket)) {
    if (vdeskData && vdeskData.length > 0) {
      // Usar dados completos do VDESK
      vdeskData.forEach((vd: any) => {
        osMultiplas.push({
          cliente: vd.cliente || '',
          bandeira: vd.bandeira || 'Nestlé',
          programador: vd.programador || '',
          os: vd.os || ticket.os_number || '',
          ticketNestle: vd.ticketNestle || ticket.ticket_external_id,
          sequencia: vd.sequencia || 1,
          dataRegistro: vd.dataRegistro || '',
          sistema: vd.sistema || '',
          componente: vd.componente || '',
          descricao: vd.descricao || '',
          descricaoOS: vd.descricaoOS || '',
          previsao: vd.previsao || null,
          dataHistorico: vd.dataHistorico || null,
          previsaoMinutos: vd.previsaoMinutos || '',
          tipoChamado: vd.tipoChamado || '',
          criticidade: vd.criticidade || null,
          retorno: vd.retorno || '',
        });
      });
      osVinculada = osMultiplas[0];
    } else {
      // Fallback: dados básicos
      osVinculada = {
        cliente: rawPayload.os_cliente || '',
        bandeira: 'Nestlé',
        programador: '',
        os: ticket.os_number,
        ticketNestle: ticket.ticket_external_id,
        sequencia: 1,
        dataRegistro: '',
        sistema: rawPayload.os_sistema || 'Visual Desk',
        componente: rawPayload.os_componente || '',
        descricao: '',
        descricaoOS: ticket.last_os_event_desc || '',
        previsao: null,
        dataHistorico: ticket.last_os_event_at || null,
        previsaoMinutos: '',
        tipoChamado: 'Preventiva',
        criticidade: null,
        retorno: '',
      };
    }
  }

  return { ticket: ticketNestle, os: osVinculada, osMultiplas };
}

// Calcular horas sem OS
function calcularHorasSemOS(openedAt: string | null): number | null {
  if (!openedAt) return null;
  const opened = new Date(openedAt);
  const now = new Date();
  const diffMs = now.getTime() - opened.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60));
}

// Identificar inconsistências
function getInconsistencias(ticket: DBTicket, noOsGraceHours: number): string[] {
  const inconsistencias: string[] = [];
  
  if (ticket.inconsistency_code) {
    const codes: Record<string, string> = {
      'NO_OPENED_AT': 'Data de abertura não informada',
      'UNKNOWN_STATUS': `Status "${ticket.external_status}" não mapeado`,
      'NO_OS_OVERDUE': `Ticket sem OS há mais de ${noOsGraceHours}h (crítico)`,
      'NO_OS_WITHIN_GRACE': `Ticket sem OS (dentro do prazo de ${noOsGraceHours}h)`,
      'OS_NOT_FOUND': `OS ${ticket.os_number} não encontrada no VDESK`,
      'DUPLICATE': 'Ticket duplicado',
    };
    inconsistencias.push(codes[ticket.inconsistency_code] || ticket.inconsistency_code);
  }
  
  const rawPayload = ticket.raw_payload as Record<string, string> || {};
  if (!rawPayload.short_description?.trim()) {
    inconsistencias.push('Ticket sem descrição');
  }
  
  if (!ticket.assigned_to && ticket.internal_status !== 'novo') {
    inconsistencias.push('Ticket em andamento sem responsável');
  }
  
  return inconsistencias;
}

export function useTicketAnalysisDB() {
  const { networkId, isLoading: authLoading, isAdmin, isAuthenticated } = useAuth();

  // Permitir query assim que autenticado (RLS cuida do filtro por network).
  // Para SSO sem networkId, o RPC get_tickets agora faz fallback via hub_resolve_area_network_id.
  const canQueryTickets = !authLoading && isAuthenticated;
  const { data: areaNetworkId, isLoading: areaNetworkLoading } = useResolvedAreaNetwork('tickets_os', {
    enabled: canQueryTickets,
  });
  const effectiveNetworkId = areaNetworkId ?? (!areaNetworkLoading ? networkId ?? undefined : undefined);
  const canRunNetworkQueries = canQueryTickets && !areaNetworkLoading && effectiveNetworkId !== undefined;

  const { data: tickets = [], isLoading: ticketsLoading, refetch: refetchTickets } = useTickets(
    {
      networkId: effectiveNetworkId,
      limit: 100,
    },
    { enabled: canRunNetworkQueries }
  );

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useDashboardSummary(
    effectiveNetworkId,
    { enabled: canRunNetworkQueries }
  );

   const { data: settings } = useSettings(effectiveNetworkId);
   const { data: statusMappings = [] } = useStatusMappings(effectiveNetworkId);

  const noOsGraceHours = settings?.no_os_grace_hours ?? 24;

  // Consolidar tickets para formato compatível com UI
  const ticketsConsolidados = useMemo<TicketConsolidado[]>(() => {
    return tickets.map((dbTicket: DBTicket) => {
      const { ticket, os, osMultiplas } = dbTicketToLegacy(dbTicket);
      const horasSemOS = !hasLinkedOS(dbTicket) ? calcularHorasSemOS(dbTicket.opened_at) : null;
      const inconsistencias = getInconsistencias(dbTicket, noOsGraceHours);
      
      return {
        ticket,
        osVinculada: os,
        osMultiplas: osMultiplas.length > 0 ? osMultiplas : undefined,
        statusNormalizado: mapStatus(dbTicket.internal_status),
        severidade: mapSeverity(dbTicket.severity),
        horasSemOS,
        inconsistencias,
        vdeskPayload: dbTicket.vdesk_payload || undefined,
      };
    });
  }, [tickets, noOsGraceHours]);

  // Estatísticas do dashboard
  const estatisticas = useMemo<EstatisticasDashboard>(() => {
    if (summary) {
      return {
        totalTickets: Number(summary.total_tickets) || 0,
        ticketsOK: Number(summary.tickets_ok) || 0,
        ticketsSemOS: Number(summary.tickets_sem_os) || 0,
        ticketsObservacao: Number(summary.tickets_atencao) || 0,
        ticketsPorSeveridade: {
          critical: Number(summary.tickets_sem_os) || 0,
          warning: Number(summary.tickets_atencao) || 0,
          info: Number(summary.tickets_ok) || 0,
          success: 0,
        },
      };
    }
    
    // Fallback: calcular a partir dos tickets
    const stats: EstatisticasDashboard = {
      totalTickets: ticketsConsolidados.length,
      ticketsOK: 0,
      ticketsSemOS: 0,
      ticketsObservacao: 0,
      ticketsPorSeveridade: {
        critical: 0,
        warning: 0,
        info: 0,
        success: 0,
      },
    };
    
    ticketsConsolidados.forEach(tc => {
      stats.ticketsPorSeveridade[tc.severidade]++;
      if (!tc.osVinculada) {
        stats.ticketsSemOS++;
        stats.ticketsPorSeveridade.critical++;
      } else if (tc.severidade === 'warning') {
        stats.ticketsObservacao++;
        stats.ticketsPorSeveridade.warning++;
      } else {
        stats.ticketsOK++;
        stats.ticketsPorSeveridade[tc.severidade]++;
      }
    });
    
    return stats;
  }, [summary, ticketsConsolidados]);

  // Filtros
  const [filtros, setFiltros] = useState({
    severidade: '' as Severidade | '',
    status: '' as StatusNormalizado | '',
    tipo: '' as 'incident' | 'request' | '',
    responsavel: '',
    busca: '',
  });

  const ticketsFiltrados = useMemo(() => {
    return ticketsConsolidados.filter(tc => {
      if (filtros.severidade && tc.severidade !== filtros.severidade) return false;
      if (filtros.status && tc.statusNormalizado !== filtros.status) return false;
      if (filtros.tipo && tc.ticket.type !== filtros.tipo) return false;
      if (filtros.responsavel && !tc.ticket.assigned_to.toLowerCase().includes(filtros.responsavel.toLowerCase())) return false;
      if (filtros.busca) {
        const busca = filtros.busca.toLowerCase();
        const matchTicket = tc.ticket.number.toLowerCase().includes(busca);
        const matchDesc = tc.ticket.short_description.toLowerCase().includes(busca);
        const matchOS = tc.osVinculada?.os.includes(busca);
        if (!matchTicket && !matchDesc && !matchOS) return false;
      }
      return true;
    });
  }, [ticketsConsolidados, filtros]);

  const atualizarFiltro = useCallback(<K extends keyof typeof filtros>(
    campo: K,
    valor: (typeof filtros)[K]
  ) => {
    setFiltros(prev => ({ ...prev, [campo]: valor }));
  }, []);

  const limparFiltros = useCallback(() => {
    setFiltros({
      severidade: '',
      status: '',
      tipo: '',
      responsavel: '',
      busca: '',
    });
  }, []);

  const refresh = useCallback(() => {
    refetchTickets();
    refetchSummary();
  }, [refetchTickets, refetchSummary]);

  // Configurações para compatibilidade
  const configuracoes = {
    prazoTicketSemOS: noOsGraceHours,
    mapeamentosStatus: statusMappings.map(sm => ({
      statusExterno: sm.external_status,
      statusInterno: mapStatus(sm.internal_status),
    })),
  };

  return {
    tickets: tickets as DBTicket[],
    ticketsConsolidados,
    ticketsFiltrados,
    estatisticas,
    configuracoes,
    filtros,
    atualizarFiltro,
    limparFiltros,
    isLoading: authLoading || areaNetworkLoading || ticketsLoading || summaryLoading,
    refresh,
    ordensServico: [], // Legacy - OS agora está dentro dos tickets
  };
}
