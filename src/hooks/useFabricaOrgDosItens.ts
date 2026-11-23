import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fábrica de cada item AO VIVO pela régua do organograma (F2, 23/11/2026): a
 * fábrica de entrega que mais lançou hora no item › área do time / Épico ›
 * responsável › "Sem fábrica". É a MESMA função que monta `fabricas_org` na foto
 * selada (`fn_fabrica_org_dos_itens`), chamada com as horas até hoje — então a
 * visão ao vivo e a foto nunca divergem de régua.
 *
 * Entra por `rpc_fabrica_org_dos_itens`, liberada só para quem já pode ler os
 * apontamentos; devolve id do item e código da fábrica, nenhum nome. Sem
 * permissão (ou antes da migration da F4), a aba segue sem o recorte ao vivo.
 */
export function useFabricaOrgDosItens(ids: number[]) {
  const chave = [...new Set(ids)].sort((a, b) => a - b);
  return useQuery({
    queryKey: ['fabrica-org-dos-itens', chave.join(',')],
    queryFn: async () => {
      const hoje = format(new Date(), 'yyyy-MM-dd');
      const out: Record<number, string> = {};
      for (let i = 0; i < chave.length; i += 500) {
        const { data, error } = await (supabase as unknown as {
          rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: Array<{ work_item_id: number; fabrica: string }> | null; error: { message: string } | null }>;
        }).rpc('rpc_fabrica_org_dos_itens', { p_ids: chave.slice(i, i + 500), p_ate: hoje });
        if (error) throw new Error(error.message);
        for (const r of data ?? []) out[r.work_item_id] = r.fabrica;
      }
      return out;
    },
    enabled: chave.length > 0,
    // Sem permissão ou sem a função no banco: não insistir — a aba segue sem o recorte ao vivo.
    retry: false,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
