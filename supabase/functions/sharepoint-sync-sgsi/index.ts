// sharepoint-sync-sgsi v1.0 — Espelha as listas SG do SharePoint Online
// Fonte: https://flagcom.sharepoint.com/sites/PORTALSGSI (mesma do PBIX
// "SG-LST Usecase 1.04"). Lê via Microsoft Graph com client credentials.
//
// Secrets necessários (Supabase):
//   SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET
// App registration no Entra ID com permissão de APLICAÇÃO no Graph:
//   Sites.Read.All (ou Sites.Selected com grant no site PORTALSGSI).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SP_HOST = 'flagcom.sharepoint.com'
const SP_SITE_PATH = '/sites/PORTALSGSI'
const GRAPH = 'https://graph.microsoft.com/v1.0'

// Prefixo do displayName de cada lista SG espelhada → chave interna
const LIST_PREFIXES: Record<string, string> = {
  'SG-LST-010': '010',
  'SG-LST-011': '011',
  'SG-LST-012': '012',
  'SG-LST-014': '014',
  'SG-LST-017': '017',
  'SG-LST-018': '018',
}

// Campos de sistema do Graph que não interessam ao espelho
const SKIP_FIELDS = new Set([
  '@odata.etag', 'id', 'ContentType', 'Edit', 'LinkTitleNoMenu', 'LinkTitle',
  'ItemChildCount', 'FolderChildCount', '_UIVersionString', '_ComplianceFlags',
  '_ComplianceTag', '_ComplianceTagWrittenTime', '_ComplianceTagUserId',
  'AppAuthorLookupId', 'AppEditorLookupId', 'Attachments',
])

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

async function validateCronSecret(req: Request): Promise<boolean> {
  const cronSecret = req.headers.get('x-cron-secret')
  if (!cronSecret) return false
  const expectedEnv = Deno.env.get('CRON_SECRET')
  if (expectedEnv && cronSecret === expectedEnv) return true
  try {
    const admin = getSupabaseAdmin()
    const { data, error } = await admin.rpc('get_cron_secret')
    if (error) return false
    return typeof data === 'string' && data.length > 0 && cronSecret === data
  } catch {
    return false
  }
}

async function validateAuth(req: Request): Promise<string | null> {
  if (await validateCronSecret(req)) return 'cron'

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (serviceRoleKey && token === serviceRoleKey) return 'service-role-internal'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data, error } = await supabase.auth.getClaims(token)
  if (error || !data?.claims?.sub) return null
  return data.claims.sub as string
}

async function acquireGraphToken(): Promise<string> {
  const tenantId = Deno.env.get('SHAREPOINT_TENANT_ID')
  const clientId = Deno.env.get('SHAREPOINT_CLIENT_ID')
  const clientSecret = Deno.env.get('SHAREPOINT_CLIENT_SECRET')
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Secrets SHAREPOINT_TENANT_ID / SHAREPOINT_CLIENT_ID / SHAREPOINT_CLIENT_SECRET não configurados')
  }
  const resp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Falha ao obter token Graph (${resp.status}): ${text.slice(0, 300)}`)
  }
  const data = await resp.json()
  return data.access_token as string
}

async function graphJson<T>(token: string, url: string): Promise<T> {
  const resp = await fetch(url.startsWith('http') ? url : `${GRAPH}${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Graph ${resp.status} em ${url}: ${text.slice(0, 300)}`)
  }
  return await resp.json()
}

interface GraphColumn { name: string; displayName: string }
interface GraphListItem {
  id: string
  createdDateTime?: string
  lastModifiedDateTime?: string
  fields?: Record<string, unknown>
}

/** Renomeia os campos internos do Graph para o displayName das colunas
 *  (igual ao que o Power BI mostra), preservando LookupIds de pessoa. */
function normalizeFields(
  fields: Record<string, unknown>,
  columnMap: Map<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (SKIP_FIELDS.has(key) || key.startsWith('_') || key.startsWith('@')) continue
    if (value === null || value === undefined || value === '') continue
    if (key.endsWith('LookupId')) {
      const base = key.slice(0, -'LookupId'.length)
      const display = columnMap.get(base)
      if (display) out[`${display} (lookupId)`] = value
      continue
    }
    out[columnMap.get(key) ?? key] = value
  }
  return out
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  const startTime = Date.now()
  const admin = getSupabaseAdmin()

  try {
    const userId = await validateAuth(req)
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Autenticação obrigatória' }), {
        status: 401, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    if (userId !== 'cron' && userId !== 'service-role-internal') {
      const { data: roleRow } = await admin
        .from('hub_user_global_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle()
      const { data: legacyRole } = !roleRow ? await admin
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle() : { data: roleRow }
      if (!roleRow && !legacyRole) {
        return new Response(JSON.stringify({ error: 'Permissão negada: apenas admins podem executar sincronização' }), {
          status: 403, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        })
      }
    }

    const token = await acquireGraphToken()
    const syncedAt = new Date().toISOString()

    // 1. Resolve o site e as listas SG
    const site = await graphJson<{ id: string }>(token, `/sites/${SP_HOST}:${SP_SITE_PATH}`)
    const listsData = await graphJson<{ value: { id: string; displayName: string }[] }>(
      token, `/sites/${site.id}/lists?$top=200`
    )

    const matched: { listKey: string; graphListId: string; displayName: string }[] = []
    for (const list of listsData.value || []) {
      for (const [prefix, listKey] of Object.entries(LIST_PREFIXES)) {
        if (list.displayName?.startsWith(prefix)) {
          matched.push({ listKey, graphListId: list.id, displayName: list.displayName })
        }
      }
    }
    if (matched.length === 0) {
      throw new Error(`Nenhuma lista SG-LST encontrada no site ${SP_SITE_PATH}`)
    }
    console.log(`[SGSI] ${matched.length} listas encontradas: ${matched.map(m => m.displayName).join(' | ')}`)

    // 2. Por lista: colunas (mapa internal→display) + itens paginados
    const resumo: Record<string, number> = {}
    for (const { listKey, graphListId, displayName } of matched) {
      const colsData = await graphJson<{ value: GraphColumn[] }>(
        token, `/sites/${site.id}/lists/${graphListId}/columns?$top=300`
      )
      const columnMap = new Map<string, string>()
      for (const col of colsData.value || []) {
        columnMap.set(col.name, col.displayName || col.name)
      }

      const items: GraphListItem[] = []
      let next: string | null = `${GRAPH}/sites/${site.id}/lists/${graphListId}/items?expand=fields&$top=200`
      while (next) {
        const page = await graphJson<{ value: GraphListItem[]; '@odata.nextLink'?: string }>(token, next)
        items.push(...(page.value || []))
        next = page['@odata.nextLink'] ?? null
      }

      const rows = items.map((item) => ({
        list_key: listKey,
        item_id: parseInt(item.id, 10),
        fields: normalizeFields(item.fields ?? {}, columnMap),
        created_sp: item.createdDateTime ?? null,
        modified_sp: item.lastModifiedDateTime ?? null,
        synced_at: syncedAt,
      }))

      // Snapshot: upsert da lista, substitui os itens
      const { error: listErr } = await admin.from('sgsi_lists').upsert({
        list_key: listKey,
        graph_list_id: graphListId,
        display_name: displayName,
        item_count: rows.length,
        synced_at: syncedAt,
      }, { onConflict: 'list_key' })
      if (listErr) throw new Error(`Upsert sgsi_lists ${listKey}: ${listErr.message}`)

      const { error: delErr } = await admin.from('sgsi_items').delete().eq('list_key', listKey)
      if (delErr) throw new Error(`Limpeza sgsi_items ${listKey}: ${delErr.message}`)

      for (let i = 0; i < rows.length; i += 200) {
        const { error: insErr } = await admin.from('sgsi_items').insert(rows.slice(i, i + 200))
        if (insErr) throw new Error(`Insert sgsi_items ${listKey}: ${insErr.message}`)
      }

      resumo[listKey] = rows.length
      console.log(`[SGSI] ${displayName}: ${rows.length} itens`)
    }

    // 3. Registro de ingestão + auditoria
    const duration = Date.now() - startTime
    await admin.from('hub_raw_ingestions').insert({
      source_type: 'sharepoint',
      source_key: 'sgsi-lists',
      external_id: SP_SITE_PATH,
      payload: { listas: resumo },
      status: 'processed',
      processed_at: new Date().toISOString(),
    })
    await admin.rpc('hub_audit_log', {
      p_action: 'sharepoint_sync_sgsi',
      p_entity_type: 'sgsi_lists',
      p_entity_id: SP_SITE_PATH,
      p_metadata: { listas: resumo, duration_ms: duration },
    }).catch(() => {})

    return new Response(JSON.stringify({
      success: true,
      site: SP_SITE_PATH,
      listas: resumo,
      total_itens: Object.values(resumo).reduce((s, n) => s + n, 0),
      duration_ms: duration,
    }), { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('[SGSI] Error:', err)
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
