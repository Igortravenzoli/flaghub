/**
 * Lançamento no TimeLog (TechsBCN), do lado do app: agrupar o que falta
 * lançar e dizer em que pé está cada lançamento. Quem soma de verdade é o
 * banco (timer_lancamento_preparar); aqui é só a prévia da tela, com a mesma
 * conta (segundos somados, arredondados para minutos).
 */
import { duracaoSeg, REGRAS_PADRAO, type Lancamento, type TrechoFechado } from '@/lib/timerRelogio';

export interface GrupoPendente {
  chave: string;
  /** YYYY-MM-DD no fuso de São Paulo */
  dia: string;
  work_item_id: number;
  titulo: string;
  tipo: string;
  segundos: number;
  minutos: number;
  trechos: number;
}

/** Dia (YYYY-MM-DD) de um instante, no fuso de São Paulo. */
export function diaSP(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: REGRAS_PADRAO.fuso }).format(new Date(iso));
}

/** Trechos fechados, não descartados e ainda não lançados, por item × dia. */
export function gruposPendentes(trechos: TrechoFechado[]): GrupoPendente[] {
  const mapa = new Map<string, GrupoPendente>();
  for (const t of trechos) {
    if (t.descartado || t.lancamento_id) continue;
    const dia = diaSP(t.iniciado_em);
    const chave = `${dia}|${t.work_item_id}`;
    const g = mapa.get(chave) ?? {
      chave,
      dia,
      work_item_id: t.work_item_id,
      titulo: t.titulo,
      tipo: t.tipo,
      segundos: 0,
      minutos: 0,
      trechos: 0,
    };
    g.segundos += duracaoSeg(t);
    g.trechos += 1;
    mapa.set(chave, g);
  }
  return [...mapa.values()]
    .map((g) => ({ ...g, minutos: Math.round(g.segundos / 60) }))
    .filter((g) => g.minutos >= 1)
    .sort((a, b) => (a.dia === b.dia ? b.minutos - a.minutos : a.dia < b.dia ? 1 : -1));
}

/** Pode lançar? Só os últimos 7 dias (a mesma janela do servidor). */
export function dentroDaJanela(dia: string, hoje: string): boolean {
  const d = Date.parse(`${dia}T12:00:00Z`);
  const h = Date.parse(`${hoje}T12:00:00Z`);
  const dias = Math.round((h - d) / 86_400_000);
  return dias >= 0 && dias <= 7;
}

export type SituacaoLancamento =
  | 'enviando'
  | 'aguardando_conferencia'
  | 'conferido'
  | 'divergente'
  | 'excluido'
  | 'erro'
  | 'cancelado';

/** Em que pé está, juntando o status do envio com o que o sync trouxe. */
export function situacao(l: Lancamento): SituacaoLancamento {
  if (l.status === 'enviando') return 'enviando';
  if (l.status === 'erro') return 'erro';
  if (l.status === 'cancelado') return 'cancelado';
  if (l.excluido_na_origem) return 'excluido';
  if (!l.conferido) return 'aguardando_conferencia';
  if (l.minutos_timelog != null && l.minutos_timelog !== l.minutos) return 'divergente';
  return 'conferido';
}

export const ROTULO_SITUACAO: Record<SituacaoLancamento, string> = {
  enviando: 'Enviando',
  aguardando_conferencia: 'Lançado · aguardando conferência',
  conferido: 'Conferido no TimeLog',
  divergente: 'Alterado no TimeLog',
  excluido: 'Excluído no TimeLog',
  erro: 'Erro no envio',
  cancelado: 'Não lançado',
};

/** Situações que pedem atenção da pessoa. */
export function pedeAtencao(s: SituacaoLancamento): boolean {
  return s === 'erro' || s === 'cancelado' || s === 'divergente' || s === 'excluido';
}

/** "2026-11-16" → "seg., 16/11" */
export function rotuloDia(dia: string): string {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(
    new Date(`${dia}T12:00:00Z`),
  );
}
