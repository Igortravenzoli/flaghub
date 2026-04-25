/**
 * Hooks React Query para integração com API Tickets-OS via Proxy
 * 
 * Todas as requisições passam pela Edge Function vdesk-proxy
 * que gerencia autenticação e contorna restrições de CORS
 */

import { useQuery } from '@tanstack/react-query';
import { 
  consultarTicketsViaProxy, 
  correlacionarTicketViaProxy,
  ConsultaResponse,
  CorrelacaoResponse,
} from '@/services/vdeskProxyService';

/**
 * Parâmetros de consulta compatíveis com o proxy
 */
export interface ConsultaTicketsParams {
  ticketNestle?: string;
  osNumber?: string;
  programador?: string;
  dateFrom?: string;
  dateTo?: string;
  cliente?: string;
  bandeira?: string;
  pageNumber?: number;
  pageSize?: number;
}

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
  params: ConsultaTicketsParams,
  enabled = true
) {
  return useQuery<ConsultaResponse, Error>({
    queryKey: ['tickets-os', 'consultar', params],
    queryFn: () => consultarTicketsViaProxy(params),
    enabled: enabled && (
      !!params.ticketNestle || 
      !!params.osNumber || 
      !!params.dateFrom || 
      !!params.cliente ||
      !!params.programador
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
  return useQuery<CorrelacaoResponse, Error>({
    queryKey: ['tickets-os', 'correlacao', ticketNestle],
    queryFn: async () => {
      if (!ticketNestle) {
        throw new Error('Ticket Nestlé é obrigatório');
      }
      return correlacionarTicketViaProxy(ticketNestle);
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
  return useQuery<ConsultaResponse, Error>({
    queryKey: ['tickets-os', 'periodo', dateFrom, dateTo],
    queryFn: () => 
      consultarTicketsViaProxy({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        pageSize,
      }),
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
  return useQuery<ConsultaResponse, Error>({
    queryKey: ['tickets-os', 'programador', programador],
    queryFn: () =>
      consultarTicketsViaProxy({
        programador: programador || undefined,
        pageSize,
      }),
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
  return useQuery<ConsultaResponse, Error>({
    queryKey: ['tickets-os', 'os', osNumber],
    queryFn: () =>
      consultarTicketsViaProxy({
        osNumber: osNumber || undefined,
      }),
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
  return useQuery<ConsultaResponse, Error>({
    queryKey: ['tickets-os', 'cliente', cliente],
    queryFn: () =>
      consultarTicketsViaProxy({
        cliente: cliente || undefined,
        pageSize,
      }),
    enabled: !!cliente,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5,
  });
}
