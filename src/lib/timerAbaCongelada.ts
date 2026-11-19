import type { TrechoFechado } from '@/lib/timerRelogio';

/**
 * Aviso "o navegador pode pausar o seu timer" (19/11/2026).
 *
 * Para poupar memória e energia, o navegador congela ou descarta abas em
 * segundo plano. Aba congelada não manda o sinal de 5 em 5 min e, 15 min
 * depois, o servidor pausa o timer no último sinal (sem_sinal). Nos dados de
 * 16 a 19/11, TODOS os cortes do navegador foram assim, fechados pelo job.
 *
 * O aviso explica e oferece as saídas: o app web (PWA), o app desktop ou
 * configurar o navegador para não congelar o site. Um logo por navegador; o
 * passo a passo só abre ao clicar (mock aprovado pelo Igor em 19/11/2026).
 */

export type Navegador = 'chrome' | 'edge' | 'brave' | 'firefox' | 'outro';

/**
 * O navegador de quem está vendo. O Brave se apresenta como Chrome no UA;
 * quem separa é o `navigator.brave`, passado em `ehBrave`.
 */
export function detectarNavegador(userAgent: string, ehBrave = false): Navegador {
  if (/Edg\//.test(userAgent)) return 'edge';
  if (/Firefox\//.test(userAgent)) return 'firefox';
  if (/OPR\/|SamsungBrowser/.test(userAgent)) return 'outro';
  if (/Chrome\/|CriOS\//.test(userAgent)) return ehBrave ? 'brave' : 'chrome';
  return 'outro';
}

export interface InstrucaoNavegador {
  id: Exclude<Navegador, 'outro'>;
  rotulo: string;
  /** endereço da configuração (não abre por link: a página não pode navegar para lá) */
  endereco: string;
  /** cada passo; `{site}` vira o endereço do Timer e o que está entre crases sai como código */
  passos: string[];
  /** instala o Timer como app web pelo navegador? */
  instalaAppWeb: boolean;
  observacao?: string;
}

const PASSOS_MEMORIA = [
  'Cole o endereço numa aba nova.',
  'Em "Economia de memória", abra "Sempre manter estes sites ativos" e clique em "Adicionar".',
  'Cole {site} e confirme.',
];

export const INSTRUCOES_NAVEGADOR: InstrucaoNavegador[] = [
  { id: 'chrome', rotulo: 'Chrome', endereco: 'chrome://settings/performance', passos: PASSOS_MEMORIA, instalaAppWeb: true },
  {
    id: 'edge',
    rotulo: 'Edge',
    endereco: 'edge://settings/system',
    passos: [
      'Cole o endereço numa guia nova.',
      'Em "Otimizar o desempenho", abra "Nunca colocar esses sites em suspensão" e clique em "Adicionar".',
      'Cole {site} e confirme.',
    ],
    instalaAppWeb: true,
  },
  { id: 'brave', rotulo: 'Brave', endereco: 'brave://settings/system', passos: PASSOS_MEMORIA, instalaAppWeb: true },
  {
    id: 'firefox',
    rotulo: 'Firefox',
    endereco: 'about:config',
    passos: ['Cole o endereço numa aba nova e aceite o aviso.', 'Procure `browser.tabs.unloadOnLowMemory` e deixe em `false`.'],
    instalaAppWeb: false,
    observacao: 'O Firefox só descarrega abas quando falta memória, e não instala o app web.',
  },
];

export function instrucaoDe(navegador: Navegador): InstrucaoNavegador {
  return INSTRUCOES_NAVEGADOR.find((i) => i.id === navegador) ?? INSTRUCOES_NAVEGADOR[0];
}

// ---------------------------------------------------------------------------
// Quando abrir sozinho
// ---------------------------------------------------------------------------

export const CHAVE_NAO_EXIBIR = 'timer-flag:aviso-aba:nao-exibir';
/** o último corte sem sinal já avisado (id do trecho) */
export const CHAVE_CORTE_VISTO = 'timer-flag:aviso-aba:corte-visto';
/** já avisou nesta sessão do navegador, ao ver o timer rodando */
export const CHAVE_SESSAO_VISTO = 'timer-flag:aviso-aba:sessao';
/** a pessoa já abriu o aviso (apaga o ponto do sino) */
export const CHAVE_LIDO = 'timer-flag:aviso-aba:lido';

/** O corte por falta de sinal mais recente do dia, se houver. */
export function ultimoCorteSemSinal(trechos: TrechoFechado[]): TrechoFechado | null {
  return trechos
    .filter((t) => t.motivo_fim === 'sem_sinal' && !t.descartado)
    .reduce<TrechoFechado | null>((a, t) => (!a || Date.parse(t.encerrado_em) > Date.parse(a.encerrado_em) ? t : a), null);
}

export type MotivoAviso = 'corte' | 'rodando';

/**
 * Abre sozinho? Só numa aba comum (nem no app desktop, nem no app web
 * instalado) e nunca depois do "Não exibir novamente":
 *   • 'corte': o servidor pausou um timer por falta de sinal, e esse corte
 *     ainda não foi avisado;
 *   • 'rodando': há timer rodando e o aviso ainda não apareceu nesta sessão.
 */
export function motivoParaAbrir(p: {
  abaComum: boolean;
  naoExibir: boolean;
  corte: TrechoFechado | null;
  corteVisto: string | null;
  rodando: boolean;
  vistoNaSessao: boolean;
}): MotivoAviso | null {
  if (!p.abaComum || p.naoExibir) return null;
  if (p.corte && p.corte.id !== p.corteVisto) return 'corte';
  if (p.rodando && !p.vistoNaSessao) return 'rodando';
  return null;
}
