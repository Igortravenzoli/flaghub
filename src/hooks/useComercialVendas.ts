import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';

export interface VendaItem {
  id?: string;
  produto: string;
  quantidade: number;
}

export interface ComercialVenda {
  id: string;
  deal_title: string | null;
  organization: string | null;
  observation: string | null;
  deal_value: number | null;
  closed_date: string | null;
  period_month: string | null;
  source_sheet: string | null;
  created_at: string;
  itens: VendaItem[];
}

export function useComercialVendas() {
  const query = useQuery({
    queryKey: ['comercial', 'vendas'],
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('comercial_vendas')
        .select('*, comercial_venda_itens(id, produto, quantidade)')
        .order('closed_date', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((row) => ({
        ...row,
        itens: (row.comercial_venda_itens ?? []).map((i: any) => ({
          id: i.id,
          produto: i.produto,
          quantidade: i.quantidade ?? 0,
        })),
      })) as ComercialVenda[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const items = query.data ?? [];

  const stats = useMemo(() => {
    if (items.length === 0)
      return {
        totalDeals: 0,
        vendasPorOrg: [] as { bandeira: string; percentual: number }[],
        vendasPorMes: [] as { mes: string; percentualMeta: number; atingiuMeta: boolean }[],
        orgs: [] as string[],
      };

    const totalValue = items.reduce((s, i) => s + (i.deal_value ?? 0), 0);

    // Group by organization -> % distribution
    const orgMap = new Map<string, number>();
    for (const item of items) {
      const org = item.organization || 'Outros';
      orgMap.set(org, (orgMap.get(org) ?? 0) + (item.deal_value ?? 0));
    }
    const vendasPorOrg = [...orgMap.entries()]
      .map(([bandeira, val]) => ({
        bandeira,
        percentual: totalValue > 0 ? Math.round((val / totalValue) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.percentual - a.percentual);

    // Group by period_month -> % of meta (fixed monthly target)
    const META_MENSAL = 110_000; // Meta mensal fixa de vendas (R$ 110K)
    const mesMap = new Map<string, number>();
    for (const item of items) {
      const pm = item.period_month?.slice(0, 7) || 'unknown';
      mesMap.set(pm, (mesMap.get(pm) ?? 0) + (item.deal_value ?? 0));
    }

    const vendasPorMes = [...mesMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, val]) => {
        const pct = META_MENSAL > 0 ? Math.round((val / META_MENSAL) * 1000) / 10 : 0;
        return {
          mes: formatMonth(mes),
          percentualMeta: pct,
          atingiuMeta: pct >= 100,
        };
      });

    return {
      totalDeals: items.length,
      vendasPorOrg,
      vendasPorMes,
      orgs: vendasPorOrg.map((v) => v.bandeira),
    };
  }, [items]);

  return { items, stats, isLoading: query.isLoading, isError: query.isError, refetch: query.refetch };
}

// ── CRUD payload ──────────────────────────────────────────────────────────────

export interface VendaItemForm {
  produto: string;
  quantidade: string; // string no form → parsed to int
}

export interface VendaFormData {
  deal_title: string;
  organization: string;
  observation: string;
  deal_value: string;   // string → parsed to numeric
  closed_date: string;  // yyyy-mm-dd (input[type=date] format)
  period_month: string; // yyyy-mm-dd (1st day of month, derived if empty)
  source_sheet: string;
  itens: VendaItemForm[]; // produtos vendidos — alimentam Meta Produtos
}

function parseItens(data: VendaFormData) {
  return (data.itens ?? [])
    .map((i) => ({ produto: i.produto.trim(), quantidade: parseInt(i.quantidade, 10) || 0 }))
    .filter((i) => i.produto && i.quantidade > 0);
}

function buildRow(data: VendaFormData) {
  const val = data.deal_value.trim().replace(',', '.');
  const numVal = val ? parseFloat(val) : null;
  // period_month: use explicit or derive from closed_date
  let pm: string | null = null;
  if (data.period_month) {
    pm = data.period_month;
  } else if (data.closed_date) {
    const [y, m] = data.closed_date.split('-');
    pm = `${y}-${m}-01`;
  }
  return {
    deal_title: data.deal_title || null,
    organization: data.organization || null,
    observation: data.observation || null,
    deal_value: Number.isFinite(numVal) ? numVal : null,
    closed_date: data.closed_date || null,
    period_month: pm,
    source_sheet: data.source_sheet || 'Venda_Produtos',
  };
}

export function useCreateVenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: VendaFormData) => {
      const db = supabase as any;
      const { data: created, error } = await db
        .from('comercial_vendas')
        .insert([buildRow(data)])
        .select('id')
        .single();
      if (error) throw error;
      const itens = parseItens(data);
      if (itens.length > 0 && created?.id) {
        const { error: itensError } = await db
          .from('comercial_venda_itens')
          .insert(itens.map((i) => ({ ...i, venda_id: created.id })));
        if (itensError) throw itensError;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comercial', 'vendas'] }),
  });
}

export function useUpdateVenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: VendaFormData }) => {
      const db = supabase as any;
      const { error } = await db
        .from('comercial_vendas')
        .update(buildRow(data))
        .eq('id', id);
      if (error) throw error;
      // Substitui os itens (delete + insert) para refletir o estado do form
      const { error: delError } = await db
        .from('comercial_venda_itens')
        .delete()
        .eq('venda_id', id);
      if (delError) throw delError;
      const itens = parseItens(data);
      if (itens.length > 0) {
        const { error: insError } = await db
          .from('comercial_venda_itens')
          .insert(itens.map((i) => ({ ...i, venda_id: id })));
        if (insError) throw insError;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comercial', 'vendas'] }),
  });
}

export function useDeleteVenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('comercial_vendas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comercial', 'vendas'] }),
  });
}

function formatMonth(ym: string) {
  const [y, m] = ym.split('-');
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${months[parseInt(m, 10) - 1] ?? m} ${y}`;
}
