/**
 * Hooks React Query para integração com API Tickets-OS
 * 
 * Usa token de sessão obtido via /api/faq/validate-client
 */

import { useQuery } from '@tanstack/react-query';
import { 
  consultarTicketsOS, 
  correlacionarTicket, 
  ConsultaTicketsOSParams,
  TicketOSResponse,
  CorrelacaoTicketResponse
} from '@/services/ticketsOSApi';
import { useApiSessionToken } from './useApiSessionToken';

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
  const { isInitialized, executeWithRetry } = useApiSessionToken();

  return useQuery<TicketOSResponse, Error>({
    queryKey: ['tickets-os', 'consultar', params],
    queryFn: async () => {
      return executeWithRetry((token) => consultarTicketsOS(params, token));
    },
    enabled: enabled && isInitialized && (
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
  const { isInitialized, executeWithRetry } = useApiSessionToken();

  return useQuery<CorrelacaoTicketResponse, Error>({
    queryKey: ['tickets-os', 'correlacao', ticketNestle],
    queryFn: async () => {
      if (!ticketNestle) {
        throw new Error('Ticket Nestlé é obrigatório');
      }
      return executeWithRetry((token) => correlacionarTicket(ticketNestle, token));
    },
    enabled: enabled && isInitialized && !!ticketNestle,
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
  const { isInitialized, executeWithRetry } = useApiSessionToken();

  return useQuery<TicketOSResponse, Error>({
    queryKey: ['tickets-os', 'periodo', dateFrom, dateTo],
    queryFn: async () => {
      return executeWithRetry((token) => 
        consultarTicketsOS(
          {
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            pageSize,
          },
          token
        )
      );
    },
    enabled: isInitialized && !!dateFrom && !!dateTo,
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
  const { isInitialized, executeWithRetry } = useApiSessionToken();

  return useQuery<TicketOSResponse, Error>({
    queryKey: ['tickets-os', 'programador', programador],
    queryFn: async () => {
      return executeWithRetry((token) =>
        consultarTicketsOS(
          {
            programador: programador || undefined,
            pageSize,
          },
          token
        )
      );
    },
    enabled: isInitialized && !!programador,
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
  const { isInitialized, executeWithRetry } = useApiSessionToken();

  return useQuery<TicketOSResponse, Error>({
    queryKey: ['tickets-os', 'os', osNumber],
    queryFn: async () => {
      return executeWithRetry((token) =>
        consultarTicketsOS(
          {
            osNumber: osNumber || undefined,
          },
          token
        )
      );
    },
    enabled: isInitialized && !!osNumber,
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
  const { isInitialized, executeWithRetry } = useApiSessionToken();

  return useQuery<TicketOSResponse, Error>({
    queryKey: ['tickets-os', 'cliente', cliente],
    queryFn: async () => {
      return executeWithRetry((token) =>
        consultarTicketsOS(
          {
            cliente: cliente || undefined,
            pageSize,
          },
          token
        )
      );
    },
    enabled: isInitialized && !!cliente,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5,
  });
}
