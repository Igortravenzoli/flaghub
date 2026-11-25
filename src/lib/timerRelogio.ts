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
  /** timers rodando ao mesmo tempo (TM9) */
  paralelo_max: number;
  fuso: string;
}

export const REGRAS_PADRAO: RegrasTimer = {
  sinal_seg: 300,
  sem_sinal_seg: 900,
  presenca_seg: 3600,
  presenca_tolerancia_seg: 600,
  trecho_max_seg: 14400,
  dia_max_seg: 43200,
  paralelo_max: 3,
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
  /** o mais recente dos que rodam (compatível com o servidor de antes da TM9) */
  rodando: TrechoRodando | null;
  /** todos os que rodam, do mais recente ao mais antigo (TM9: paralelo) */
  rodandoTodos: TrechoRodando[];
  trechos: TrechoFechado[];
  lancamentos: Lancamento[];
  demandas: Demanda[];
  fechado_hoje_seg: number;
}

/** Normaliza o jsonb de timer_estado (e das RPCs que devolvem o estado). */
export function lerEstado(bruto: unknown): EstadoTimer {
  const o = (bruto ?? {}) as Partial<EstadoTimer> & { rodando_todos?: unknown };
  const rodando = o.rodando && typeof o.rodando === 'object' ? (o.rodando as TrechoRodando) : null;
  return {
    agora: typeof o.agora === 'string' ? o.agora : new Date().toISOString(),
    regras: { ...REGRAS_PADRAO, ...(o.regras ?? {}) },
    rodando,
    rodandoTodos: lerRodandoTodos(o.rodando_todos, rodando),
    trechos: Array.isArray(o.trechos) ? (o.trechos as TrechoFechado[]) : [],
    lancamentos: Array.isArray(o.lancamentos) ? (o.lancamentos as Lancamento[]) : [],
    demandas: Array.isArray(o.demandas) ? (o.demandas as Demanda[]) : [],
    fechado_hoje_seg: Number(o.fechado_hoje_seg) || 0,
  };
}

/** A lista de quem roda; servidor sem a TM9 manda só o `rodando`. */
export function lerRodandoTodos(bruto: unknown, rodando: TrechoRodando | null): TrechoRodando[] {
  if (Array.isArray(bruto)) return bruto.filter((x): x is TrechoRodando => !!x && typeof x === 'object');
  return rodando ? [rodando] : [];
}

/**
 * Sinal e presença valem para a pessoa, não para a tarefa: com vários
 * rodando, o relógio olha o mais atrasado de cada um (o servidor corta pelo
 * trecho, então o primeiro a vencer manda).
 */
export function referenciaPresenca(lista: TrechoRodando[]): TrechoRodando | null {
  if (lista.length === 0) return null;
  const menor = (campo: 'ultimo_sinal_em' | 'ultima_presenca_em') =>
    lista.reduce((a, b) => (ms(b[campo]) < ms(a[campo]) ? b : a));
  const presenca = menor('ultima_presenca_em');
  return { ...presenca, ultimo_sinal_em: menor('ultimo_sinal_em').ultimo_sinal_em };
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

/** Total do dia: o que já fechou (servidor) + o que está rodando (somando os paralelos). */
export function totalHojeSeg(estado: EstadoTimer, agoraServidorMs: number): number {
  return estado.rodandoTodos.reduce((s, r) => s + segundosRodando(r, agoraServidorMs), estado.fechado_hoje_seg);
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

/**
 * O que foi a lacuna no relógio local (23/11/2026). O navegador congela a
 * página para poupar energia (aba em segundo plano, app instalado minimizado)
 * e avisa pelo evento `freeze` da Page Lifecycle API; o computador dormindo
 * não avisa. Antes, os dois viravam "computador suspenso" e o timer pausava,
 * mesmo com a pessoa trabalhando em outro programa.
 *
 *   • normal    — sem lacuna;
 *   • congelada — houve `freeze` depois do último tique: a pessoa pode estar
 *                 trabalhando; o app NÃO pausa e manda o sinal na hora. O
 *                 servidor segue sendo o teto: passou de sem_sinal_seg sem
 *                 sinal, ele já fechou no último sinal;
 *   • suspensao — lacuna sem `freeze`: a máquina dormiu (ou o processo parou);
 *                 pausa no último tique, como antes.
 */
export type Lacuna = 'normal' | 'congelada' | 'suspensao';

export function classificarLacuna(
  ultimoTiqueMs: number,
  agoraMs: number,
  congeladaEmMs: number | null,
  limiarMs = LIMIAR_SUSPENSAO_MS,
): Lacuna {
  if (!houveSuspensao(ultimoTiqueMs, agoraMs, limiarMs)) return 'normal';
  return congeladaEmMs !== null && congeladaEmMs >= ultimoTiqueMs - 2000 ? 'congelada' : 'suspensao';
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
  timer_muitos_paralelos: 'No máximo 3 timers ao mesmo tempo. Pause um antes de iniciar outro.',
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

// ─── capacidade do dia (barra indicativa) ───────────────────────────────────
// Decisão do Igor (17/11/2026): no lugar do "Teto do dia" (12 h), só uma
// barra de CAPACIDADE de 7 h — verde até 7 h; passando, vai amarelando até
// ficar vermelha (vermelho cheio em 10 h). É indicação, não regra: o teto de
// 12 h continua no servidor (timer_regras), só saiu da tela.
export const CAPACIDADE_DIA_SEG = 7 * 3600;
export const CAPACIDADE_VERMELHO_SEG = 10 * 3600;

export interface Capacidade {
  /** largura da barra, 0–100 (cheia a partir de 7 h) */
  pct: number;
  /** cor da barra: verde (142) → amarelo (~48) → vermelho (0) */
  cor: string;
  /** passou das 7 h */
  acima: boolean;
}

export function capacidadeDia(seg: number): Capacidade {
  const s = Math.max(0, seg);
  const pct = Math.min(100, (s / CAPACIDADE_DIA_SEG) * 100);
  const acima = s > CAPACIDADE_DIA_SEG;
  const frac = Math.min(
    1,
    Math.max(0, (s - CAPACIDADE_DIA_SEG) / (CAPACIDADE_VERMELHO_SEG - CAPACIDADE_DIA_SEG)),
  );
  const hue = Math.round(142 * (1 - frac));
  const luz = Math.round(40 + 8 * Math.sin(Math.PI * frac)); // um pouco mais claro no amarelo
  return { pct, cor: `hsl(${hue} 72% ${luz}%)`, acima };
}

// ---------------------------------------------------------------------------
// Ausência (sem uso do computador): pergunta antes de pausar
// ---------------------------------------------------------------------------

/**
 * Decisão do Igor (18/11/2026): 10 min sem mouse/teclado NÃO pausa na hora.
 * Abre "Você está aí?" (a janela vem para a frente) e espera
 * AUSENCIA_TOLERANCIA_MS pelo clique; sem clique, pausa e conta só até o
 * início da inatividade.
 */
export const OCIOSO_MS = 10 * 60 * 1000;
export const AUSENCIA_TOLERANCIA_MS = 5 * 60 * 1000;

export interface Ausencia {
  /** quando o computador parou de ser usado (relógio da máquina) */
  desdeMs: number;
  /** até quando dá para responder (relógio da máquina) */
  prazoMs: number;
}

export function novaAusencia(desdeMs: number, agoraMs: number): Ausencia {
  return { desdeMs: Math.min(desdeMs, agoraMs), prazoMs: agoraMs + AUSENCIA_TOLERANCIA_MS };
}

export const ausenciaVencida = (a: Ausencia | null, agoraMs: number) => !!a && agoraMs >= a.prazoMs;

// ---------------------------------------------------------------------------
// Hora trabalhada do dia (relógio), sem somar os paralelos
// ---------------------------------------------------------------------------

/** 00:00 de hoje em São Paulo (ms). Sem horário de verão desde 2019: UTC−3. */
export function inicioDoDiaSP(agoraMs: number): number {
  const dia = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(agoraMs));
  return Date.parse(`${dia}T00:00:00-03:00`);
}

/**
 * Hora de RELÓGIO trabalhada hoje (pedido do Igor, 25/11/2026): a união dos
 * trechos do dia, fechados (sem descartados) e rodando. Duas tarefas em
 * paralelo das 14h às 15h dão 1 h aqui, e não 2 h — o "A lançar" e o
 * TimeLog seguem contando a hora inteira em cada tarefa.
 */
export function horaTrabalhadaSeg(estado: EstadoTimer, agoraServidorMs: number): number {
  const ini = inicioDoDiaSP(agoraServidorMs);
  const intervalos: [number, number][] = [];
  for (const t of estado.trechos) {
    if (t.descartado) continue;
    const a = Math.max(ms(t.iniciado_em), ini);
    const b = Math.min(ms(t.encerrado_em), agoraServidorMs);
    if (b > a) intervalos.push([a, b]);
  }
  for (const r of estado.rodandoTodos) {
    const a = Math.max(ms(r.iniciado_em), ini);
    if (agoraServidorMs > a) intervalos.push([a, agoraServidorMs]);
  }
  intervalos.sort((x, y) => x[0] - y[0]);
  let total = 0;
  let fimAtual = -Infinity;
  let iniAtual = -Infinity;
  for (const [a, b] of intervalos) {
    if (a > fimAtual) {
      if (fimAtual > iniAtual) total += fimAtual - iniAtual;
      iniAtual = a;
      fimAtual = b;
    } else if (b > fimAtual) {
      fimAtual = b;
    }
  }
  if (fimAtual > iniAtual) total += fimAtual - iniAtual;
  return Math.floor(total / 1000);
}
