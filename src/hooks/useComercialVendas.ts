import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VendaItem {
  id?: string;
  produto: string;
  quantidade: number;
  /** Preço unitário do item (null quando não informado). */
  valor_unitario: number | null;
  /** Override manual do total — quando null, vale quantidade × valor_unitario. */
  valor_total: number | null;
}

/** Valor efetivo do item: override manual, ou quantidade × unitário. */
export function valorDoItem(i: Pick<VendaItem, 'quantidade' | 'valor_unitario' | 'valor_total'>): number | null {
  if (i.valor_total != null) return i.valor_total;
  if (i.valor_unitario == null) return null;
  return i.quantidade * i.valor_unitario;
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
        .select('*, comercial_venda_itens(id, produto, quantidade, valor_unitario, valor_total)')
        .order('closed_date', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((row) => ({
        ...row,
        itens: (row.comercial_venda_itens ?? []).map((i: any) => ({
          id: i.id,
          produto: i.produto,
          quantidade: i.quantidade ?? 0,
          valor_unitario: i.valor_unitario == null ? null : Number(i.valor_unitario),
          valor_total: i.valor_total == null ? null : Number(i.valor_total),
        })),
      })) as ComercialVenda[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const items = query.data ?? [];

  // `stats` foi removido em 30/07/2026: era código morto (nenhum consumidor o
  // usava — PipeDriveTab calcula os seus próprios) e carregava a terceira cópia
  // do default de R$ 110k/mês. A meta agora vem de @/lib/comercialMetaFinanceira.

  return { items, isLoading: query.isLoading, isError: query.isError, refetch: query.refetch };
}

// ── CRUD payload ──────────────────────────────────────────────────────────────

export interface VendaItemForm {
  produto: string;
  quantidade: string;      // string no form → parsed to int
  valor_unitario: string;  // string no form → parsed to numeric (vazio = null)
  valor_total: string;     // override manual (vazio = derivado de qtd × unitário)
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

function parseDecimal(raw?: string): number | null {
  const v = (raw ?? '').trim().replace(/\./g, '').replace(',', '.');
  if (!v) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function parseItens(data: VendaFormData) {
  return (data.itens ?? [])
    .map((i) => ({
      produto: i.produto.trim(),
      quantidade: parseInt(i.quantidade, 10) || 0,
      valor_unitario: parseDecimal(i.valor_unitario),
      valor_total: parseDecimal(i.valor_total),
    }))
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
