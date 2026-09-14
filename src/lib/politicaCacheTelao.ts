import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Política de cache do telão (modo TV) — egress da Supabase, 14/09/2026.
 *
 * O telão fica ligado 24 h sem ninguém por perto e respondia por ~90% do egress
 * da organização. Medido em edge_logs: um único usuário, 15,5 mil requisições e
 * 5,5 milhões de linhas por dia, com o mesmo volume de madrugada e no domingo.
 * O motivo é mecânico: a rotação desmonta o setor ao sair e remonta ~4 min
 * depois; com `staleTime` de 5 min, cada consulta voltava vencida a cada duas
 * voltas e rebaixava a tabela inteira (SGSI com `fields` jsonb, 11 mil work
 * items), dia e noite, para mostrar números que os crons só mudam de 10 em 10
 * min ou de 6 em 6 h.
 *
 * Em vez de mexer em ~60 hooks (cada um com seu `staleTime` literal, que sempre
 * vence o default do QueryClient), a política intercepta `defaultQueryOptions`,
 * o ponto por onde TODA consulta passa antes de virar observer, e SÓ enquanto
 * estiver ligada (usuário monitor ou modo TV aberto) aplica:
 *
 *   • piso de `staleTime` por faixa: 30 min no geral (DevOps e demais tabelas
 *     de cron), 6 h no espelho SGSI (a sincronização com o SharePoint roda a
 *     cada 6 h) e 4 h no Comercial/pesquisa (lançamento manual e importação
 *     esporádica). Hook que já pede mais que o piso continua valendo;
 *   • pausa fora do expediente (seg–sex 07h–19h, horário de Brasília):
 *     `staleTime` infinito — o telão segue girando com o que já tem e retoma às
 *     07h;
 *   • `gcTime` de pelo menos 2 h, para o cache de um setor fora de tela nunca
 *     ser coletado entre uma visita e outra (coletado = download cheio na volta);
 *   • `refetchOnReconnect` desligado: oscilação de Wi-Fi não vira onda de
 *     releitura de todo setor montado.
 *
 * O que NÃO muda:
 *   • telas de mesa: com a política desligada os defaults saem idênticos aos do
 *     QueryClient puro (há teste garantindo);
 *   • consultas ao gateway VDESK (`techlead`, `gestao`, `bi-customer`,
 *     `helpdesk`): não geram egress da Supabase, então ficam sem piso — só
 *     pausam à noite. Exceção: quando o gateway falha, o `useHelpdeskKpis` cai
 *     num `select *` da Supabase e marca o dado com `source: 'supabase'`; aí
 *     vale o piso padrão;
 *   • `staleTime: 'static'` e `invalidateQueries` (que ignora staleTime);
 *   • chave nova sem dado no cache (troca de dia, de sprint) busca na hora — a
 *     pausa só evita REbaixar o que já está na tela.
 *
 * `staleTime` e `refetchOnReconnect` viram funções, avaliadas na hora em que o
 * TanStack decide buscar — não quando o default foi calculado. Isso garante duas
 * coisas: a virada das 07h/19h vale para opções calculadas antes dela; e uma
 * página de mesa aberta ao sair do Home com o kiosk ligado (botão Voltar), que
 * RENDERIZA com o sinalizador ainda ligado mas MONTA depois de o Home desligá-lo,
 * monta com o comportamento de mesa.
 */

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

export const PISO_TELAO_PADRAO_MS = 30 * MINUTO;
export const PISO_TELAO_SGSI_MS = 6 * HORA;
export const PISO_TELAO_COMERCIAL_MS = 4 * HORA;
export const GC_TELAO_MS = 2 * HORA;

export const EXPEDIENTE_TELAO = {
  fuso: 'America/Sao_Paulo',
  inicioHora: 7,
  fimHora: 19,
} as const;

/** Raízes de queryKey que falam com o gateway VDESK, não com a Supabase. */
const RAIZES_GATEWAY = new Set(['techlead', 'gestao', 'bi-customer', 'helpdesk']);
const RAIZES_COMERCIAL = new Set(['comercial', 'survey_responses', 'survey_aggregates']);

/**
 * Piso de `staleTime` do telão para a chave, ou `null` quando a consulta não
 * passa pela Supabase (gateway VDESK) e portanto não tem piso.
 */
export function pisoTelao(queryKey: QueryKey): number | null {
  const [raiz, sub] = queryKey;
  if (typeof raiz === 'string' && RAIZES_GATEWAY.has(raiz)) return null;
  if (raiz === 'bi-infra' && sub === 'sgsi-rows') return PISO_TELAO_SGSI_MS;
  if (raiz === 'cs' && sub === 'incidentes-declarados') return PISO_TELAO_SGSI_MS;
  if (typeof raiz === 'string' && RAIZES_COMERCIAL.has(raiz)) return PISO_TELAO_COMERCIAL_MS;
  return PISO_TELAO_PADRAO_MS;
}

const DIAS_SEMANA = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let formatador: Intl.DateTimeFormat | null | undefined;

function diaEHoraEmBrasilia(agora: Date): { dia: number; hora: number } {
  if (formatador === undefined) {
    try {
      formatador = new Intl.DateTimeFormat('en-US', {
        timeZone: EXPEDIENTE_TELAO.fuso,
        weekday: 'short',
        hour: '2-digit',
        hourCycle: 'h23',
      });
    } catch {
      formatador = null;
    }
  }
  if (formatador) {
    const partes = formatador.formatToParts(agora);
    const dia = DIAS_SEMANA.indexOf(partes.find((p) => p.type === 'weekday')?.value ?? '');
    const hora = Number(partes.find((p) => p.type === 'hour')?.value);
    if (dia >= 0 && Number.isFinite(hora)) return { dia, hora: hora % 24 };
  }
  // Intl sem o fuso: relógio local (a TV fica em Brasília).
  return { dia: agora.getDay(), hora: agora.getHours() };
}

/** Fora de seg–sex 07h–19h no horário de Brasília (feriado não é considerado). */
export function foraDoExpediente(agora: Date = new Date()): boolean {
  const { dia, hora } = diaEHoraEmBrasilia(agora);
  if (dia === 0 || dia === 6) return true;
  return hora < EXPEDIENTE_TELAO.inicioHora || hora >= EXPEDIENTE_TELAO.fimHora;
}

let politicaAtiva = false;

/** Liga/desliga a política. Quem chama é o Home: usuário monitor ou modo TV aberto. */
export function definirPoliticaTelao(ativa: boolean): void {
  politicaAtiva = ativa;
}

export function politicaTelaoAtiva(): boolean {
  return politicaAtiva;
}

type StaleTimeTelao = number | 'static';

function resolverOpcao(valor: unknown, query: unknown): unknown {
  return typeof valor === 'function' ? valor(query) : valor;
}

function resolverStaleTime(staleTime: unknown, query: unknown): StaleTimeTelao {
  const valor = resolverOpcao(staleTime, query);
  if (valor === 'static') return 'static';
  // Ausente ou NaN vale 0, como no TanStack (`staleTime || 0`). NaN no Math.max
  // deixaria a consulta eternamente vencida — o oposto do que se quer aqui.
  return typeof valor === 'number' && !Number.isNaN(valor) ? valor : 0;
}

/** Dado em cache veio do fallback da Supabase (`useHelpdeskKpis` com o gateway fora). */
function veioDoFallbackSupabase(query: unknown): boolean {
  const dado = (query as { state?: { data?: unknown } } | undefined)?.state?.data;
  return typeof dado === 'object' && dado !== null && (dado as { source?: unknown }).source === 'supabase';
}

/** `staleTime` do telão: avaliado a cada decisão de busca, respeita 'static' e a pausa. */
export function staleTimeDoTelao(original: unknown, queryKey: QueryKey) {
  return (query: unknown): StaleTimeTelao => {
    const base = resolverStaleTime(original, query);
    if (base === 'static') return base;
    if (!politicaAtiva) return base;
    if (foraDoExpediente()) return Infinity;
    const piso = pisoTelao(queryKey) ?? (veioDoFallbackSupabase(query) ? PISO_TELAO_PADRAO_MS : null);
    return piso === null ? base : Math.max(base, piso);
  };
}

interface OpcoesComChave {
  queryKey: QueryKey;
  staleTime?: unknown;
  gcTime?: number;
  refetchOnReconnect?: unknown;
  refetchOnMount?: unknown;
}

export function aplicarPoliticaTelao<T extends OpcoesComChave>(opcoes: T): T {
  const reconexaoOriginal = opcoes.refetchOnReconnect;
  return {
    ...opcoes,
    staleTime: staleTimeDoTelao(opcoes.staleTime, opcoes.queryKey),
    gcTime: Math.max(opcoes.gcTime ?? 0, GC_TELAO_MS),
    refetchOnReconnect: (query: unknown) => (politicaAtiva ? false : resolverOpcao(reconexaoOriginal, query)),
    // 'always' rebaixaria a cada visita, passando por cima de qualquer piso.
    ...(opcoes.refetchOnMount === 'always' ? { refetchOnMount: true } : {}),
  } as T;
}

type OpcoesDefault = Parameters<QueryClient['defaultQueryOptions']>[0];

/**
 * Instala a política no QueryClient. Sem ela ligada, cada chamada cai direto no
 * `defaultQueryOptions` original — as telas de mesa não percebem nada.
 */
export function instalarPoliticaTelao<C extends QueryClient>(client: C): C {
  const original = client.defaultQueryOptions.bind(client);
  const comPolitica = (opcoes: OpcoesDefault) => {
    // Já defaultado = já passou por aqui: devolve como o próprio TanStack faz,
    // em vez de recalcular (e trocar a identidade das opções) a cada setOptions.
    if (opcoes._defaulted || !politicaAtiva) return original(opcoes);
    return aplicarPoliticaTelao(original(opcoes));
  };
  client.defaultQueryOptions = comPolitica as unknown as C['defaultQueryOptions'];
  return client;
}
