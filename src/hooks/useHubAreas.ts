import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type AreaRole = 'leitura' | 'operacional' | 'owner';

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
  area_role: AreaRole;
  can_view_confidential: boolean;
  is_active: boolean;
}

export interface HubAreaInheritance {
  parent_area_key: string;
  child_area_key: string;
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

  const inheritanceQuery = useQuery({
    queryKey: ['hub_area_inheritance'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hub_area_inheritance')
        .select('parent_area_key, child_area_key');
      if (error) throw error;
      return data as HubAreaInheritance[];
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // 10 min — rarely changes
  });

  const userAreas = membershipsQuery.data ?? [];
  const allAreas = areasQuery.data ?? [];
  const inheritance = inheritanceQuery.data ?? [];

  /** Get user's membership for a given area key (direct or inherited) */
  const getMembership = (areaKey: string): HubAreaMember | undefined => {
    const area = allAreas.find(a => a.key === areaKey);
    if (!area) return undefined;

    // Direct membership
    const direct = userAreas.find(m => m.area_id === area.id);
    if (direct) return direct;

    // Inherited: check if user has a parent area
    const parentKeys = inheritance
      .filter(i => i.child_area_key === areaKey)
      .map(i => i.parent_area_key);

    for (const parentKey of parentKeys) {
      const parentArea = allAreas.find(a => a.key === parentKey);
      if (!parentArea) continue;
      const parentMembership = userAreas.find(m => m.area_id === parentArea.id);
      if (parentMembership) return parentMembership;
    }

    return undefined;
  };

  const hasArea = (areaKey: string) => !!getMembership(areaKey);

  const isOwner = (areaKey: string) => {
    const m = getMembership(areaKey);
    return m?.area_role === 'owner';
  };

  const isOperacional = (areaKey: string) => {
    const m = getMembership(areaKey);
    return m?.area_role === 'operacional' || m?.area_role === 'owner';
  };

  const getAreaRole = (areaKey: string): AreaRole | null => {
    const m = getMembership(areaKey);
    return m?.area_role ?? null;
  };

  const canViewConfidential = (areaKey: string) => {
    const m = getMembership(areaKey);
    return m?.can_view_confidential ?? false;
  };

  return {
    areas: allAreas,
    memberships: userAreas,
    hasArea,
    isOwner,
    isOperacional,
    getAreaRole,
    canViewConfidential,
    isLoading: areasQuery.isLoading || membershipsQuery.isLoading,
  };
}
