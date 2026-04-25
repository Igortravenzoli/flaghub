import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface AlertRule {
  id: string;
  sector: string;
  metric_key: string;
  condition_type: string;
  threshold: number | null;
  enabled: boolean;
  channel_id: string | null;
  recipients: string[] | null;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface AlertChannel {
  id: string;
  label: string;
  channel_type: string;
  config: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
}

export interface AlertDelivery {
  id: string;
  rule_id: string;
  channel_id: string | null;
  status: string;
  payload: Record<string, unknown> | null;
  error: string | null;
  delivered_at: string | null;
  created_at: string;
}

export function useAlertChannels() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['alert_channels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alert_channels')
        .select('*')
        .order('label');
      if (error) throw error;
      return data as AlertChannel[];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAlertRules(sector?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['alert_rules', sector],
    queryFn: async () => {
      let q = supabase.from('alert_rules').select('*').order('created_at', { ascending: false });
      if (sector) q = q.eq('sector', sector);
      const { data, error } = await q;
      if (error) throw error;
      return data as AlertRule[];
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });
}

export function useAlertDeliveries(ruleId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['alert_deliveries', ruleId],
    queryFn: async () => {
      let q = supabase
        .from('alert_deliveries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
      if (ruleId) q = q.eq('rule_id', ruleId);
      const { data, error } = await q;
      if (error) throw error;
      return data as AlertDelivery[];
    },
    enabled: !!user && !!ruleId,
    staleTime: 60 * 1000,
  });
}

export function useAlertMutations() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const createRule = useMutation({
    mutationFn: async (rule: Omit<AlertRule, 'id' | 'created_at' | 'updated_at' | 'last_triggered_at' | 'created_by'>) => {
      const { error } = await supabase.from('alert_rules').insert({
        ...rule,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert_rules'] }),
  });

  const updateRule = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AlertRule> & { id: string }) => {
      const { error } = await supabase.from('alert_rules').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert_rules'] }),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('alert_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert_rules'] }),
  });

  const createChannel = useMutation({
    mutationFn: async (channel: { label: string; channel_type: string; config?: Record<string, unknown> | null; is_active?: boolean }) => {
      const row: Record<string, unknown> = {
        label: channel.label,
        channel_type: channel.channel_type,
        config: channel.config ?? null,
        is_active: channel.is_active ?? true,
        created_by: user?.id ?? null,
      };
      const { error } = await supabase.from('alert_channels').insert(row as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert_channels'] }),
  });

  return { createRule, updateRule, deleteRule, createChannel };
}
