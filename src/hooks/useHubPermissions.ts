import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface HubAccessRequest {
  id: string;
  user_id: string;
  area_id: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

export interface HubGlobalRole {
  user_id: string;
  role: 'admin' | 'user';
  is_local_admin: boolean;
}

export function useHubGlobalRole() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['hub_global_role', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hub_user_global_roles')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as HubGlobalRole | null;
    },
    enabled: !!user,
  });
}

export function useHubIsAdmin() {
  const { data: globalRole } = useHubGlobalRole();
  return globalRole?.role === 'admin';
}

export function useAccessRequests() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const requestsQuery = useQuery({
    queryKey: ['hub_access_requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hub_access_requests')
        .select('*')
        .order('requested_at', { ascending: false });
      if (error) throw error;
      return data as HubAccessRequest[];
    },
    enabled: !!user,
  });

  const requestAccess = useMutation({
    mutationFn: async ({ areaId }: { areaId: string }) => {
      const { error } = await supabase.from('hub_access_requests').insert({
        user_id: user!.id,
        area_id: areaId,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hub_access_requests'] }),
  });

  return { requests: requestsQuery.data ?? [], isLoading: requestsQuery.isLoading, requestAccess };
}

export function useIpAllowlist() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['hub_ip_allowlist'],
    queryFn: async () => {
      const { data, error } = await supabase.from('hub_ip_allowlist').select('*').order('created_at');
      if (error) throw error;
      return data;
    },
  });

  const addEntry = useMutation({
    mutationFn: async ({ cidr, label }: { cidr: string; label: string }) => {
      const { error } = await supabase.from('hub_ip_allowlist').insert({ cidr, label });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hub_ip_allowlist'] }),
  });

  const removeEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('hub_ip_allowlist').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hub_ip_allowlist'] }),
  });

  return { entries: query.data ?? [], isLoading: query.isLoading, addEntry, removeEntry };
}
