import { CADENCIA_MINIMA_MS } from '@/lib/cadencia';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { 
  DBTicket, 
  DashboardSummary, 
  Import, 
  StatusMapping, 
  Settings,
  InternalStatus,
  TicketSeverity 
} from '@/types/database';

/**
 * Intervalo de recarga das telas de ticket.
 *
 * Alinhado ao cron `sync-vdesk-helpdesk`, que popula a tabela `tickets` de 5
 * em 5 minutos. Era 60s — quatro de cada cinco recargas devolviam bytes
 * idênticos, porque não havia como o dado ter mudado.
 *
 * O custo não era teórico: as duas queries abaixo somam ~261 kB por recarga
 * (a lista pesa 199 kB e o resumo 62 kB, dos quais 97,7% é a coluna
 * `vdesk_payload`). A 60s, uma única aba esquecida aberta gastava ~11 GB de
 * egress por mês, contra uma cota de 5 GB — foi o que estourou o limite da
 * Supabase em 31/08/2026.
 *
 * Este número acompanha o cron. Se o `sync-vdesk-helpdesk` mudar de cadência,
 * muda aqui junto; abaixo dela é desperdício garantido.
 */
const RECARGA_TICKETS_MS = 5 * 60 * 1000

/**
 * Resumo do dashboard de tickets — cinco contadores.
 *
 * Calculado no BANCO desde 31/08/2026. Antes isto baixava até 1.000 linhas da
 * tabela `tickets`, com o blob `vdesk_payload` incluído, e contava no
 * navegador: 62 kB por recarga, dos quais 97,7% era o blob — trafegado só para
 * derivar um booleano (`hasLinkedOS`). Agora a RPC devolve os cinco números:
 * ~62 kB viram ~100 bytes.
 *
 * O `.limit(1000)` que existia aqui também era um bug latente e silencioso:
 * passando de mil tickets ativos numa rede, o resumo contaria só os mil
 * primeiros, sem erro nem aviso. Contando no banco não há teto.
 *
 * A regra de "tem OS vinculada" vive agora em `get_dashboard_summary`
 * (migration 20260831170000), replicando a semântica de verdade do JavaScript.
 * Se ela mudar aqui no front (`useTicketAnalysisDB.hasLinkedOS`), muda lá junto
 * — senão os contadores do topo divergem da lista logo abaixo deles.
 *
 * `as any` no nome da RPC segue o padrão já usado em `useResolvedAreaNetwork`:
 * os tipos gerados do Supabase ainda não conhecem a função.
 */
export function useDashboardSummary(networkId?: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['dashboard-summary', networkId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dashboard_summary' as any, {
        p_network_id: networkId ?? null,
      });

      if (error) throw error;

      // Sem linha = rede sem ticket ativo, ou sem permissão de ver. O contrato
      // anterior devolvia null nesse caso e a tela já sabe lidar.
      const linha = (data as DashboardSummary[] | null)?.[0];
      return linha ?? null;
    },
    // SSO users may not have networkId; relying on RLS keeps the query area-aware.
    enabled: options?.enabled ?? true,
    refetchInterval: RECARGA_TICKETS_MS,
  });
}

export function useResolvedAreaNetwork(areaKey?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['hub-area-network', areaKey],
    queryFn: async () => {
      if (!areaKey) return null;

      const { data, error } = await supabase.rpc('hub_resolve_area_network_id' as any, {
        p_area_key: areaKey,
      });

      if (error) throw error;
      return (data as number | null) ?? null;
    },
    enabled: (options?.enabled ?? true) && !!areaKey,
    staleTime: CADENCIA_MINIMA_MS,
  });
}

// Hook para buscar tickets com filtros
export function useTickets(
  filters?: {
    networkId?: number;
    dateFrom?: string;
    dateTo?: string;
    internalStatus?: InternalStatus;
    severity?: TicketSeverity;
    hasOs?: boolean;
    searchText?: string;
    limit?: number;
    offset?: number;
  },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['tickets', filters],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_tickets', {
          p_network_id: filters?.networkId ?? null,
          p_date_from: filters?.dateFrom ?? null,
          p_date_to: filters?.dateTo ?? null,
          p_internal_status: filters?.internalStatus ?? null,
          p_severity: filters?.severity ?? null,
          p_has_os: filters?.hasOs ?? null,
          p_search_text: filters?.searchText ?? null,
          p_limit: filters?.limit ?? 50,
          p_offset: filters?.offset ?? 0,
        });

      if (error) throw error;
      return data as DBTicket[];
    },
    // Por padrão, só executar quando networkId estiver definido.
    // Para casos especiais (ex.: admin sem networkId), usar options.enabled.
    enabled:
      options?.enabled ??
      (filters?.networkId !== undefined && filters.networkId !== null),
    refetchInterval: RECARGA_TICKETS_MS,
  });
}

// Hook para buscar detalhe de um ticket
export function useTicketDetail(ticketExternalId: string | null) {
  return useQuery({
    queryKey: ['ticket-detail', ticketExternalId],
    queryFn: async () => {
      if (!ticketExternalId) return null;
      
      const { data, error } = await supabase
        .rpc('get_ticket_detail', { p_ticket_external_id: ticketExternalId });
      
      if (error) throw error;
      return (data as DBTicket[])?.[0] ?? null;
    },
    enabled: !!ticketExternalId,
  });
}

// Hook para buscar histórico de importações
export function useImportsHistory(networkId?: number, limit?: number) {
  return useQuery({
    queryKey: ['imports-history', networkId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_imports_history', { 
          p_network_id: networkId ?? null, 
          p_limit: limit ?? 20 
        });
      
      if (error) throw error;
      return data as Import[];
    },
  });
}

// Hook para buscar mapeamentos de status
export function useStatusMappings(networkId?: number) {
  return useQuery({
    queryKey: ['status-mappings', networkId],
    queryFn: async () => {
      let query = supabase
        .from('status_mapping')
        .select('*')
        .eq('is_active', true);
      
      if (networkId) {
        query = query.eq('network_id', networkId);
      }
      
      const { data, error } = await query.order('external_status');
      
      if (error) throw error;
      return data as StatusMapping[];
    },
  });
}

// Hook para buscar settings
export function useSettings(networkId?: number) {
  return useQuery({
    queryKey: ['settings', networkId],
    queryFn: async () => {
      if (!networkId) return null;
      
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('network_id', networkId)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data as Settings | null;
    },
    enabled: !!networkId,
  });
}

// Mutation para atualizar settings
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ networkId, noOsGraceHours }: { networkId: number; noOsGraceHours: number }) => {
      const { data, error } = await supabase
        .from('settings')
        .upsert({ 
          network_id: networkId, 
          no_os_grace_hours: noOsGraceHours,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['settings', variables.networkId] });
    },
  });
}

// Mutation para adicionar mapeamento de status
export function useAddStatusMapping() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      networkId, 
      externalStatus, 
      internalStatus 
    }: { 
      networkId: number; 
      externalStatus: string; 
      internalStatus: InternalStatus;
    }) => {
      const { data, error } = await supabase
        .from('status_mapping')
        .insert({ 
          network_id: networkId, 
          external_status: externalStatus,
          internal_status: internalStatus
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['status-mappings', variables.networkId] });
    },
  });
}

// Mutation para remover mapeamento de status
export function useDeleteStatusMapping() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, networkId }: { id: number; networkId: number }) => {
      const { error } = await supabase
        .from('status_mapping')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['status-mappings', variables.networkId] });
    },
  });
}

// Hook para buscar networks
export function useNetworks() {
  return useQuery({
    queryKey: ['networks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('networks')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });
}
