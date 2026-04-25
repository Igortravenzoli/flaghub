import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';

export interface MovimentacaoCliente {
  id: string;
  cliente_codigo: number | null;
  cliente_nome: string | null;
  tipo: string;
  data_evento: string | null;
  sistema: string | null;
  bandeira: string | null;
  motivo: string | null;
  valor_mensal: number | null;
  status_encerramento: string | null;
  ano_referencia: number | null;
  created_at: string;
}

export interface PesquisaSatisfacao {
  id: string;
  cliente_codigo: number | null;
  cliente_nome: string | null;
  bandeira: string | null;
  data_pesquisa: string | null;
  responsavel_contato: string | null;
  notas_por_produto: Record<string, number | null> | null;
  qualitativo: Record<string, string | boolean | null> | null;
  created_at: string;
}

export function useComercialMovimentacao(tipoFilter?: 'perda' | 'ganho' | 'todos', dateFrom?: Date, dateTo?: Date) {
  const query = useQuery({
    queryKey: ['comercial', 'movimentacao', tipoFilter],
    queryFn: async () => {
      let q = supabase
        .from('comercial_movimentacao_clientes')
        .select('*')
        .order('data_evento', { ascending: false });

      if (tipoFilter && tipoFilter !== 'todos') {
        q = q.eq('tipo', tipoFilter);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MovimentacaoCliente[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const allItems = query.data ?? [];

  const items = useMemo(() => {
    if (!dateFrom || !dateTo) return allItems;
    return allItems.filter((item) => {
      // Items without data_evento (e.g. Risco) are always shown when a date filter is active
      if (!item.data_evento) return true;
      const d = new Date(item.data_evento);
      return d >= dateFrom && d <= dateTo;
    });
  }, [allItems, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const perdas = items.filter((i) => i.tipo === 'perda');
    const ganhos = items.filter((i) => i.tipo === 'ganho');
    const valorPerdas = perdas.reduce((sum, i) => sum + (i.valor_mensal ?? 0), 0);
    const valorGanhos = ganhos.reduce((sum, i) => sum + (i.valor_mensal ?? 0), 0);
    return {
      totalPerdas: perdas.length,
      totalGanhos: ganhos.length,
      valorPerdas,
      valorGanhos,
      saldo: valorGanhos - valorPerdas,
      saldoClientes: ganhos.length - perdas.length,
    };
  }, [items]);

  return {
    items,
    allItems,
    stats,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useComercialPesquisa() {
  const query = useQuery({
    queryKey: ['comercial', 'pesquisa-satisfacao'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comercial_pesquisa_satisfacao')
        .select('*')
        .order('data_pesquisa', { ascending: false });

      if (error) throw error;
      return (data ?? []) as PesquisaSatisfacao[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const items = query.data ?? [];

  const stats = useMemo(() => {
    if (items.length === 0) return { total: 0, mediaGeral: null, bandeiras: [] as string[] };

    const allNotas: number[] = [];
    for (const item of items) {
      if (item.notas_por_produto) {
        for (const val of Object.values(item.notas_por_produto)) {
          if (typeof val === 'number') allNotas.push(val);
        }
      }
    }

    const mediaGeral = allNotas.length > 0
      ? Math.round((allNotas.reduce((s, n) => s + n, 0) / allNotas.length) * 10) / 10
      : null;

    const bandeiras = [...new Set(items.map((i) => i.bandeira).filter(Boolean))] as string[];

    return { total: items.length, mediaGeral, bandeiras };
  }, [items]);

  return {
    items,
    stats,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
