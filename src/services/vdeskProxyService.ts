/**
 * Serviço para chamadas ao VDESK via Edge Function Proxy
 * 
 * Evita problemas de CORS chamando a API externa através do backend
 */

import { supabase } from '@/integrations/supabase/client';

// URL base do Supabase (extraída do client)
const SUPABASE_URL = 'https://nxmgppfyltwsqryfxkbm.supabase.co';

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

export interface CorrelacaoResponse {
  success: boolean;
  ticket: string;
  osEncontradas: string[];
  count: number;
  data: TicketOSRecord[];
  message?: string;
  errorCode?: string;
  timestamp: string;
}

export interface ConsultaResponse {
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
 * Correlaciona um ticket Nestlé com OS no VDESK via proxy
 */
export async function correlacionarTicketViaProxy(
  ticketNestle: string
): Promise<CorrelacaoResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  
  const functionUrl = `${SUPABASE_URL}/functions/v1/vdesk-proxy?action=correlacao&ticketNestle=${encodeURIComponent(ticketNestle)}`;
  
  const response = await fetch(functionUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${session?.access_token || ''}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro HTTP ${response.status}`);
  }

  return await response.json();
}

/**
 * Consulta tickets/OS no VDESK via proxy
 */
export async function consultarTicketsViaProxy(params: {
  ticketNestle?: string;
  osNumber?: string;
  programador?: string;
  dateFrom?: string;
  dateTo?: string;
  cliente?: string;
  bandeira?: string;
  pageNumber?: number;
  pageSize?: number;
}): Promise<ConsultaResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  
  const queryParams = new URLSearchParams({ action: 'consultar' });
  
  if (params.ticketNestle) queryParams.append('ticketNestle', params.ticketNestle);
  if (params.osNumber) queryParams.append('osNumber', params.osNumber);
  if (params.programador) queryParams.append('programador', params.programador);
  if (params.dateFrom) queryParams.append('dateFrom', params.dateFrom);
  if (params.dateTo) queryParams.append('dateTo', params.dateTo);
  if (params.cliente) queryParams.append('cliente', params.cliente);
  if (params.bandeira) queryParams.append('bandeira', params.bandeira);
  if (params.pageNumber) queryParams.append('pageNumber', params.pageNumber.toString());
  if (params.pageSize) queryParams.append('pageSize', params.pageSize.toString());

  const functionUrl = `${SUPABASE_URL}/functions/v1/vdesk-proxy?${queryParams}`;
  
  const response = await fetch(functionUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${session?.access_token || ''}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro HTTP ${response.status}`);
  }

  return await response.json();
}
