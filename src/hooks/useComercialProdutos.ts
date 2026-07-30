import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ProdutoComercial {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}

const KEY = ['comercial', 'produtos'];

/**
 * Catálogo de produtos comerciais — fonte única do **nome** e da **ordem**.
 *
 * Renomear é RPC transacional (`rename_produto_comercial`): o nome é a chave de
 * casamento entre `comercial_metas` e `comercial_venda_itens`, então um UPDATE
 * solto zeraria a Qtd Realizada em silêncio.
 */
export function useComercialProdutos() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('comercial_produtos')
        .select('id, nome, ordem, ativo')
        .order('ordem')
        .order('nome');
      if (error) throw error;
      return (data ?? []) as ProdutoComercial[];
    },
    staleTime: 60 * 1000,
  });

  /** Invalida também metas e vendas — o rename muda o nome nas três tabelas. */
  const invalidateTudo = () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ['comercial', 'metas'] });
    qc.invalidateQueries({ queryKey: ['comercial', 'vendas'] });
  };

  const renomear = useMutation({
    mutationFn: async ({ de, para }: { de: string; para: string }) => {
      const db = supabase as any;
      const { data, error } = await db.rpc('rename_produto_comercial', { p_de: de, p_para: para });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        metas: Number(row?.metas_atualizadas ?? 0),
        itens: Number(row?.itens_atualizados ?? 0),
      };
    },
    onSuccess: invalidateTudo,
  });

  const reordenar = useMutation({
    mutationFn: async (nomesEmOrdem: string[]) => {
      const db = supabase as any;
      const { error } = await db.rpc('reordenar_produtos_comercial', { p_nomes: nomesEmOrdem });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const produtos = query.data ?? [];

  /** Posição de cada produto — usada para ordenar listas derivadas de metas. */
  const ordemPorNome = new Map(produtos.map(p => [p.nome, p.ordem]));

  /**
   * Comparador para qualquer lista que tenha nome de produto.
   * Produto fora do catálogo vai para o fim (ordem +∞), em ordem alfabética.
   */
  const compararPorOrdem = (a: string, b: string) => {
    const oa = ordemPorNome.get(a);
    const ob = ordemPorNome.get(b);
    if (oa != null && ob != null && oa !== ob) return oa - ob;
    if (oa != null && ob == null) return -1;
    if (oa == null && ob != null) return 1;
    return a.localeCompare(b);
  };

  return {
    produtos,
    ordemPorNome,
    compararPorOrdem,
    isLoading: query.isLoading,
    isError: query.isError,
    renomear,
    reordenar,
  };
}
