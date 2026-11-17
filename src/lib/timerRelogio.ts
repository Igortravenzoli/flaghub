/**
 * Regras e contas do relógio do Timer Flag, puras (testáveis).
 *
 * O servidor é o relógio: início e fim de cada trecho são o now() do banco.
 * Aqui o app só (1) desenha o tempo correndo a partir do que o servidor
 * devolveu, corrigindo a diferença entre o relógio da máquina e o do
 * servidor, e (2) decide QUANDO falar com o servidor (sinal, pergunta de
 * presença, suspensão detectada). As regras em si moram em timer_regras().
 */

export interface RegrasTimer {
  sinal_seg: number;
  sem_sinal_seg: number;
  presenca_seg: number;
  presenca_tolerancia_seg: number;
  trecho_max_seg: number;
  dia_max_seg: number;
  fuso: string;
}

export const REGRAS_PADRAO: RegrasTimer = {
  sinal_seg: 300,
  sem_sinal_seg: 900,
  presenca_seg: 3600,
  presenca_tolerancia_seg: 600,
  trecho_max_seg: 14400,
  dia_max_seg: 43200,
  fuso: 'America/Sao_Paulo',
};

export type MotivoFim =
  | 'manual'
  | 'troca_tarefa'
  | 'sem_sinal'
  | 'sem_confirmacao'
  | 'limite_trecho'
  | 'limite_dia'
  | 'meia_noite'
  | 'suspensao'
  | 'bloqueio'
  | 'ocioso'
  | 'acesso_revogado'
  | 'parcial';

/** Demanda aberta: nasceu ao iniciar o item e fica até a pessoa encerrar (TM8). */
export interface Demanda {
  id: string;
  work_item_id: number;
  titulo: string;
  tipo: string;
  projeto: string | null;
  aberta_em: string;
  ultima_atividade_em: string;
}

export interface TrechoRodando {
  id: string;
  work_item_id: number;
  titulo: string;
  tipo: string;
  projeto: string | null;
  iniciado_em: string;
  ultimo_sinal_em: string;
  ultima_presenca_em: string;
}

export interface TrechoFechado {
  id: string;
  work_item_id: number;
  titulo: string;
  tipo: string;
  projeto: string | null;
  iniciado_em: string;
  encerrado_em: string;
  encerrado_original_em: string | null;
  motivo_fim: MotivoFim;
  descartado: boolean;
  /** preenchido quando o trecho entrou num lançamento (aí fica travado) */
  lancamento_id?: string | null;
}

export type StatusLancamento = 'enviando' | 'lancado' | 'erro' | 'cancelado';

export interface Lancamento {
  id: string;
  work_item_id: number;
  titulo: string | null;
  dia: string;
  inicio: string;
  minutos: number;
  notas: string | null;
  status: StatusLancamento;
  erro: string | null;
  tentativas: number;
  enviado_em: string | null;
  criado_em: string;
  /** minutos do documento no TimeLog, depois que o sync o trouxe */
  minutos_timelog: number | null;
  conferido: boolean;
  excluido_na_origem: boolean;
}

export interface EstadoTimer {
  agora: string;
  regras: RegrasTimer;
  rodando: TrechoRodando | null;
  trechos: TrechoFechado[];
  lancamentos: Lancamento[];
  demandas: Demanda[];
  fechado_hoje_seg: number;
}

/** Normaliza o jsonb de timer_estado (e das RPCs que devolvem o estado). */
export function lerEstado(bruto: unknown): EstadoTimer {
  const o = (bruto ?? {}) as Partial<EstadoTimer>;
  return {
    agora: typeof o.agora === 'string' ? o.agora : new Date().toISOString(),
    regras: { ...REGRAS_PADRAO, ...(o.regras ?? {}) },
    rodando: o.rodando && typeof o.rodando === 'object' ? (o.rodando as TrechoRodando) : null,
    trechos: Array.isArray(o.trechos) ? (o.trechos as TrechoFechado[]) : [],
    lancamentos: Array.isArray(o.lancamentos) ? (o.lancamentos as Lancamento[]) : [],
    demandas: Array.isArray(o.demandas) ? (o.demandas as Demanda[]) : [],
    fechado_hoje_seg: Number(o.fechado_hoje_seg) || 0,
  };
}

/** Diferença (ms) entre o relógio do servidor e o da máquina, no momento da resposta. */
export function desvioServidor(agoraServidorIso: string, agoraLocalMs: number): number {
  const s = Date.parse(agoraServidorIso);
  return Number.isFinite(s) ? s - agoraLocalMs : 0;
}

const ms = (iso: string) => Date.parse(iso);

/** Segundos do trecho rodando, no relógio do servidor. */
export function segundosRodando(rodando: TrechoRodando | null, agoraServidorMs: number): number {
  if (!rodando) return 0;
  return Math.max(0, Math.floor((agoraServidorMs - ms(rodando.iniciado_em)) / 1000));
}

export function duracaoSeg(t: Pick<TrechoFechado, 'iniciado_em' | 'encerrado_em'>): number {
  return Math.max(0, Math.round((ms(t.encerrado_em) - ms(t.iniciado_em)) / 1000));
}

/** Segundos fechados de um item que ainda não foram lançados nem descartados. */
export function aLancarDoItem(trechos: TrechoFechado[], workItemId: number): number {
  return trechos
    .filter((t) => t.work_item_id === workItemId && !t.descartado && !t.lancamento_id)
    .reduce((s, t) => s + duracaoSeg(t), 0);
}

/** Total do dia: o que já fechou (servidor) + o que está rodando. */
export function totalHojeSeg(estado: EstadoTimer, agoraServidorMs: number): number {
  return estado.fechado_hoje_seg + segundosRodando(estado.rodando, agoraServidorMs);
}

/** "01:02:03" */
export function relogio(seg: number): string {
  const s = Math.max(0, Math.floor(seg));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return [h, m, r].map((n) => String(n).padStart(2, '0')).join(':');
}

/** "3h 05min", "45min", "0min" */
export function horas(seg: number): string {
  const totalMin = Math.max(0, Math.floor(seg / 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

/** "14:05", no fuso de São Paulo. */
export function horaCurta(iso: string, fuso = REGRAS_PADRAO.fuso): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fuso }).format(new Date(iso));
}

/** "seg., 16/11", no fuso de São Paulo. */
export function diaCurto(iso: string, fuso = REGRAS_PADRAO.fuso): string {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: fuso }).format(
    new Date(iso),
  );
}

// ---------------------------------------------------------------------------
// Presença
// ---------------------------------------------------------------------------

/** Quando a pergunta "ainda está aqui?" deve aparecer (ms, relógio do servidor). */
export function presencaPerguntarEm(rodando: TrechoRodando, regras: RegrasTimer): number {
  return ms(rodando.ultima_presenca_em) + regras.presenca_seg * 1000;
}

/** Até quando dá para responder (depois disso o servidor corta). */
export function presencaPrazo(rodando: TrechoRodando, regras: RegrasTimer): number {
  return presencaPerguntarEm(rodando, regras) + regras.presenca_tolerancia_seg * 1000;
}

export function devePerguntarPresenca(rodando: TrechoRodando | null, regras: RegrasTimer, agoraServidorMs: number): boolean {
  return !!rodando && agoraServidorMs >= presencaPerguntarEm(rodando, regras);
}

// ---------------------------------------------------------------------------
// Sinal e suspensão
// ---------------------------------------------------------------------------

/** O próximo sinal: sinal_seg depois do último que o servidor registrou. */
export function sinalDevido(rodando: TrechoRodando | null, regras: RegrasTimer, agoraServidorMs: number): boolean {
  return !!rodando && agoraServidorMs - ms(rodando.ultimo_sinal_em) >= regras.sinal_seg * 1000;
}

/**
 * Lacuna entre dois tiques do relógio local maior que isto = a máquina
 * dormiu (ou o processo congelou). O navegador segura timers de aba oculta
 * em até 1 tique por minuto, então o limiar fica bem acima disso.
 */
export const LIMIAR_SUSPENSAO_MS = 3 * 60 * 1000;

export function houveSuspensao(ultimoTiqueMs: number, agoraMs: number, limiarMs = LIMIAR_SUSPENSAO_MS): boolean {
  return agoraMs - ultimoTiqueMs > limiarMs;
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

export const ROTULO_MOTIVO: Record<MotivoFim, string> = {
  manual: 'Pausado',
  troca_tarefa: 'Trocou de tarefa',
  sem_sinal: 'Sem sinal do app',
  sem_confirmacao: 'Presença não confirmada',
  limite_trecho: 'Limite de 4 h',
  limite_dia: 'Limite de 12 h no dia',
  meia_noite: 'Virada do dia',
  suspensao: 'Computador suspenso',
  bloqueio: 'Tela bloqueada',
  ocioso: 'Sem uso',
  acesso_revogado: 'Acesso revogado',
  parcial: 'Lançado sem encerrar',
};

/**
 * Por que o trecho terminou, curto, para a coluna Situação ("Lançado · sem
 * conexão"). null = nada a acrescentar (o "Lançar" da própria pessoa).
 */
export const MOTIVO_CURTO: Record<MotivoFim, string | null> = {
  manual: 'pausa',
  troca_tarefa: 'troca de tarefa',
  sem_sinal: 'sem conexão',
  sem_confirmacao: 'ausência',
  limite_trecho: 'limite de 4 h',
  limite_dia: 'limite de 12 h',
  meia_noite: 'virada do dia',
  suspensao: 'PC suspenso',
  bloqueio: 'tela bloqueada',
  ocioso: 'inatividade',
  acesso_revogado: 'acesso revogado',
  parcial: null,
};

/** As notas que a edge grava no lançamento automático das 23:50. */
export const NOTA_LANCAMENTO_AUTO = 'Timer Flag (automático 23:50)';

export type EstadoTrecho = 'lancado' | 'a_lancar' | 'descartado';

export interface SituacaoTrecho {
  estado: EstadoTrecho;
  /** "Lançado", "A lançar", "Descartado" */
  rotulo: string;
  /** o motivo curto ("sem conexão", "fim do dia"), ou null */
  detalhe: string | null;
  /** parou pelas regras, não pela pessoa: merece destaque */
  alerta: boolean;
}

/** Hora | Tempo | Situação: o que aconteceu com o trecho, numa expressão só. */
export function situacaoTrecho(t: TrechoFechado, lancamentos: Pick<Lancamento, 'id' | 'notas'>[]): SituacaoTrecho {
  const estado: EstadoTrecho = t.descartado ? 'descartado' : t.lancamento_id ? 'lancado' : 'a_lancar';
  const rotulo = estado === 'lancado' ? 'Lançado' : estado === 'descartado' ? 'Descartado' : 'A lançar';
  const auto =
    t.motivo_fim === 'parcial' &&
    !!t.lancamento_id &&
    lancamentos.some((l) => l.id === t.lancamento_id && l.notas === NOTA_LANCAMENTO_AUTO);
  const detalhe = auto ? 'fim do dia' : MOTIVO_CURTO[t.motivo_fim] ?? null;
  return { estado, rotulo, detalhe, alerta: !t.descartado && foiAutomatico(t.motivo_fim) };
}

/** Fechado pelas regras (não pela pessoa): merece destaque na lista. */
export function foiAutomatico(motivo: MotivoFim): boolean {
  return ['sem_sinal', 'sem_confirmacao', 'limite_trecho', 'limite_dia', 'acesso_revogado'].includes(motivo);
}

const MENSAGENS_ERRO: Record<string, string> = {
  timer_sem_acesso: 'Seu acesso ao Timer não está ativo.',
  timer_item_invalido: 'Item inválido.',
  timer_tipo_invalido: 'Só Task, PBI e Bug recebem horas.',
  timer_muitas_acoes: 'Muitas ações em pouco tempo. Espere um pouco e tente de novo.',
  timer_limite_dia: 'Você já chegou às 12 h de hoje.',
  timer_motivo_invalido: 'Motivo de pausa inválido.',
  timer_trecho_inexistente: 'Trecho não encontrado.',
  timer_trecho_rodando: 'Pause o timer antes de mexer neste trecho.',
  timer_trecho_descartado: 'Este trecho já foi descartado.',
  timer_trecho_antigo: 'Só dá para mexer em trechos dos últimos 7 dias.',
  timer_correcao_so_reduz: 'A correção só pode encurtar o trecho (fim entre o início e o fim atual).',
  timer_trecho_lancado: 'Este trecho já foi lançado no TimeLog: não dá mais para mudar.',
  timer_celular: 'No celular o Timer é só consulta. Inicie pelo computador.',
};

/** Mensagem amigável a partir do erro do PostgREST (o texto do RAISE vem em message). */
export function mensagemErroTimer(erro: unknown): string {
  const msg = (erro as { message?: string } | null)?.message ?? '';
  const chave = Object.keys(MENSAGENS_ERRO).find((k) => msg.includes(k));
  return chave ? MENSAGENS_ERRO[chave] : 'Não foi possível falar com o servidor. Tente de novo.';
}

/** Converte "HH:MM" (fuso de São Paulo) no dia de `baseIso` para ISO. */
export function horaNoDia(baseIso: string, hhmm: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  // São Paulo não tem horário de verão desde 2019: UTC−3 fixo.
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: REGRAS_PADRAO.fuso }).format(new Date(baseIso));
  const iso = `${dia}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00-03:00`;
  return Number.isFinite(Date.parse(iso)) ? new Date(iso).toISOString() : null;
}
