import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WorkItemLink {
  id: number;
  title: string | null;
  work_item_type: string | null;
  state: string | null;
  web_url: string | null;
}

/** `.in()` com lista gigante estoura a URL do PostgREST — 200 por chamada. */
const CHUNK = 200;

/**
 * Itens do DevOps por id, para o drill-down dos indicadores (título + link).
 *
 * Título e estado vêm do estado ATUAL do item, não do corte da fotografia: a
 * lista serve para abrir o item no DevOps, e um título congelado só dificultaria
 * achá-lo. Quem define a composição da lista é a foto (ids por bucket) — essa
 * parte, sim, é imutável.
 */
export function useWorkItemsByIds(ids: number[]) {
  const chave = [...ids].sort((a, b) => a - b).join(',');

  return useQuery({
    queryKey: ['work-items-by-ids', chave],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const unicos = [...new Set(ids)];
      const out: WorkItemLink[] = [];

      for (let i = 0; i < unicos.length; i += CHUNK) {
        const { data, error } = await (supabase as any)
          .from('devops_work_items')
          .select('id, title, work_item_type, state, web_url')
          .in('id', unicos.slice(i, i + CHUNK));
        if (error) throw error;
        out.push(...((data || []) as WorkItemLink[]));
      }

      // Bug antes de PBI e, dentro do tipo, por id decrescente (mais novo no
      // topo) — a leitura do gestor começa pelo que entrou por último.
      return out.sort((a, b) => {
        const ta = a.work_item_type === 'Bug' ? 0 : 1;
        const tb = b.work_item_type === 'Bug' ? 0 : 1;
        return ta !== tb ? ta - tb : b.id - a.id;
      });
    },
  });
}
