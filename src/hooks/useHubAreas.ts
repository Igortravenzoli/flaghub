import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface HubArea {
  id: string;
  key: string;
  name: string;
  is_active: boolean;
}

export interface HubAreaMember {
  id: string;
  user_id: string;
  area_id: string;
  area_role: 'viewer' | 'owner';
  can_view_confidential: boolean;
  is_active: boolean;
}

export function useHubAreas() {
  const { user } = useAuth();

  const areasQuery = useQuery({
    queryKey: ['hub_areas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hub_areas')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as HubArea[];
    },
    enabled: !!user,
  });

  const membershipsQuery = useQuery({
    queryKey: ['hub_area_members', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hub_area_members')
        .select('*')
        .eq('user_id', user!.id)
        .eq('is_active', true);
      if (error) throw error;
      return data as HubAreaMember[];
    },
    enabled: !!user,
  });

  const userAreas = membershipsQuery.data ?? [];
  const allAreas = areasQuery.data ?? [];

  const hasArea = (areaKey: string) => {
    const area = allAreas.find(a => a.key === areaKey);
    if (!area) return false;
    return userAreas.some(m => m.area_id === area.id);
  };

  const isOwner = (areaKey: string) => {
    const area = allAreas.find(a => a.key === areaKey);
    if (!area) return false;
    return userAreas.some(m => m.area_id === area.id && m.area_role === 'owner');
  };

  const canViewConfidential = (areaKey: string) => {
    const area = allAreas.find(a => a.key === areaKey);
    if (!area) return false;
    return userAreas.some(m => m.area_id === area.id && m.can_view_confidential);
  };

  return {
    areas: allAreas,
    memberships: userAreas,
    hasArea,
    isOwner,
    canViewConfidential,
    isLoading: areasQuery.isLoading || membershipsQuery.isLoading,
  };
}
