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

// Hook para buscar resumo do dashboard
export function useDashboardSummary(networkId?: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['dashboard-summary', networkId],
    queryFn: async () => {
        let query = supabase
          .from('tickets')
          .select('network_id, severity, has_os, os_found_in_vdesk, os_number, vdesk_payload, updated_at')
          .eq('is_active', true);

      if (networkId !== undefined && networkId !== null) {
        query = query.eq('network_id', networkId);
      }

      const { data, error } = await query.limit(1000);

      if (error) throw error;
      if (!data || data.length === 0) return null;

      const lastUpdated = data.reduce<string | null>((latest, row) => {
        if (!row.updated_at) return latest;
        if (!latest) return row.updated_at;
        return row.updated_at > latest ? row.updated_at : latest;
      }, null);

      const hasLinkedOS = (ticket: {
        has_os: boolean | null;
        os_found_in_vdesk: boolean | null;
        os_number: string | null;
        vdesk_payload: unknown;
      }) => {
        const hasPayloadOS = Array.isArray(ticket.vdesk_payload)
          && ticket.vdesk_payload.some((item) => Boolean((item as { os?: unknown })?.os));

        return ticket.os_found_in_vdesk === true
          || Boolean(ticket.os_number?.trim())
          || hasPayloadOS
          || ticket.has_os === true;
      };

      return {
        network_id: networkId ?? data[0].network_id,
        total_tickets: data.length,
        tickets_ok: data.filter((ticket) => ticket.severity === 'info' || hasLinkedOS(ticket)).length,
        tickets_criticos: data.filter((ticket) => ticket.severity === 'critico' && !hasLinkedOS(ticket)).length,
        tickets_atencao: data.filter((ticket) => ticket.severity === 'atencao').length,
        tickets_sem_os: data.filter((ticket) => !hasLinkedOS(ticket)).length,
        last_updated: lastUpdated,
      } as DashboardSummary;
    },
    // SSO users may not have networkId; relying on RLS keeps the query area-aware.
    enabled: options?.enabled ?? true,
    refetchInterval: 60000, // Auto-refresh a cada 60s
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
    staleTime: 60_000,
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
    refetchInterval: 60000,
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
