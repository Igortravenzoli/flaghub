// timer-devops — a edge do Timer Flag.
//
// Fase 1 só tem a op `ativar`: concede o Timer, automaticamente, a quem entrou
// pelo SSO Microsoft do tenant da Flag, e resolve a identidade da pessoa no
// Azure DevOps (o GUID que a TechsBCN grava como userId).
//
// Regras que não podem afrouxar:
//   • Quem é a pessoa vem SEMPRE do JWT (getUser). Nada de e-mail, GUID ou
//     user_id no corpo da requisição.
//   • Sem TIMER_SSO_TENANT_ID configurado, nada é concedido (falha fechada).
//   • Revogado pelo admin continua revogado: `ativar` não reconcede.
//   • O vssps é chamado no máximo uma vez a cada 10 min por pessoa sem GUID.
//     O incidente de 31/08/2026 foi justamente o serviço de identidade do
//     Azure estrangulado; um botão "tentar de novo" não pode virar rajada.
//
// PAT: DEVOPS_PAT_TIMER (PAT de serviço só do Timer). Enquanto ele não existir,
// cai no DEVOPS_PAT, que é amplo demais e deve ser revisto.
//
// Deploy: igual às outras edges do FlagHub, com --no-verify-jwt; a função
// valida o JWT por conta própria.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { devopsAuthHeaders, devopsFetch } from '../_shared/devops.ts'
import {
  escolherIdentidadeDevops,
  lerClaimsJwt,
  lerDominios,
  MENSAGEM_RECUSA,
  validarSsoFlag,
  type UsuarioSupabase,
} from './sso.ts'

const ORG = 'FlagIW'
const REDESCOBRIR_GUID_MS = 10 * 60 * 1000

type Json = Record<string, unknown>

function responder(req: Request, status: number, corpo: Json): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

function patDoTimer(): string | null {
  return Deno.env.get('DEVOPS_PAT_TIMER') || Deno.env.get('DEVOPS_PAT') || null
}

function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
}

async function usuarioDoJwt(req: Request): Promise<{ user: UsuarioSupabase; token: string } | null> {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return null
  const token = auth.slice('Bearer '.length).trim()
  // O service role não é usuário: o Timer é sempre de uma pessoa.
  if (!token || token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return null

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  })
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data?.user?.id) return null
  return { user: data.user as unknown as UsuarioSupabase, token }
}

async function resolverIdentidade(email: string, pat: string) {
  const url =
    `https://vssps.dev.azure.com/${ORG}/_apis/identities` +
    `?searchFilter=MailAddress&filterValue=${encodeURIComponent(email)}&api-version=7.1-preview.1`
  const resp = await devopsFetch(url, { method: 'GET', headers: devopsAuthHeaders(pat) }, { client: 'timer-ativar' })
  if (!resp.ok) {
    console.warn(`[timer-devops] vssps respondeu ${resp.status} ao resolver identidade`)
    await resp.body?.cancel()
    return { ok: false as const, status: resp.status }
  }
  const json = await resp.json()
  return { ok: true as const, identidade: escolherIdentidadeDevops(json, email) }
}

async function ativar(req: Request, user: UsuarioSupabase, token: string): Promise<Response> {
  const sso = validarSsoFlag(user, lerClaimsJwt(token), {
    tenantId: Deno.env.get('TIMER_SSO_TENANT_ID') ?? null,
    dominios: lerDominios(Deno.env.get('TIMER_SSO_DOMINIOS')),
  })

  const sb = admin()

  if (!sso.ok) {
    if (sso.motivo === 'tenant_diferente') {
      // Só as CHAVES, para diagnosticar onde o Supabase guardou o tenant.
      const azure = (user.identities ?? []).find((i) => i.provider === 'azure')
      console.warn('[timer-devops] tenant não confere; chaves de identity_data:', Object.keys(azure?.identity_data ?? {}))
    }
    const status = sso.motivo === 'configuracao_pendente' ? 503 : 403
    return responder(req, status, { ok: false, motivo: sso.motivo, mensagem: MENSAGEM_RECUSA[sso.motivo] })
  }

  const { data: atual, error: erroLeitura } = await sb
    .from('timer_access')
    .select('status, devops_guid, devops_display, devops_resolvido_em')
    .eq('user_id', user.id)
    .maybeSingle()
  if (erroLeitura) {
    console.error('[timer-devops] leitura de timer_access falhou:', erroLeitura.message)
    return responder(req, 500, { ok: false, motivo: 'erro_interno' })
  }

  if (atual?.status === 'revogado') {
    return responder(req, 403, {
      ok: false,
      motivo: 'acesso_revogado',
      mensagem: 'Seu acesso ao Timer foi revogado por um administrador.',
    })
  }

  const novo = !atual
  let guid: string | null = atual?.devops_guid ?? null
  let display: string | null = atual?.devops_display ?? null
  let resolvidoEm: string | null = atual?.devops_resolvido_em ?? null
  let devopsEmail: string | null = null
  let erroDevops: string | null = null

  const tentouHaPouco =
    resolvidoEm !== null && Date.now() - new Date(resolvidoEm).getTime() < REDESCOBRIR_GUID_MS

  if (!guid && !tentouHaPouco) {
    const pat = patDoTimer()
    if (!pat) {
      erroDevops = 'pat_ausente'
    } else {
      try {
        const r = await resolverIdentidade(sso.email, pat)
        resolvidoEm = new Date().toISOString()
        if (!r.ok) erroDevops = `vssps_${r.status}`
        else if (r.identidade) {
          guid = r.identidade.guid
          display = r.identidade.display
          devopsEmail = r.identidade.email
        } else erroDevops = 'identidade_nao_encontrada'
      } catch (e) {
        console.error('[timer-devops] erro ao resolver identidade:', e)
        erroDevops = 'vssps_indisponivel'
      }
    }
  }

  const linha: Json = {
    user_id: user.id,
    email: sso.email,
    sso_tenant_id: sso.tenantId,
    devops_guid: guid,
    devops_display: display,
    devops_resolvido_em: resolvidoEm,
  }
  if (devopsEmail) linha.devops_email = devopsEmail
  if (novo) {
    linha.status = 'ativo'
    linha.origem = 'sso_auto'
  }

  const { error: erroGravacao } = await sb.from('timer_access').upsert(linha, { onConflict: 'user_id' })
  if (erroGravacao) {
    console.error('[timer-devops] gravação de timer_access falhou:', erroGravacao.message)
    return responder(req, 500, { ok: false, motivo: 'erro_interno' })
  }

  const eventos: Json[] = []
  if (novo) {
    eventos.push({ user_id: user.id, evento: 'acesso_concedido', origem: 'servidor', detalhe: { via: 'sso_auto' } })
  }
  if (devopsEmail) {
    eventos.push({ user_id: user.id, evento: 'identidade_devops_resolvida', origem: 'servidor', detalhe: {} })
  } else if (erroDevops) {
    eventos.push({ user_id: user.id, evento: 'identidade_devops_falhou', origem: 'servidor', detalhe: { erro: erroDevops } })
  }
  if (eventos.length > 0) {
    const { error } = await sb.from('timer_eventos').insert(eventos)
    if (error) console.warn('[timer-devops] trilha de eventos falhou:', error.message)
  }

  return responder(req, 200, {
    ok: true,
    novo,
    devops: { encontrado: !!guid, display, erro: guid ? null : erroDevops },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return responder(req, 405, { ok: false, motivo: 'metodo_nao_permitido' })

  const quem = await usuarioDoJwt(req)
  if (!quem) return responder(req, 401, { ok: false, motivo: 'nao_autenticado' })

  let corpo: Json = {}
  try {
    corpo = await req.json()
  } catch {
    return responder(req, 400, { ok: false, motivo: 'corpo_invalido' })
  }

  switch (corpo.op) {
    case 'ativar':
      return await ativar(req, quem.user, quem.token)
    default:
      return responder(req, 400, { ok: false, motivo: 'op_desconhecida' })
  }
})
