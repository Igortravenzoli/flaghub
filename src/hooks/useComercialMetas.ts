import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MetaFormData } from '@/components/comercial/MetasFormDialog';

export interface MetaComercial extends MetaFormData {
  id: string;
  created_at?: string;
  updated_at?: string;
}

function isoToDdMmYyyy(value: string | null): string {
  if (!value) return '';
  if (/^\d{2}-\d{2}-\d{4}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [yyyy, mm, dd] = value.split('-');
    return `${dd}-${mm}-${yyyy}`;
  }
  return value;
}

function ddMmYyyyToIso(value?: string): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (/^\d{2}-\d{2}-\d{4}$/.test(v)) {
    const [dd, mm, yyyy] = v.split('-');
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function parseIntField(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function parseNumericField(value: string): number | null {
  const raw = value.trim().replace(',', '.');
  if (!raw) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function parseValorMeta(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const normalized = raw.replace(/\./g, '').replace(',', '.').replace(/\s+/g, '').toLowerCase();
  if (normalized.endsWith('k')) {
    const n = Number(normalized.slice(0, -1));
    return Number.isFinite(n) ? n * 1000 : null;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function mapRowToMeta(row: any): MetaComercial {
  return {
    id: row.id,
    nome_indicador: row.produto,
    tipo: row.tipo,
    status: row.status,
    mes: row.mes_referencia,
    valor: row.valor_meta == null ? '' : String(row.valor_meta),
    realizado: row.realizado_quantidade == null ? '' : String(row.realizado_quantidade),
    valor_unitario: row.valor_unitario == null ? '' : String(row.valor_unitario),
    observacao: row.observacao ?? '',
    data_inicio_meta: isoToDdMmYyyy(row.data_inicio_meta),
    data_fim_meta: isoToDdMmYyyy(row.data_fim_meta),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function useComercialMetas() {
  return useQuery({
    queryKey: ['comercial', 'metas'],
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('comercial_metas')
        .select('*')
        .order('mes_referencia', { ascending: true })
        .order('produto', { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapRowToMeta) as MetaComercial[];
    },
    staleTime: 60 * 1000,
  });
}

export function useCreateMetaComercial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: MetaFormData) => {
      const db = supabase as any;
      const { data, error } = await db.rpc('insert_meta_comercial', {
        p_produto: payload.nome_indicador,
        p_tipo: payload.tipo,
        p_status: payload.status,
        p_mes_referencia: payload.mes.toLowerCase(),
        p_valor_meta: parseValorMeta(payload.valor),
        p_observacao: payload.observacao || null,
        p_data_inicio_meta: ddMmYyyyToIso(payload.data_inicio_meta),
        p_data_fim_meta: ddMmYyyyToIso(payload.data_fim_meta),
        p_realizado_quantidade: parseIntField(payload.realizado),
        p_valor_unitario: parseNumericField(payload.valor_unitario),
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comercial', 'metas'] });
    },
  });
}

export function useUpdateMetaComercial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: MetaFormData }) => {
      const db = supabase as any;
      const { data, error } = await db.rpc('update_meta_comercial', {
        p_id: id,
        p_produto: payload.nome_indicador,
        p_tipo: payload.tipo,
        p_status: payload.status,
        p_mes_referencia: payload.mes.toLowerCase(),
        p_valor_meta: parseValorMeta(payload.valor),
        p_observacao: payload.observacao || null,
        p_data_inicio_meta: ddMmYyyyToIso(payload.data_inicio_meta),
        p_data_fim_meta: ddMmYyyyToIso(payload.data_fim_meta),
        p_realizado_quantidade: parseIntField(payload.realizado),
        p_valor_unitario: parseNumericField(payload.valor_unitario),
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comercial', 'metas'] });
    },
  });
}

export function useDeleteMetaComercial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const db = supabase as any;
      const { data, error } = await db.rpc('delete_meta_comercial', { p_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comercial', 'metas'] });
    },
  });
}
