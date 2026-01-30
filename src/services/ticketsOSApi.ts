/**
 * Serviço de Integração com API Tickets-OS Backend
 * 
 * Consome endpoints da API .NET que se conecta ao banco VDESK
 * URL Base: http://localhost:5000
 */

const API_BASE_URL = 'https://clientes.flag.com.br/Flag.Ai.Gateway';

/**
 * Record de Ticket/OS retornado pela API
 */
export interface TicketOSRecord {
  cliente: string;
  bandeira: string;
  programador: string;
  os: string;
  ticketNestle: string;
  sequencia: number;
  dataRegistro: string;
  sistema: string;
  componente: string;
  descricao: string;
  descricaoOS: string;
  previsao?: string | null;
  dataHistorico?: string | null;
  previsaoMinutos?: string;
  tipoChamado: string;
  criticidade?: string | null;
  retorno?: string;
}

/**
 * Response padrão da API
 */
export interface TicketOSResponse {
  success: boolean;
  data: TicketOSRecord[];
  count: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  message?: string;
  errorCode?: string;
  timestamp: string;
}

/**
 * Response de correlação
 */
export interface CorrelacaoTicketResponse {
  success: boolean;
  ticket: string;
  osEncontradas: string[];
  count: number;
  data: TicketOSRecord[];
  message?: string;
  errorCode?: string;
  timestamp: string;
}

/**
 * Parâmetros de consulta
 */
export interface ConsultaTicketsOSParams {
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
 * Consulta tickets e OS no banco VDESK com filtros opcionais
 * 
 * GET /api/tickets-os/consultar
 */
export async function consultarTicketsOS(
  params: ConsultaTicketsOSParams,
  token: string
): Promise<TicketOSResponse> {
  const queryParams = new URLSearchParams();
  
  if (params.ticketNestle) queryParams.append('ticketNestle', params.ticketNestle);
  if (params.osNumber) queryParams.append('osNumber', params.osNumber);
  if (params.programador) queryParams.append('programador', params.programador);
  if (params.dateFrom) queryParams.append('dateFrom', params.dateFrom);
  if (params.dateTo) queryParams.append('dateTo', params.dateTo);
  if (params.cliente) queryParams.append('cliente', params.cliente);
  if (params.bandeira) queryParams.append('bandeira', params.bandeira);
  if (params.pageNumber) queryParams.append('pageNumber', params.pageNumber.toString());
  if (params.pageSize) queryParams.append('pageSize', params.pageSize.toString());

  const response = await fetch(
    `${API_BASE_URL}/api/tickets-os/consultar?${queryParams}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as any;
    throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Correlaciona um ticket com todas as OS atreladas
 * 
 * GET /api/tickets-os/correlacao?ticketNestle=INC22838782
 */
export async function correlacionarTicket(
  ticketNestle: string,
  token: string
): Promise<CorrelacaoTicketResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/tickets-os/correlacao?ticketNestle=${encodeURIComponent(ticketNestle)}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as any;
    throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Função auxiliar para obter token Supabase
 */
export async function obterTokenSupabase(): Promise<string | null> {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    console.warn('Falha ao obter token Supabase');
    return null;
  }
}

/**
 * Valida conexão com a API
 */
export async function validarConexaoAPI(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    return response.ok;
  } catch {
    return false;
  }
}
