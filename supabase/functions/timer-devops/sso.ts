// Regras puras do Timer Flag: validação do SSO e leitura da identidade do
// Azure DevOps. Sem Deno e sem rede, para o vitest testar (src/test/timerSso.test.ts).
//
// Por que tanta checagem para "aprovação automática": o Timer libera sozinho
// para quem entra com a conta Microsoft da Flag. A conta Microsoft prova a
// identidade, mas só se o token vier do tenant da Flag. Um app Azure
// multi-tenant aceita conta de qualquer organização, e o e-mail dessas contas
// não é prova de nada (o caso "nOAuth"). Por isso o que vale é o tenant (tid)
// do id_token, e não o domínio do e-mail. O domínio é só a segunda trava.

export interface IdentidadeSupabase {
  provider: string
  identity_data?: Record<string, unknown> | null
}

export interface UsuarioSupabase {
  id: string
  email?: string | null
  email_confirmed_at?: string | null
  identities?: IdentidadeSupabase[] | null
}

export interface ConfigSso {
  /** Tenant do Azure AD da Flag (secret TIMER_SSO_TENANT_ID). Sem ele, nada é concedido. */
  tenantId: string | null
  /** Domínios de e-mail aceitos (secret TIMER_SSO_DOMINIOS, separado por vírgula). */
  dominios: string[]
}

export type MotivoRecusa =
  | 'configuracao_pendente'
  | 'sem_identidade_microsoft'
  | 'sessao_nao_veio_do_sso'
  | 'tenant_diferente'
  | 'email_ausente'
  | 'email_nao_confirmado'
  | 'email_fora_do_dominio'

export type ResultadoSso =
  | { ok: true; email: string; tenantId: string }
  | { ok: false; motivo: MotivoRecusa }

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Lê o payload de um JWT já validado pelo Auth (getUser). Não valida assinatura. */
export function lerClaimsJwt(token: string): Record<string, unknown> | null {
  const partes = token.split('.')
  if (partes.length !== 3) return null
  try {
    const b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/')
    const preenchido = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const json = JSON.parse(atob(preenchido))
    return json && typeof json === 'object' ? json as Record<string, unknown> : null
  } catch {
    return null
  }
}

/** A sessão atual nasceu de um login OAuth (claim `amr` do Supabase)? */
export function sessaoVeioDeOAuth(claims: Record<string, unknown> | null): boolean {
  const amr = claims?.amr
  if (!Array.isArray(amr)) return false
  return amr.some((m) => {
    if (typeof m === 'string') return m === 'oauth'
    return !!m && typeof m === 'object' && (m as { method?: unknown }).method === 'oauth'
  })
}

/**
 * Tenant do Azure AD que emitiu o id_token. O Supabase guarda as claims do
 * provedor em identity_data: `tid` pode vir em custom_claims, e o `iss` v2.0 é
 * https://login.microsoftonline.com/<tid>/v2.0. Aceita qualquer um dos dois.
 */
export function extrairTenantAzure(identityData: Record<string, unknown> | null | undefined): string | null {
  if (!identityData) return null

  const custom = identityData.custom_claims
  if (custom && typeof custom === 'object') {
    const tid = (custom as Record<string, unknown>).tid
    if (typeof tid === 'string' && GUID.test(tid)) return tid.toLowerCase()
  }

  const tidDireto = identityData.tid
  if (typeof tidDireto === 'string' && GUID.test(tidDireto)) return tidDireto.toLowerCase()

  const iss = identityData.iss
  if (typeof iss === 'string') {
    const m = iss.match(/^https:\/\/(?:login\.microsoftonline\.com|sts\.windows\.net)\/([0-9a-f-]{36})(?:\/|$)/i)
    if (m && GUID.test(m[1])) return m[1].toLowerCase()
  }

  return null
}

export function lerDominios(bruto: string | null | undefined): string[] {
  const lista = (bruto ?? 'flag.com.br')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))
  return lista.length > 0 ? lista : ['flag.com.br']
}

export function validarSsoFlag(
  user: UsuarioSupabase,
  claims: Record<string, unknown> | null,
  config: ConfigSso,
): ResultadoSso {
  const tenantEsperado = config.tenantId?.trim().toLowerCase() ?? ''
  if (!GUID.test(tenantEsperado)) return { ok: false, motivo: 'configuracao_pendente' }

  const azure = (user.identities ?? []).find((i) => i.provider === 'azure')
  if (!azure) return { ok: false, motivo: 'sem_identidade_microsoft' }

  if (!sessaoVeioDeOAuth(claims)) return { ok: false, motivo: 'sessao_nao_veio_do_sso' }

  const tenant = extrairTenantAzure(azure.identity_data)
  if (tenant !== tenantEsperado) return { ok: false, motivo: 'tenant_diferente' }

  const email = (user.email ?? '').trim().toLowerCase()
  if (!email) return { ok: false, motivo: 'email_ausente' }
  if (!user.email_confirmed_at) return { ok: false, motivo: 'email_nao_confirmado' }

  const dominio = email.split('@')[1] ?? ''
  if (!config.dominios.includes(dominio)) return { ok: false, motivo: 'email_fora_do_dominio' }

  return { ok: true, email, tenantId: tenant }
}

export interface IdentidadeDevops {
  guid: string
  display: string | null
  email: string
}

/**
 * Escolhe, na resposta do vssps (identities?searchFilter=MailAddress), a
 * identidade ativa cujo e-mail é exatamente o do SSO. A busca do vssps não é
 * por igualdade estrita, então a conferência fica do nosso lado: sem isso, o
 * primeiro resultado podia ser de outra pessoa e as horas iriam para ela.
 */
export function escolherIdentidadeDevops(resposta: unknown, email: string): IdentidadeDevops | null {
  const alvo = email.trim().toLowerCase()
  const valores = (resposta as { value?: unknown })?.value
  if (!Array.isArray(valores)) return null

  for (const v of valores) {
    if (!v || typeof v !== 'object') continue
    const ident = v as Record<string, unknown>
    if (ident.isActive === false) continue
    const id = typeof ident.id === 'string' ? ident.id : ''
    if (!GUID.test(id)) continue

    const props = (ident.properties ?? {}) as Record<string, { $value?: unknown }>
    const candidatos = [
      props.Mail?.$value,
      props.Account?.$value,
      ident.providerDisplayName,
    ]
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim().toLowerCase())

    if (candidatos.includes(alvo)) {
      const display = typeof ident.providerDisplayName === 'string' ? ident.providerDisplayName : null
      return { guid: id.toLowerCase(), display, email: alvo }
    }
  }
  return null
}

/** Texto curto, para a tela, de cada recusa. */
export const MENSAGEM_RECUSA: Record<MotivoRecusa, string> = {
  configuracao_pendente: 'O Timer ainda não foi configurado no servidor. Avise o administrador do FlagHub.',
  sem_identidade_microsoft: 'O Timer só libera para quem entra com a conta Microsoft da Flag.',
  sessao_nao_veio_do_sso: 'Saia e entre de novo com "Entrar com Microsoft" para liberar o Timer.',
  tenant_diferente: 'Esta conta Microsoft não é da organização Flag.',
  email_ausente: 'A conta Microsoft não informou um e-mail.',
  email_nao_confirmado: 'O e-mail da conta ainda não foi confirmado.',
  email_fora_do_dominio: 'O Timer só libera para e-mails da Flag.',
}
