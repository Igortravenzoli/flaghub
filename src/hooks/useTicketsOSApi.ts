/**
 * Hooks React Query para integração com API Tickets-OS
 * 
 * Gerenciam requisições HTTP para backend .NET
 */

import { useQuery } from '@tanstack/react-query';
import { 
  consultarTicketsOS, 
  correlacionarTicket, 
  ConsultaTicketsOSParams,
  obterTokenSupabase,
  TicketOSResponse,
  CorrelacaoTicketResponse
} from '@/services/ticketsOSApi';

/**
 * Hook para consultar tickets/OS com filtros dinâmicos
 * 
 * @param params - Filtros de busca
 * @param enabled - Se a query está ativada
 * 
 * @example
 * const { data, isLoading } = useConsultarTicketsOS({
 *   ticketNestle: 'INC22838782'
 * });
 */
export function useConsultarTicketsOS(
  params: ConsultaTicketsOSParams,
  enabled = true
) {
  return useQuery<TicketOSResponse, Error>({
    queryKey: ['tickets-os', 'consultar', params],
    queryFn: async () => {
      const token = await obterTokenSupabase();
      
      // Para testes: permite continuar sem token
      if (!token) {
        console.warn('⚠️ Token não encontrado - usando modo de teste sem autenticação');
      }

      return consultarTicketsOS(params, token || '');
    },
    enabled: enabled && (
      !!params.ticketNestle || 
      !!params.osNumber || 
      !!params.dateFrom || 
      !!params.cliente
    ),
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 1000 * 60 * 5, // 5 minutos
  });
}

/**
 * Hook para correlacionar um ticket específico com suas OS
 * 
 * @param ticketNestle - Número do ticket Nestlé
 * @param enabled - Se a query está ativada
 * 
 * @example
 * const { data, isLoading } = useCorrelacionarTicket('INC22838782');
 */
export function useCorrelacionarTicket(
  ticketNestle: string | null,
  enabled = true
) {
  return useQuery<CorrelacaoTicketResponse, Error>({
    queryKey: ['tickets-os', 'correlacao', ticketNestle],
    queryFn: async () => {
      if (!ticketNestle) {
        throw new Error('Ticket Nestlé é obrigatório');
      }

      const token = await obterTokenSupabase();
      
      // Para testes: permite continuar sem token
      if (!token) {
        console.warn('⚠️ Token não encontrado - usando modo de teste sem autenticação');
      }

      return correlacionarTicket(ticketNestle, token || '');
    },
    enabled: enabled && !!ticketNestle,
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 1000 * 60 * 5, // 5 minutos
  });
}

/**
 * Hook para buscar múltiplos tickets em um período
 * 
 * @param dateFrom - Data inicial (YYYY-MM-DD)
 * @param dateTo - Data final (YYYY-MM-DD)
 * 
 * @example
 * const { data } = useBuscarPorPeriodo('2026-01-01', '2026-01-31');
 */
export function useBuscarPorPeriodo(
  dateFrom: string | null,
  dateTo: string | null,
  pageSize = 50
) {
  return useQuery<TicketOSResponse, Error>({
    queryKey: ['tickets-os', 'periodo', dateFrom, dateTo],
    queryFn: async () => {
      const token = await obterTokenSupabase();
      
      if (!token) {
        console.warn('⚠️ Token não encontrado - usando modo de teste sem autenticação');
      }

      return consultarTicketsOS(
        {
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          pageSize
        },
        token || ''
      );
    },
    enabled: !!dateFrom && !!dateTo,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Hook para buscar tickets por programador
 * 
 * @param programador - Nome do programador
 * 
 * @example
 * const { data } = useBuscarPorProgramador('BRUNA');
 */
export function useBuscarPorProgramador(
  programador: string | null,
  pageSize = 50
) {
  return useQuery<TicketOSResponse, Error>({
    queryKey: ['tickets-os', 'programador', programador],
    queryFn: async () => {
      const token = await obterTokenSupabase();
      
      if (!token) {
        console.warn('⚠️ Token não encontrado - usando modo de teste sem autenticação');
      }

      return consultarTicketsOS(
        {
          programador: programador || undefined,
          pageSize
        },
        token || ''
      );
    },
    enabled: !!programador,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Hook para buscar tickets por OS
 * 
 * @param osNumber - Número da OS
 * 
 * @example
 * const { data } = useBuscarPorOS('OS753456');
 */
export function useBuscarPorOS(osNumber: string | null) {
  return useQuery<TicketOSResponse, Error>({
    queryKey: ['tickets-os', 'os', osNumber],
    queryFn: async () => {
      const token = await obterTokenSupabase();
      
      if (!token) {
        console.warn('⚠️ Token não encontrado - usando modo de teste sem autenticação');
      }

      return consultarTicketsOS(
        {
          osNumber: osNumber || undefined
        },
        token || ''
      );
    },
    enabled: !!osNumber,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Hook para buscar tickets por cliente
 * 
 * @param cliente - Nome do cliente (LIKE)
 * 
 * @example
 * const { data } = useBuscarPorCliente('GDBroker');
 */
export function useBuscarPorCliente(cliente: string | null, pageSize = 50) {
  return useQuery<TicketOSResponse, Error>({
    queryKey: ['tickets-os', 'cliente', cliente],
    queryFn: async () => {
      const token = await obterTokenSupabase();
      
      if (!token) {
        console.warn('⚠️ Token não encontrado - usando modo de teste sem autenticação');
      }

      return consultarTicketsOS(
        {
          cliente: cliente || undefined,
          pageSize
        },
        token || ''
      );
    },
    enabled: !!cliente,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5,
  });
}
