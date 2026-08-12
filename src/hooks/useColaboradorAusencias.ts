import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Ausencia } from '@/lib/capacidade';

/**
 * Períodos de ausência por colaborador do roster.
 *
 * Fonte: `v_colaborador_ausencias`, que lê o espelho da lista SG-LST-013
 * (Controle Colaborador) do SharePoint e traduz o nome do RH para o nome que o
 * portal usa, via `fabrica_squad_membership.sharepoint_nome`.
 *
 * Quem não tem vínculo cadastrado não aparece aqui — e, por consequência,
 * mantém capacidade cheia. É fail-open de propósito (ver src/lib/capacidade.ts).
 */
export function useColaboradorAusencias() {
  return useQuery({
    queryKey: ['colaborador-ausencias'],
    queryFn: async () => {
      // A view não está nos tipos gerados do Supabase (padrão do repo — ver
      // useInfraTimelog): cast pontual em vez de regenerar o schema inteiro.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('v_colaborador_ausencias')
        .select('colaborador, tipo, data_inicio, data_fim');
      if (error) throw error;
      return (data || []) as Ausencia[];
    },
    // A lista vem de um sync de 6 em 6 horas; não faz sentido refazer a cada foco.
    staleTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
