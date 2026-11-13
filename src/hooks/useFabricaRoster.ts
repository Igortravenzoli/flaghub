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
  /** Horas produtivas por dia útil (base da capacidade do período). */
  capacidade_h_dia: number;
  /** Se as horas contam como hora de fábrica. false = lead só gestor (não opera). */
  conta_horas: boolean;
  /**
   * Percentual da pessoa nesta fábrica (1–100). Quem divide o tempo entre duas
   * fábricas tem uma linha em cada. Ver `buildAlocacaoMap` em @/lib/fabricaRoster.
   */
  alocacao_pct: number;
}

const COLUNAS_BASE = 'colaborador, squad, papel, ativo, capacidade_h_dia, conta_horas';

/**
 * Lê o roster ativo. Compartilhado com o relatório em PDF, que busca sob
 * demanda e não passa pelo hook.
 *
 * Se a coluna `alocacao_pct` ainda não existir (front publicado antes da
 * migration), relê sem ela e assume 100%: a tela segue de pé com o cadastro
 * antigo em vez de cair inteira por causa de uma coluna.
 */
export async function carregarRoster(): Promise<SquadMembershipRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tabela = () => (supabase as any).from('fabrica_squad_membership');
  let { data, error } = await tabela().select(`${COLUNAS_BASE}, alocacao_pct`).eq('ativo', true);
  if (error?.code === '42703') {
    ({ data, error } = await tabela().select(COLUNAS_BASE).eq('ativo', true));
  }
  if (error) throw error;
  return ((data || []) as Partial<SquadMembershipRow>[]).map((r) => ({
    ...r,
    alocacao_pct: Number(r.alocacao_pct) > 0 ? Number(r.alocacao_pct) : 100,
  })) as SquadMembershipRow[];
}

/** Roster fixo pessoa -> fábrica. Base da visão por fábrica e do uso cruzado. */
export function useFabricaRoster() {
  return useQuery({
    queryKey: ['fabrica-squad-roster'],
    queryFn: carregarRoster,
    staleTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
