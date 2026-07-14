import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Uma linha do roster fixo das squads (fabrica_squad_membership).
 * Fonte: planilha do gestor, carregada direto no banco (dados pessoais sob RLS,
 * fora do repositório público).
 */
export interface SquadMembershipRow {
  colaborador: string;
  squad: string;
  papel: string;
  ativo: boolean;
}

/** Roster fixo dev -> squad. Base da visão por squad e do uso cruzado. */
export function useFabricaRoster() {
  return useQuery({
    queryKey: ['fabrica-squad-roster'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fabrica_squad_membership')
        .select('colaborador, squad, papel, ativo')
        .eq('ativo', true);
      if (error) throw error;
      return (data || []) as SquadMembershipRow[];
    },
    staleTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
