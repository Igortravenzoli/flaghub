/**
 * "Minhas atividades" — o que está atribuído ao usuário logado no Azure DevOps,
 * lido do ESPELHO `devops_work_items` (nenhuma chamada ao Azure).
 *
 * - "Meu" = `assigned_to_unique` igual ao e-mail do login (o SSO é Azure AD,
 *   então o e-mail do FlagHub é o uniqueName do DevOps). Comparação sem caixa.
 * - Só PBI, Bug e Task ainda abertos.
 * - Os ancestrais (PBI, Feature, Epic) vêm em seguida, um nível por vez (no
 *   máximo 3), só para dar nome aos grupos.
 *
 * Limite conhecido: o espelho cobre as queries cadastradas em devops_queries e
 * os filhos Task/Bug delas. Item atribuído fora desse universo não aparece.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ItemDevops } from '@/lib/minhasAtividades';

const COLUNAS = 'id, title, state, work_item_type, parent_id, iteration_path, web_url, tags, synced_at';

export interface MinhasAtividades {
  itens: ItemDevops[];
  ancestrais: ItemDevops[];
  /** sincronização mais recente entre os itens (do cron do espelho) */
  sincronizadoEm: string | null;
}

type Linha = ItemDevops & { synced_at: string | null };

export function useMinhasAtividades(email: string | null | undefined) {
  return useQuery({
    queryKey: ['minhas-atividades', email?.toLowerCase() ?? null],
    enabled: !!email,
    queryFn: async (): Promise<MinhasAtividades> => {
      const { data, error } = await supabase
        .from('devops_work_items')
        .select(COLUNAS)
        .ilike('assigned_to_unique', email as string)
        .in('work_item_type', ['Product Backlog Item', 'Bug', 'Task'])
        .not('state', 'in', '("Done","Closed","Removed")')
        .limit(1000);
      if (error) throw error;
      const itens = (data ?? []) as unknown as Linha[];

      const conhecidos = new Set(itens.map((i) => i.id));
      const ancestrais: Linha[] = [];
      let fronteira: Linha[] = itens;
      for (let nivel = 0; nivel < 3 && fronteira.length > 0; nivel++) {
        const ids = [
          ...new Set(
            fronteira
              .map((i) => i.parent_id)
              .filter((p): p is number => p != null && !conhecidos.has(p)),
          ),
        ];
        if (ids.length === 0) break;
        ids.forEach((id) => conhecidos.add(id));
        const { data: pais, error: e2 } = await supabase
          .from('devops_work_items')
          .select(COLUNAS)
          .in('id', ids);
        if (e2) throw e2;
        fronteira = (pais ?? []) as unknown as Linha[];
        ancestrais.push(...fronteira);
      }

      const sincronizadoEm =
        itens.reduce<string | null>(
          (max, i) => (i.synced_at && (!max || i.synced_at > max) ? i.synced_at : max),
          null,
        ) ?? null;
      return { itens, ancestrais, sincronizadoEm };
    },
  });
}
