// Cliente HTTP único para o Azure DevOps.
//
// Nasceu do incidente de 31/08/2026: o circuit breaker interno do Azure DevOps
// (`HttpClientThrottler-IdentityHttpClient`, 110 chamadas simultâneas ao
// serviço de identidade) estourou e vazou para a UI ao salvar work item. Não
// houve como responder "fomos nós?": nenhuma chamada nossa mandava
// User-Agent, então o nosso tráfego era indistinguível do de qualquer aba de
// board aberta na página de Usage da organização.
//
// Duas responsabilidades, as duas ausentes antes:
//
//   1. IDENTIFICAR. Todo request sai nomeando a rotina que o disparou. A
//      página https://dev.azure.com/FlagIW/_usersSettings/usage passa a
//      separar o que é nosso — e, dentro do nosso, qual sync está pesando.
//      Sem isso a pergunta "somos responsáveis?" não tem resposta possível.
//
//   2. RECUAR. 429 e 503 eram tratados como falha qualquer: a rotina
//      registrava o erro e a rodada seguinte batia no mesmo ritmo. Isso não
//      causa saturação, mas prolonga qualquer uma que aconteça. Agora respeita
//      `Retry-After` e, na falta dele, recua exponencialmente com jitter.
//
// REPETIÇÃO E ESCRITA — a regra que não pode ser afrouxada por conveniência:
// 429 é sempre seguro repetir, porque significa que o request foi REJEITADO,
// não processado. 5xx não é: um POST que cria work item, comentário ou
// documento pode ter sido efetivado antes do erro voltar. Por isso 5xx só
// repete em método idempotente (GET/HEAD) — salvo quando o chamador afirma o
// contrário via `retryOn5xx`, que existe só para as LEITURAS que o Azure exige
// via POST (WIQL e workitemsbatch). Nunca marque `retryOn5xx` num POST que
// cria: o preço do engano é item duplicado no board.

/** Teto para `Retry-After`: acima disso é melhor falhar e tentar na próxima
 *  rodada do cron do que segurar a execução da edge até o timeout dela. */
const RETRY_AFTER_MAX_S = 60

const METODOS_IDEMPOTENTES = new Set(['GET', 'HEAD'])

/** Abaixo disso o orçamento da organização vira log de aviso. */
const ORCAMENTO_BAIXO = 100

export interface DevopsFetchOptions {
  /** Rotina chamadora, como aparecerá no User-Agent. Ex.: 'sync-qualidade'. */
  client: string
  /** Tentativas extras depois da primeira. Default 3. */
  maxRetries?: number
  /** Base do recuo exponencial, em ms. Default 500. */
  baseDelayMs?: number
  /**
   * Repete 5xx mesmo em método não idempotente. Só para POST de LEITURA
   * (WIQL, workitemsbatch). Ver o bloco sobre repetição no topo do arquivo.
   */
  retryOn5xx?: boolean
}

/** User-Agent identificável na página de Usage da organização. */
export function devopsUserAgent(client: string): string {
  return `FlagHub-Sync/1.0 (Flag; rotina=${client})`
}

/** Header de autenticação do PAT (Basic com usuário vazio). */
export function devopsAuthHeaders(pat: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${btoa(`:${pat}`)}`,
  }
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** `Retry-After` aceita segundos ou data HTTP; os dois aparecem no Azure. */
function lerRetryAfter(header: string | null): number | null {
  if (!header) return null

  const segundos = Number(header)
  if (Number.isFinite(segundos)) {
    return Math.max(0, Math.min(segundos, RETRY_AFTER_MAX_S)) * 1000
  }

  const quando = Date.parse(header)
  if (Number.isNaN(quando)) return null
  const faltam = (quando - Date.now()) / 1000
  return Math.max(0, Math.min(faltam, RETRY_AFTER_MAX_S)) * 1000
}

/**
 * Deixa rastro do orçamento da organização.
 *
 * `X-RateLimit-Delay` é a prova direta de autoria numa saturação: o Azure só
 * manda esse header quando JÁ ATRASOU a nossa requisição de propósito. Se ele
 * aparecer no mesmo minuto de um circuit breaker na UI, o tráfego é nosso; se
 * não aparecer em rodada nenhuma, a saturação veio de outro lado. É o sinal
 * que faltava em 31/08/2026 para responder a pergunta sem achismo.
 *
 * `X-RateLimit-Remaining` é o aviso prévio: o orçamento caindo diz que o
 * atraso vem em seguida.
 */
function logarOrcamento(resp: Response, client: string): void {
  const atraso = Number(resp.headers.get('x-ratelimit-delay'))
  if (Number.isFinite(atraso) && atraso > 0) {
    console.error(
      `[devops:${client}] ESTRANGULADO — o Azure atrasou esta chamada em ${atraso}s ` +
      `(X-RateLimit-Delay). Somos nós pesando na organização.`
    )
  }

  // Header ausente vira `null`, e `Number(null)` é 0 — sem este teste de
  // presença toda resposta sem o header viraria alarme de orçamento zerado.
  const bruto = resp.headers.get('x-ratelimit-remaining')
  if (bruto === null) return
  const restante = Number(bruto)
  if (!Number.isFinite(restante) || restante >= ORCAMENTO_BAIXO) return
  console.warn(
    `[devops:${client}] orçamento baixo — X-RateLimit-Remaining=${restante} ` +
    `reset=${resp.headers.get('x-ratelimit-reset') ?? '?'}`
  )
}

function urlCurta(url: string): string {
  return url.length > 120 ? `${url.slice(0, 120)}…` : url
}

/**
 * Chamada ao Azure DevOps com identificação, recuo e respeito a `Retry-After`.
 *
 * Devolve a última `Response` mesmo quando ela é de erro — quem chama decide o
 * que fazer com 4xx/5xx, exatamente como no `fetch` cru que isto substituiu.
 * O corpo só é consumido internamente quando a resposta vai ser descartada
 * para uma nova tentativa; a que volta para o chamador chega intacta.
 */
export async function devopsFetch(
  url: string,
  init: RequestInit,
  opts: DevopsFetchOptions,
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? 3
  const baseDelayMs = opts.baseDelayMs ?? 500
  const metodo = (init.method ?? 'GET').toUpperCase()
  const repete5xx = opts.retryOn5xx ?? METODOS_IDEMPOTENTES.has(metodo)

  const headers = new Headers(init.headers)
  headers.set('User-Agent', devopsUserAgent(opts.client))

  for (let tentativa = 0; ; tentativa++) {
    const resp = await fetch(url, { ...init, headers })
    logarOrcamento(resp, opts.client)

    const estrangulado = resp.status === 429
    const instavel = resp.status >= 500 && repete5xx
    if (!estrangulado && !instavel) return resp

    // Última tentativa: devolve a resposta real, com corpo intacto, para o
    // chamador registrar o status de verdade em vez de um erro sintético.
    if (tentativa >= maxRetries) return resp

    const espera = lerRetryAfter(resp.headers.get('retry-after'))
      ?? Math.round(baseDelayMs * 2 ** tentativa * (1 + Math.random()))

    console.warn(
      `[devops:${opts.client}] ${resp.status} em ${metodo} ${urlCurta(url)} — ` +
      `recuando ${espera}ms (tentativa ${tentativa + 1}/${maxRetries})`
    )

    await resp.body?.cancel()
    await dormir(espera)
  }
}
