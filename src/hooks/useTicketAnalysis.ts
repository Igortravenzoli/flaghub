import { useMemo, useState, useCallback } from 'react';
import { 
  TicketNestle, 
  OrdemServico, 
  TicketConsolidado, 
  StatusNormalizado, 
  Severidade,
  EstatisticasDashboard,
  MapeamentoStatus 
} from '@/types';
import { 
  mockTicketsNestle, 
  mockOrdensServico, 
  defaultMapeamentosStatus,
  defaultConfiguracoes 
} from '@/data/mockData';

// Calcula diferença em horas entre duas datas
function calcularHorasDiferenca(dataInicio: string): number {
  const parseDate = (dateStr: string): Date => {
    // Formato: "27-01-2026 10:51"
    const [datePart, timePart] = dateStr.split(' ');
    const [day, month, year] = datePart.split('-').map(Number);
    const [hours, minutes] = (timePart || '00:00').split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes);
  };
  
  const inicio = parseDate(dataInicio);
  const agora = new Date(2026, 0, 27, 15, 0); // Data simulada: 27/01/2026 15:00
  const diffMs = agora.getTime() - inicio.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60));
}

// Normaliza status externo para interno
function normalizarStatus(
  statusExterno: string, 
  mapeamentos: MapeamentoStatus[]
): StatusNormalizado {
  const mapeamento = mapeamentos.find(
    m => m.statusExterno.toLowerCase() === statusExterno.toLowerCase()
  );
  return mapeamento?.statusInterno || 'nao_mapeado';
}

// Determina severidade do ticket
function determinarSeveridade(
  ticket: TicketNestle,
  osVinculada: OrdemServico | null,
  horasSemOS: number | null,
  prazoMaximo: number,
  statusNormalizado: StatusNormalizado
): Severidade {
  // Crítico: sem OS e fora do prazo
  if (!osVinculada && horasSemOS !== null && horasSemOS > prazoMaximo) {
    return 'critical';
  }
  
  // Warning: status não mapeado ou sem OS dentro do prazo
  if (statusNormalizado === 'nao_mapeado') {
    return 'warning';
  }
  
  if (!osVinculada && horasSemOS !== null && horasSemOS <= prazoMaximo) {
    return 'warning';
  }
  
  // Info: em andamento normal
  if (statusNormalizado === 'em_andamento' || statusNormalizado === 'aguardando') {
    return 'info';
  }
  
  // Success: resolvido ou fechado
  return 'success';
}

// Identifica inconsistências
function identificarInconsistencias(
  ticket: TicketNestle,
  osVinculada: OrdemServico | null,
  statusNormalizado: StatusNormalizado,
  horasSemOS: number | null,
  prazoMaximo: number
): string[] {
  const inconsistencias: string[] = [];
  
  if (!osVinculada && horasSemOS !== null && horasSemOS > prazoMaximo) {
    inconsistencias.push(`Ticket sem OS há ${horasSemOS}h (prazo: ${prazoMaximo}h)`);
  }
  
  if (statusNormalizado === 'nao_mapeado') {
    inconsistencias.push(`Status "${ticket.state}" não mapeado`);
  }
  
  if (!ticket.short_description || ticket.short_description.trim() === '') {
    inconsistencias.push('Ticket sem descrição');
  }
  
  if (!ticket.assigned_to && statusNormalizado !== 'novo') {
    inconsistencias.push('Ticket em andamento sem responsável');
  }
  
  return inconsistencias;
}

export function useTicketAnalysis() {
  const [tickets] = useState<TicketNestle[]>(mockTicketsNestle);
  const [ordensServico] = useState<OrdemServico[]>(mockOrdensServico);
  const [configuracoes] = useState(defaultConfiguracoes);
  
  // Consolida tickets com análise de vinculação
  const ticketsConsolidados = useMemo<TicketConsolidado[]>(() => {
    return tickets.map(ticket => {
      // Busca OS vinculada pelo número do ticket
      const osVinculada = ordensServico.find(
        os => os.ticketNestle === ticket.number
      ) || null;
      
      // Calcula horas sem OS
      const horasSemOS = !osVinculada ? calcularHorasDiferenca(ticket.opened_at) : null;
      
      // Normaliza status
      const statusNormalizado = normalizarStatus(
        ticket.state, 
        configuracoes.mapeamentosStatus
      );
      
      // Determina severidade
      const severidade = determinarSeveridade(
        ticket,
        osVinculada,
        horasSemOS,
        configuracoes.prazoTicketSemOS,
        statusNormalizado
      );
      
      // Identifica inconsistências
      const inconsistencias = identificarInconsistencias(
        ticket,
        osVinculada,
        statusNormalizado,
        horasSemOS,
        configuracoes.prazoTicketSemOS
      );
      
      return {
        ticket,
        osVinculada,
        statusNormalizado,
        severidade,
        horasSemOS,
        inconsistencias
      };
    });
  }, [tickets, ordensServico, configuracoes]);
  
  // Estatísticas do dashboard
  const estatisticas = useMemo<EstatisticasDashboard>(() => {
    const stats: EstatisticasDashboard = {
      totalTickets: ticketsConsolidados.length,
      ticketsOK: 0,
      ticketsSemOS: 0,
      ticketsObservacao: 0,
      ticketsPorSeveridade: {
        critical: 0,
        warning: 0,
        info: 0,
        success: 0
      }
    };
    
    ticketsConsolidados.forEach(tc => {
      stats.ticketsPorSeveridade[tc.severidade]++;
      
      if (tc.severidade === 'critical') {
        stats.ticketsSemOS++;
      } else if (tc.severidade === 'warning') {
        stats.ticketsObservacao++;
      } else {
        stats.ticketsOK++;
      }
    });
    
    return stats;
  }, [ticketsConsolidados]);
  
  // Filtros
  const [filtros, setFiltros] = useState({
    severidade: '' as Severidade | '',
    status: '' as StatusNormalizado | '',
    tipo: '' as 'incident' | 'request' | '',
    responsavel: '',
    busca: ''
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
    valor: typeof filtros[K]
  ) => {
    setFiltros(prev => ({ ...prev, [campo]: valor }));
  }, []);
  
  const limparFiltros = useCallback(() => {
    setFiltros({
      severidade: '',
      status: '',
      tipo: '',
      responsavel: '',
      busca: ''
    });
  }, []);
  
  return {
    tickets,
    ordensServico,
    ticketsConsolidados,
    ticketsFiltrados,
    estatisticas,
    configuracoes,
    filtros,
    atualizarFiltro,
    limparFiltros
  };
}
