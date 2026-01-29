/**
 * ⚠️ ARQUIVO DEPRECADO
 * 
 * Este arquivo conectava diretamente ao SQL Server VDESK via Edge Functions Supabase.
 * Foi substituído por uma arquitetura baseada em API REST.
 * 
 * NOVO FLUXO:
 * - Frontend: http://localhost:8080 (Vite React App)
 * - API: http://localhost:5000 (VDESKProxy .NET Core)
 * - Backend: SQL Server VDESK
 * 
 * MIGRAÇÕES:
 * - Consulta VDESK → Use ticketsOSApi.consultarTicketsOS()
 * - Correlação → Use ticketsOSApi.correlacionarTicket()
 * - React Query → Use hooks de useTicketsOSApi.ts
 * 
 * REFERÊNCIAS:
 * - @see src/services/ticketsOSApi.ts - API service layer
 * - @see src/hooks/useTicketsOSApi.ts - React Query hooks
 */

// ============================================================================
// FALLBACK EXPORTS (para compatibilidade temporária)
// ============================================================================

/**
 * @deprecated Use consultarTicketsOS() de ticketsOSApi.ts
 */
export async function consultarVDESK() {
  throw new Error(
    '❌ consultarVDESK() foi removido. Use ticketsOSApi.consultarTicketsOS() ao invés.'
  );
}

/**
 * @deprecated Use correlacionarTicket() de ticketsOSApi.ts
 */
export async function buscarOSnoVDESK() {
  throw new Error(
    '❌ buscarOSnoVDESK() foi removido. Use ticketsOSApi.correlacionarTicket() ao invés.'
  );
}

/**
 * @deprecated Use correlacionarTicket() de ticketsOSApi.ts
 */
export async function correlacionarComVDESK() {
  throw new Error(
    '❌ correlacionarComVDESK() foi removido. Use ticketsOSApi.correlacionarTicket() ao invés.'
  );
}

/**
 * @deprecated Correlação agora é feita via useCorrelacionarTicket() hook
 */
export async function processarCorrelacaoAutomatica() {
  throw new Error(
    '❌ processarCorrelacaoAutomatica() foi removido. Use useCorrelacionarTicket() hook ao invés.'
  );
}

/**
 * @deprecated Use API REST ao invés de atualizar diretamente
 */
export async function atualizarTicketComVDESK() {
  throw new Error(
    '❌ atualizarTicketComVDESK() foi removido. Dados agora vêm da API REST.'
  );
}
