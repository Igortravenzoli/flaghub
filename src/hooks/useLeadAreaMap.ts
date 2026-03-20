import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LeadAreaMapItem {
  lead_email: string;
  canonical_name: string | null;
  area_key: string;
  squad_label: string | null;
  pipeline_role: 'design' | 'fabrica' | 'qualidade' | 'pm' | 'cs';
  visual_priority: number;
  counts_as_design: boolean;
  counts_as_fabrica: boolean;
  counts_as_qualidade: boolean;
  is_active: boolean;
}

export function useLeadAreaMap() {
  const query = useQuery({
    queryKey: ['pbi', 'lead-area-map'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('devops_lead_area_map')
        .select('*')
        .eq('is_active', true)
        .order('visual_priority', { ascending: true });

      if (error) throw error;
      return (data || []) as LeadAreaMapItem[];
    },
    staleTime: 60 * 60 * 1000,
  });

  const byEmail = useMemo(() => {
    const map = new Map<string, LeadAreaMapItem>();
    for (const item of query.data || []) {
      map.set(item.lead_email.toLowerCase(), item);
    }
    return map;
  }, [query.data]);

  const getPipelineRole = (email?: string | null) => {
    if (!email) return null;
    return byEmail.get(email.toLowerCase())?.pipeline_role || null;
  };

  return {
    items: query.data || [],
    byEmail,
    getPipelineRole,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
