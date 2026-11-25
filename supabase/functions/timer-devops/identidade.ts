// Identidade das ESCRITAS de work item do Timer (docs/timer-identidade-por-dev.md).
//
// Hoje toda escrita sai com o PAT de serviço (DEVOPS_PAT_TIMER) e o History do
// Azure DevOps mostra o dono do PAT. Com TIMER_DEVOPS_DELEGADO ligado, as ops
// `criar`, `reuniao` e `concluir` gravam com um token Microsoft Entra delegado
// da própria pessoa (recurso do Azure DevOps), e o History mostra quem clicou.
//
// Este arquivo é a parte pura: sem Deno, sem rede própria e sem banco. Quem
// fala com o Entra e com o banco entra por `Portas`, para o vitest testar
// (src/test/timerIdentidade.test.ts). Só usa WebCrypto, que existe no Deno e
// no Node.
//
// Regras que não podem afrouxar:
//   • O refresh token nunca fica em claro no banco: AES-256-GCM, com a chave
//     só no secret da edge (TIMER_TOKEN_CHAVE) e o user_id como dado
//     autenticado (a cifra de uma pessoa não abre na linha de outra).
//   • O token é conferido contra o dono a cada renovação: tenant (tid) e
//     sujeito (sub) do id_token que o Entra devolve. Token de outra pessoa
//     não vira escrita em nome de ninguém.
//   • Sem token válido, cai no PAT como hoje, e a queda fica em timer_eventos.
//   • Só 401, 403 e 203 voltam ao PAT: são recusas, o pedido não foi
//     processado. 400 e 5xx NÃO repetem (um POST pode ter criado o item).

/** Recurso (aplicativo) do Azure DevOps no Microsoft Entra. */
export const RECURSO_DEVOPS = '499b84ac-1321-427f-aa17-267ca6975798'

/** `.default` = as permissões delegadas que o app registration tem consentidas. */
export const ESCOPO_PADRAO = `${RECURSO_DEVOPS}/.default`

/** Renova antes de vencer: uma escrita não pode sair com token no fim da vida. */
export const MARGEM_MS = 5 * 60 * 1000

/** O refresh token que volta de cada renovação só é regravado depois disto (menos WAL). */
export const REGRAVAR_APOS_MS = 7 * 24 * 60 * 60 * 1000

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── chave e configuração ────────────────────────────────────────────────────

/** A chave da edge: só "1", "true", "on" ou "sim" ligam. Ausente = desligado. */
export function delegadoLigado(valor: string | null | undefined): boolean {
  return ['1', 'true', 'on', 'sim'].includes((valor ?? '').trim().toLowerCase())
}

export interface ConfigEntra {
  tenantId: string
  clientId: string
  clientSecret: string
  /** Escopo do recurso pedido na renovação. */
  escopo: string
  /** Chave AES-256 em base64 (32 bytes). */
  chave: string
}

/**
 * Lê a configuração do ambiente. Qualquer peça faltando ou malformada devolve
 * null: a edge segue no PAT (falha fechada para o caminho novo, nunca para o
 * Timer).
 */
export function lerConfigEntra(env: (nome: string) => string | null | undefined): ConfigEntra | null {
  const tenantId = (env('TIMER_SSO_TENANT_ID') ?? '').trim().toLowerCase()
  const clientId = (env('TIMER_ENTRA_CLIENT_ID') ?? '').trim().toLowerCase()
  const clientSecret = (env('TIMER_ENTRA_CLIENT_SECRET') ?? '').trim()
  const chave = (env('TIMER_TOKEN_CHAVE') ?? '').trim()
  const escopo = (env('TIMER_DEVOPS_ESCOPO') ?? '').trim() || ESCOPO_PADRAO
  if (!GUID.test(tenantId) || !GUID.test(clientId) || !clientSecret) return null
  if (bytesDaChave(chave) === null) return null
  // um escopo só, e do recurso do Azure DevOps: a edge não pede token de outra API
  if (!/^[A-Za-z0-9:/._-]+$/.test(escopo) || !escopo.toLowerCase().startsWith(`${RECURSO_DEVOPS}/`)) return null
  return { tenantId, clientId, clientSecret, escopo, chave }
}

// ─── cabeçalho de autorização ────────────────────────────────────────────────

export type Identidade = 'pessoa' | 'servico'

export interface Autorizacao {
  identidade: Identidade
  /** Valor do cabeçalho Authorization. */
  authorization: string
}

/** PAT: Basic com usuário vazio (igual ao _shared/devops.ts). */
export function autorizacaoPat(pat: string): string {
  return `Basic ${btoa(`:${pat}`)}`
}

/**
 * Com a chave ligada e um token da pessoa na mão, a escrita sai como a pessoa
 * (Bearer). Em qualquer outro caso, sai com o PAT de serviço, como hoje.
 */
export function escolherAutorizacao(e: { ligado: boolean; tokenPessoa: string | null; pat: string }): Autorizacao {
  if (e.ligado && e.tokenPessoa) return { identidade: 'pessoa', authorization: `Bearer ${e.tokenPessoa}` }
  return { identidade: 'servico', authorization: autorizacaoPat(e.pat) }
}

/**
 * O Azure DevOps RECUSOU a credencial (e portanto não processou o pedido)?
 * 203 é a página de login devolvida no lugar do JSON. Só estes voltam ao PAT.
 */
export function ehFalhaDeAutorizacao(status: number): boolean {
  return status === 401 || status === 403 || status === 203
}

// ─── renovação no Entra ──────────────────────────────────────────────────────

export function urlDoToken(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
}

/**
 * Corpo do grant refresh_token. `openid` faz o Entra devolver o id_token (é
 * por ele que se confere o dono) e `offline_access` devolve o refresh token
 * novo. `profile` e `email` ficam de fora: não se combinam com `.default`.
 */
export function corpoDaRenovacao(cfg: ConfigEntra, refreshToken: string): string {
  return new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: `openid offline_access ${cfg.escopo}`,
  }).toString()
}

/** Erros do Entra em que tentar de novo com o mesmo refresh token não adianta. */
const ERROS_DEFINITIVOS = new Set([
  'invalid_grant',
  'interaction_required',
  'consent_required',
  'login_required',
  'unauthorized_client',
])

export interface TokenEntra {
  accessToken: string
  /** O Entra troca o refresh token a cada uso; pode não vir. */
  refreshToken: string | null
  /** Epoch em ms. */
  expiraEm: number
  /** Claims do id_token (vem direto do endpoint de token, por TLS). */
  claims: Record<string, unknown> | null
}

export type RespostaToken =
  | { ok: true; token: TokenEntra }
  | { ok: false; erro: string; definitivo: boolean }

function claimsDoJwt(jwt: unknown): Record<string, unknown> | null {
  if (typeof jwt !== 'string') return null
  const partes = jwt.split('.')
  if (partes.length !== 3) return null
  try {
    const b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)))
    return json && typeof json === 'object' ? (json as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Interpreta a resposta do endpoint de token (sucesso ou erro OAuth). */
export function lerRespostaDoToken(status: number, json: unknown, agora: number): RespostaToken {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  if (status >= 200 && status < 300 && typeof o.access_token === 'string' && o.access_token) {
    const segundos = Number(o.expires_in)
    return {
      ok: true,
      token: {
        accessToken: o.access_token,
        refreshToken: typeof o.refresh_token === 'string' && o.refresh_token ? o.refresh_token : null,
        // sem expires_in confiável, trata como já vencendo: renova na próxima
        expiraEm: agora + (Number.isFinite(segundos) && segundos > 0 ? segundos * 1000 : 0),
        claims: claimsDoJwt(o.id_token),
      },
    }
  }
  const erro = typeof o.error === 'string' && /^[a-z_]{1,40}$/.test(o.error) ? o.error : `http_${status}`
  return { ok: false, erro, definitivo: ERROS_DEFINITIVOS.has(erro) }
}

/** O token ainda serve para uma escrita agora? */
export function tokenValido(t: { expiraEm: number } | null | undefined, agora: number, margemMs = MARGEM_MS): boolean {
  return !!t && t.expiraEm - agora > margemMs
}

export type MotivoDono = 'sem_id_token' | 'tenant_diferente' | 'sem_sub' | 'outra_pessoa'

/**
 * O token é de quem diz ser? Confere o tenant e o sujeito do id_token. O `sub`
 * do Entra é por pessoa E por aplicativo: o mesmo app devolve sempre o mesmo
 * `sub` para a mesma pessoa, e é ele que a Supabase guarda na identidade
 * `azure` do usuário.
 */
export function conferirDono(
  claims: Record<string, unknown> | null,
  esperado: { tenantId: string; sub: string | null },
): { ok: true; sub: string } | { ok: false; motivo: MotivoDono } {
  if (!claims) return { ok: false, motivo: 'sem_id_token' }
  const tid = typeof claims.tid === 'string' ? claims.tid.toLowerCase() : ''
  if (!tid || tid !== esperado.tenantId.toLowerCase()) return { ok: false, motivo: 'tenant_diferente' }
  const sub = typeof claims.sub === 'string' ? claims.sub : ''
  if (!sub || !esperado.sub) return { ok: false, motivo: 'sem_sub' }
  if (sub !== esperado.sub) return { ok: false, motivo: 'outra_pessoa' }
  return { ok: true, sub }
}

/** O `sub` da identidade Microsoft que a Supabase guardou para o usuário. */
export function subDaIdentidadeAzure(
  identities: { provider: string; identity_data?: Record<string, unknown> | null }[] | null | undefined,
): string | null {
  const azure = (identities ?? []).find((i) => i.provider === 'azure')
  const sub = azure?.identity_data?.sub
  return typeof sub === 'string' && sub ? sub : null
}

/** Refresh token vindo do navegador: formato plausível e tamanho com teto. */
export function refreshTokenPlausivel(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length >= 20 && valor.length <= 8192 && /^[A-Za-z0-9._~+/=-]+$/.test(valor)
}

// ─── cifra do refresh token (AES-256-GCM) ────────────────────────────────────

function deBase64(texto: string) {
  try {
    const b64 = texto.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

function paraBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function bytesDaChave(chave: string) {
  const bytes = deBase64(chave)
  return bytes && bytes.length === 32 ? bytes : null
}

async function importarChave(chave: string): Promise<CryptoKey | null> {
  const bytes = bytesDaChave(chave)
  if (!bytes) return null
  return await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

// (as BufferSource: o tipo do TextEncoder varia entre o Deno e o TypeScript do app)
const dadoAutenticado = (userId: string) => new TextEncoder().encode(`timer-devops:${userId.toLowerCase()}`) as BufferSource

/** Formato gravado: `v1.<iv>.<cifra+tag>` em base64url. */
export const FORMATO_CIFRADO = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/

export async function cifrar(chave: string, userId: string, texto: string): Promise<string> {
  const k = await importarChave(chave)
  if (!k) throw new Error('chave_invalida')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cifra = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: dadoAutenticado(userId) },
    k,
    new TextEncoder().encode(texto) as BufferSource,
  )
  return `v1.${paraBase64Url(iv)}.${paraBase64Url(new Uint8Array(cifra))}`
}

/** null = não abriu (chave trocada, linha de outra pessoa, texto adulterado). */
export async function decifrar(chave: string, userId: string, cifrado: string): Promise<string | null> {
  if (!FORMATO_CIFRADO.test(cifrado)) return null
  const [, ivB64, cifraB64] = cifrado.split('.')
  const iv = deBase64(ivB64)
  const cifra = deBase64(cifraB64)
  const k = await importarChave(chave)
  if (!iv || !cifra || !k) return null
  try {
    const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: dadoAutenticado(userId) }, k, cifra)
    return new TextDecoder().decode(claro)
  } catch {
    return null
  }
}

// ─── o token da pessoa, do cache ao Entra ────────────────────────────────────

/** A linha de privado.timer_devops_token, como a RPC devolve. */
export interface VinculoGuardado {
  refresh_cifrado: string
  entra_sub: string
  /** ISO da última vez em que o refresh token foi regravado. */
  renovado_em: string
}

export interface Portas {
  /** Cache em memória da instância (access token nunca vai ao banco). */
  cache: {
    ler(userId: string): { accessToken: string; expiraEm: number } | null
    gravar(userId: string, t: { accessToken: string; expiraEm: number }): void
    apagar(userId: string): void
  }
  lerVinculo(userId: string): Promise<VinculoGuardado | null>
  regravarVinculo(userId: string, refreshCifrado: string): Promise<void>
  apagarVinculo(userId: string): Promise<void>
  /** POST no endpoint de token do Entra; devolve status e corpo já em JSON. */
  renovar(cfg: ConfigEntra, refreshToken: string): Promise<{ status: number; json: unknown }>
}

export type MotivoSemToken =
  | 'sem_vinculo'
  | 'cifra_nao_abre'
  | 'renovacao_recusada'
  | 'renovacao_falhou'
  | 'dono_nao_confere'

export type TokenDaPessoa =
  | { ok: true; accessToken: string; doCache: boolean }
  | { ok: false; motivo: MotivoSemToken; erro?: string }

/**
 * Um access token do Azure DevOps válido para a pessoa, ou o motivo de não
 * haver. Ordem: cache da instância → vínculo guardado → renovação no Entra.
 *
 * O vínculo é apagado quando não tem mais conserto (o Entra recusou em
 * definitivo, a cifra não abre, o token é de outra pessoa): a pessoa volta a
 * vincular no próximo login. Falha passageira (rede, 5xx) mantém o vínculo.
 */
export async function obterTokenDaPessoa(
  userId: string,
  cfg: ConfigEntra,
  portas: Portas,
  agora = Date.now(),
): Promise<TokenDaPessoa> {
  const guardado = portas.cache.ler(userId)
  if (guardado && tokenValido(guardado, agora)) return { ok: true, accessToken: guardado.accessToken, doCache: true }

  const vinculo = await portas.lerVinculo(userId)
  if (!vinculo) return { ok: false, motivo: 'sem_vinculo' }

  const refresh = await decifrar(cfg.chave, userId, vinculo.refresh_cifrado)
  if (!refresh) {
    await portas.apagarVinculo(userId)
    return { ok: false, motivo: 'cifra_nao_abre' }
  }

  let bruto: { status: number; json: unknown }
  try {
    bruto = await portas.renovar(cfg, refresh)
  } catch {
    return { ok: false, motivo: 'renovacao_falhou', erro: 'rede' }
  }
  const r = lerRespostaDoToken(bruto.status, bruto.json, agora)
  if (r.ok === false) {
    if (!r.definitivo) return { ok: false, motivo: 'renovacao_falhou', erro: r.erro }
    await portas.apagarVinculo(userId)
    return { ok: false, motivo: 'renovacao_recusada', erro: r.erro }
  }

  const dono = conferirDono(r.token.claims, { tenantId: cfg.tenantId, sub: vinculo.entra_sub })
  if (dono.ok === false) {
    await portas.apagarVinculo(userId)
    return { ok: false, motivo: 'dono_nao_confere', erro: dono.motivo }
  }

  // O refresh token antigo continua valendo depois de usado; regravar a cada
  // renovação seria uma escrita por hora por pessoa. Regrava de tempos em
  // tempos, o bastante para a janela de inatividade nunca chegar perto do fim.
  const idade = agora - new Date(vinculo.renovado_em).getTime()
  if (r.token.refreshToken && r.token.refreshToken !== refresh && !(idade < REGRAVAR_APOS_MS)) {
    try {
      await portas.regravarVinculo(userId, await cifrar(cfg.chave, userId, r.token.refreshToken))
    } catch {
      // o antigo ainda serve: a escrita de agora não depende disto
    }
  }

  portas.cache.gravar(userId, { accessToken: r.token.accessToken, expiraEm: r.token.expiraEm })
  return { ok: true, accessToken: r.token.accessToken, doCache: false }
}

export type ResultadoVinculo =
  | { ok: true; refreshCifrado: string; sub: string; accessToken: string; expiraEm: number }
  | { ok: false; motivo: 'entra_recusou' | 'entra_indisponivel' | 'dono_nao_confere'; erro: string }

/**
 * Primeiro vínculo: o refresh token chega do navegador (veio do login SSO).
 * Antes de guardar, ele é TROCADO no Entra — prova que é válido, que serve
 * para o Azure DevOps e de quem é. Guarda-se o que voltou da troca, cifrado.
 */
export async function prepararVinculo(
  userId: string,
  subEsperado: string | null,
  refreshToken: string,
  cfg: ConfigEntra,
  renovar: Portas['renovar'],
  agora = Date.now(),
): Promise<ResultadoVinculo> {
  let bruto: { status: number; json: unknown }
  try {
    bruto = await renovar(cfg, refreshToken)
  } catch {
    return { ok: false, motivo: 'entra_indisponivel', erro: 'rede' }
  }
  const r = lerRespostaDoToken(bruto.status, bruto.json, agora)
  if (r.ok === false) return { ok: false, motivo: r.definitivo ? 'entra_recusou' : 'entra_indisponivel', erro: r.erro }
  const dono = conferirDono(r.token.claims, { tenantId: cfg.tenantId, sub: subEsperado })
  if (dono.ok === false) return { ok: false, motivo: 'dono_nao_confere', erro: dono.motivo }
  return {
    ok: true,
    refreshCifrado: await cifrar(cfg.chave, userId, r.token.refreshToken ?? refreshToken),
    sub: dono.sub,
    accessToken: r.token.accessToken,
    expiraEm: r.token.expiraEm,
  }
}
