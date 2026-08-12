import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { normalizeCollaboratorName } from '@/hooks/useFabricaKpis';
import { isoLocal, lagDias, segundaDaSemana, semTrilha } from '@/lib/timelogTrilha';

export interface LancamentoDetalhe {
  id: string;
  /** Nome canônico do colaborador */
  colaborador: string;
  taskId: number;
  taskTitulo: string;
  taskUrl: string | null;
  pbiId: number | null;
  pbiTitulo: string | null;
  pbiUrl: string | null;
  /** Dia trabalhado, declarado no lançamento (YYYY-MM-DD) */
  dia: string;
  inicio: string | null;
  minutos: number;
  /** Quando o lançamento chegou ao portal (ISO) */
  registradoEm: string;
  /** Dias entre o dia trabalhado e o registro; null quando a trilha não é confiável */
  atrasoDias: number | null;
  /** Versão do lançamento: >1 = editado no DevOps depois de criado */
  versao: number;
  notas: string | null;
  /**
   * Lançamento apagado no DevOps depois de coletado. Fica visível no relatório
   * (o portal tem o rastro), mas NÃO entra em nenhuma soma — decisão do gestor
   * de 12/08/2026: hora removida não é contabilizada.
   */
  removido: boolean;
}

/** Por que um lançamento chamou atenção. Vazio = nada atípico. */
export type MotivoAtipico =
  | 'dia_acima_8h'
  | 'dia_acima_12h'
  | 'lancamento_longo'
  | 'registro_atrasado'
  | 'registro_fora_do_periodo'
  | 'editado';

export const ROTULO_MOTIVO: Record<MotivoAtipico, string> = {
  dia_acima_8h: 'dia acima de 8h',
  dia_acima_12h: 'dia acima de 12h',
  lancamento_longo: 'lançamento único ≥ 12h',
  registro_atrasado: 'registrado 2+ dias depois',
  registro_fora_do_periodo: 'registrado após o fim do período',
  editado: 'editado no DevOps',
};

export interface LancamentoAtipico extends LancamentoDetalhe {
  motivos: MotivoAtipico[];
  /** Total do dia dessa pessoa, para dar contexto ao motivo de jornada */
  minutosNoDia: number;
}

export interface DiaAtividade {
  dia: string;
  /** minutos trabalhados por colaborador naquele dia (dia informado no lançamento) */
  porColaborador: Record<string, number>;
  total: number;
  /** minutos REGISTRADOS nesse dia, independente do dia informado */
  totalRegistrado: number;
  /** maior atraso, em dias, entre os lançamentos deste dia (0 = tudo lançado no dia) */
  atrasoMaxDias: number;
  /** quantos lançamentos deste dia foram registrados depois */
  lancamentosAtrasados: number;
  /** algum lançamento do dia veio de antes da recarga — atraso desconhecido */
  temSemTrilha: boolean;
}

interface LogRow {
  id: string;
  ext_entry_id: string | null;
  user_name: string;
  work_item_id: number;
  log_date: string;
  start_time: string | null;
  time_minutes: number | null;
  notes: string | null;
  ingested_at: string;
  etag: string | null;
}

const DIA_ALERTA_MIN = 8 * 60;
const DIA_ERRO_MIN = 12 * 60;
const LANCAMENTO_LONGO_MIN = 12 * 60;
const ATRASO_DIAS = 2;

/**
 * Atividade de um ou mais colaboradores no período, lançamento a lançamento.
 *
 * Serve à visão que o gestor pediu: além de quanto cada um trabalhou, QUANDO
 * registrou — separar quem lança no dia de quem concentra tudo no fim da sprint.
 * `log_date` é o dia declarado; `ingested_at` é quando o portal viu o
 * lançamento (coleta de 15 em 15 min).
 */
export function useColaboradorAtividade(
  colaboradores: string[],
  dateFrom?: Date | null,
  dateTo?: Date | null,
  pbiByTaskId?: Record<number, number>,
) {
  const fromStr = dateFrom ? isoLocal(dateFrom) : null;
  const toStr = dateTo ? isoLocal(dateTo) : null;
  const alvo = useMemo(
    () => new Set(colaboradores.map((n) => normalizeCollaboratorName(n))),
    [colaboradores],
  );
  const habilitado = colaboradores.length > 0 && !!fromStr && !!toStr;

  const logsQuery = useQuery({
    queryKey: ['colab-atividade', fromStr, toStr],
    enabled: habilitado,
    staleTime: 5 * 60 * 1000,
    queryFn: async () =>
      fetchAllRows<LogRow>((from, to) =>
        (supabase as any)
          .from('devops_time_logs')
          .select('id, ext_entry_id, user_name, work_item_id, log_date, start_time, time_minutes, notes, ingested_at, etag')
          .gte('log_date', fromStr)
          .lte('log_date', toStr)
          .range(from, to),
      ),
  });

  /**
   * Lançamentos removidos na origem, para o mesmo recorte.
   *
   * A tabela crua continua completa de propósito: é o rastro que permite dizer
   * ao colaborador O QUE foi apagado. Quem soma é a view `ativos`.
   */
  const removidosQuery = useQuery({
    queryKey: ['colab-atividade-removidos', fromStr, toStr],
    enabled: habilitado,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('devops_time_log_orphans')
        .select('ext_entry_id')
        .gte('log_date', fromStr)
        .lte('log_date', toStr);
      return new Set(((data || []) as Array<{ ext_entry_id: string }>).map(r => r.ext_entry_id));
    },
  });

  const mapaQuery = useQuery({
    queryKey: ['colab-atividade-map'],
    enabled: habilitado,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('devops_collaborator_map')
        .select('timelog_name, canonical_name') as {
          data: Array<{ timelog_name: string; canonical_name: string }> | null;
        };
      const m = new Map<string, string>();
      for (const r of data || []) m.set(normalizeCollaboratorName(r.timelog_name), r.canonical_name);
      return m;
    },
  });

  /** Só as linhas das pessoas pedidas, já com o nome canônico resolvido. */
  const linhasDoAlvo = useMemo(() => {
    const cmap = mapaQuery.data;
    const out: Array<LogRow & { canonico: string }> = [];
    for (const r of logsQuery.data || []) {
      const norm = normalizeCollaboratorName(r.user_name);
      const canonico = cmap?.get(norm) ?? r.user_name;
      if (!alvo.has(norm) && !alvo.has(normalizeCollaboratorName(canonico))) continue;
      out.push({ ...r, canonico });
    }
    return out;
  }, [logsQuery.data, mapaQuery.data, alvo]);

  const itemIds = useMemo(() => {
    const ids = new Set<number>();
    for (const r of linhasDoAlvo) {
      ids.add(r.work_item_id);
      const pai = pbiByTaskId?.[r.work_item_id];
      if (pai != null) ids.add(pai);
    }
    return [...ids].sort((a, b) => a - b);
  }, [linhasDoAlvo, pbiByTaskId]);

  const itensQuery = useQuery({
    queryKey: ['colab-atividade-itens', itemIds.join(',')],
    enabled: itemIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const data = await fetchAllRows<{ id: number; title: string | null; web_url: string | null }>(
        (from, to) =>
          supabase
            .from('devops_work_items')
            .select('id, title, web_url')
            .in('id', itemIds)
            .range(from, to),
      );
      const m = new Map<number, { title: string | null; web_url: string | null }>();
      for (const it of data) m.set(it.id, { title: it.title, web_url: it.web_url });
      return m;
    },
  });

  const lancamentos: LancamentoDetalhe[] = useMemo(() => {
    const itens = itensQuery.data;
    return linhasDoAlvo
      .map((r) => {
        const pbiId = pbiByTaskId?.[r.work_item_id] ?? null;
        const task = itens?.get(r.work_item_id);
        const pbi = pbiId != null ? itens?.get(pbiId) : undefined;
        const versaoNum = Number(r.etag);
        return {
          id: r.id,
          removido: !!r.ext_entry_id && (removidosQuery.data?.has(r.ext_entry_id) ?? false),
          colaborador: r.canonico,
          taskId: r.work_item_id,
          taskTitulo: task?.title ?? `#${r.work_item_id}`,
          taskUrl: task?.web_url ?? null,
          pbiId: pbiId !== r.work_item_id ? pbiId : null,
          pbiTitulo: pbiId != null && pbiId !== r.work_item_id ? (pbi?.title ?? `#${pbiId}`) : null,
          pbiUrl: pbiId != null && pbiId !== r.work_item_id ? (pbi?.web_url ?? null) : null,
          dia: r.log_date,
          inicio: r.start_time,
          minutos: r.time_minutes || 0,
          registradoEm: r.ingested_at,
          atrasoDias: semTrilha(r.ingested_at) ? null : lagDias(r.log_date, r.ingested_at),
          versao: Number.isFinite(versaoNum) ? versaoNum : 1,
          notas: r.notes,
        } satisfies LancamentoDetalhe;
      })
      .sort((a, b) => a.dia.localeCompare(b.dia) || (a.inicio || '').localeCompare(b.inicio || ''));
  }, [linhasDoAlvo, itensQuery.data, pbiByTaskId, removidosQuery.data]);

  /** Só o que conta. Removido fica fora de toda soma e de todo gráfico. */
  const lancamentosAtivos = useMemo(
    () => lancamentos.filter((l) => !l.removido),
    [lancamentos],
  );

  /** O rastro: apagado no DevOps, listado no relatório, fora da conta. */
  const removidos = useMemo(
    () => lancamentos.filter((l) => l.removido),
    [lancamentos],
  );

  /** Série diária cobrindo TODO o range — dias sem apontamento entram zerados. */
  const porDia: DiaAtividade[] = useMemo(() => {
    if (!dateFrom || !dateTo) return [];
    const mapa = new Map<string, DiaAtividade>();
    for (const d = new Date(dateFrom); d <= dateTo; d.setDate(d.getDate() + 1)) {
      const iso = isoLocal(d);
      mapa.set(iso, {
        dia: iso, porColaborador: {}, total: 0, totalRegistrado: 0,
        atrasoMaxDias: 0, lancamentosAtrasados: 0, temSemTrilha: false,
      });
    }
    for (const l of lancamentosAtivos) {
      const e = mapa.get(l.dia);
      if (e) {
        e.porColaborador[l.colaborador] = (e.porColaborador[l.colaborador] || 0) + l.minutos;
        e.total += l.minutos;
        if (l.atrasoDias == null) e.temSemTrilha = true;
        else if (l.atrasoDias >= 1) {
          e.lancamentosAtrasados++;
          if (l.atrasoDias > e.atrasoMaxDias) e.atrasoMaxDias = l.atrasoDias;
        }
      }
      // dia do REGISTRO (não o informado) — revela concentração no fim da sprint
      const reg = mapa.get(l.registradoEm.slice(0, 10));
      if (reg) reg.totalRegistrado += l.minutos;
    }
    return [...mapa.values()];
  }, [lancamentosAtivos, dateFrom, dateTo]);

  const atipicos: LancamentoAtipico[] = useMemo(() => {
    const minutosDiaPessoa = new Map<string, number>();
    for (const l of lancamentosAtivos) {
      const k = `${l.colaborador}|${l.dia}`;
      minutosDiaPessoa.set(k, (minutosDiaPessoa.get(k) || 0) + l.minutos);
    }
    const fimPeriodo = dateTo
      ? new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate(), 23, 59, 59, 999).getTime()
      : null;

    return lancamentosAtivos
      .map((l) => {
        const noDia = minutosDiaPessoa.get(`${l.colaborador}|${l.dia}`) || 0;
        const motivos: MotivoAtipico[] = [];
        if (noDia > DIA_ERRO_MIN) motivos.push('dia_acima_12h');
        else if (noDia > DIA_ALERTA_MIN) motivos.push('dia_acima_8h');
        if (l.minutos >= LANCAMENTO_LONGO_MIN) motivos.push('lancamento_longo');
        if (l.atrasoDias != null && l.atrasoDias >= ATRASO_DIAS) motivos.push('registro_atrasado');
        if (l.atrasoDias != null && fimPeriodo != null && new Date(l.registradoEm).getTime() > fimPeriodo) {
          motivos.push('registro_fora_do_periodo');
        }
        if (l.versao > 1) motivos.push('editado');
        return { ...l, motivos, minutosNoDia: noDia };
      })
      .filter((l) => l.motivos.length > 0)
      .sort((a, b) => b.motivos.length - a.motivos.length || b.minutos - a.minutos);
  }, [lancamentosAtivos, dateTo]);

  /** Agregado por semana ISO (segunda a domingo) — a leitura de ritmo. */
  const porSemana = useMemo(() => {
    const m = new Map<string, { semana: string; minutos: number; registrado: number; dias: number }>();
    for (const d of porDia) {
      const k = segundaDaSemana(d.dia);
      const e = m.get(k) ?? { semana: k, minutos: 0, registrado: 0, dias: 0 };
      e.minutos += d.total;
      e.registrado += d.totalRegistrado;
      if (d.total > 0) e.dias++;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => a.semana.localeCompare(b.semana));
  }, [porDia]);

  return {
    lancamentos: lancamentosAtivos,
    /** Apagados na origem: aparecem no relatório, não entram em soma nenhuma. */
    removidos,
    porDia,
    porSemana,
    atipicos,
    totalMinutos: lancamentosAtivos.reduce((s, l) => s + l.minutos, 0),
    isLoading: logsQuery.isLoading || mapaQuery.isLoading || itensQuery.isLoading,
    isError: logsQuery.isError,
  };
}
