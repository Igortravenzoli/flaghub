// manual-upload-publish v1.1 — Publica linhas validadas de um batch para tabelas curadas
// Now supports area-based roles (owner) in addition to global admin/gestao
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function resolveCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin')
  return {
    ...corsHeaders,
    'Access-Control-Allow-Origin': origin ?? '*',
    'Vary': 'Origin',
  }
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

function getAuthHeader(req: Request): string | null {
  return req.headers.get('Authorization') ?? req.headers.get('authorization')
}

async function getAuthUserId(req: Request): Promise<string | null> {
  const authHeader = getAuthHeader(req)
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token)
  if (!claimsError && claimsData?.claims?.sub) {
    return claimsData.claims.sub as string
  }
  const { data: { user } } = await supabase.auth.getUser(token)
  return user?.id ?? null
}

async function hasGlobalUploadRole(userId: string): Promise<boolean> {
  const admin = getSupabaseAdmin()
  const { data } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .in('role', ['admin', 'gestao'])
    .maybeSingle()
  return !!data
}

async function isHubAdmin(userId: string): Promise<boolean> {
  const admin = getSupabaseAdmin()
  const { data } = await admin
    .from('hub_user_global_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle()
  return !!data
}

async function hasAreaUploadRole(userId: string, areaId: string | null): Promise<boolean> {
  if (!areaId) return false
  const admin = getSupabaseAdmin()
  const { data: area } = await admin
    .from('hub_areas')
    .select('key')
    .eq('id', areaId)
    .maybeSingle()

  if (!area?.key) return false

  const { data: inheritance } = await admin
    .from('hub_area_inheritance')
    .select('parent_area_key')
    .eq('child_area_key', area.key)

  const allowedAreaKeys = new Set([
    area.key,
    ...(inheritance ?? []).map((row: { parent_area_key: string }) => row.parent_area_key),
  ])

  const { data } = await admin
    .from('hub_area_members')
    .select('area_role, hub_areas!hub_area_members_area_id_fkey(key)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('area_role', ['owner', 'operacional'])
  return (data ?? []).some((membership: any) => allowedAreaKeys.has(membership.hub_areas?.key))
}

// Safely parse a date value — returns null for non-date strings like "Sem Relato"
function safeDate(val: any): string | null {
  if (!val || typeof val !== 'string') return null
  const trimmed = val.trim()
  // Reject obvious non-date text
  if (!/\d/.test(trimmed)) return null
  // Try ISO or common date formats
  const d = new Date(trimmed)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function parseOpenedAt(val: any): string | null {
  if (!val || typeof val !== 'string') return null
  const trimmed = val.trim()
  if (!trimmed) return null

  const direct = new Date(trimmed)
  if (!isNaN(direct.getTime())) return direct.toISOString()

  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (brMatch) {
    const [, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = brMatch
    const parsed = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}Z`)
    if (!isNaN(parsed.getTime())) return parsed.toISOString()
  }

  return null
}

function inferTicketType(ticketExternalId: string, sysClassName?: string, typeHint?: string): string {
  const id = ticketExternalId.toUpperCase()
  if (id.startsWith('INC')) return 'incident'
  if (id.startsWith('RITM')) return 'request'
  if (id.startsWith('PRB')) return 'problem'

  const cls = (sysClassName || '').toLowerCase()
  if (cls.includes('sc_req_item')) return 'request'
  if (cls.includes('problem')) return 'problem'
  if (cls.includes('incident')) return 'incident'

  const hint = (typeHint || '').toLowerCase()
  if (hint.includes('request')) return 'request'
  if (hint.includes('problem')) return 'problem'
  return 'incident'
}

function extractOsNumber(row: Record<string, any>): string | null {
  const direct = row.os_number ?? row.os ?? row.u_os ?? row.u_ordem_servico
  if (typeof direct === 'string' && direct.trim()) return direct.trim()

  const searchSources = [row.short_description, row.description, row.u_translated_variables]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)

  for (const source of searchSources) {
    const match = source.match(/\bOS\s*[:#\-]?\s*(\d{4,})\b/i)
    if (match?.[1]) return match[1]
  }

  return null
}

type PublishContext = {
  networkId: number | null
  importedAtIso: string
  statusMap: Map<string, string>
}

// Maps template keys to their target table and field mapping
const PUBLISH_TARGETS: Record<string, {
  table: string
  onConflict?: string
  mapRow: (normalized: Record<string, any>, batchId: string, context: PublishContext) => Record<string, any>
}> = {
  helpdesk_v1: {
    table: 'tickets',
    onConflict: 'network_id,ticket_external_id',
    mapRow: (n, _batchId, context) => {
      const ticketExternalId = String(n.number ?? n.ticket_external_id ?? '').trim().toUpperCase()
      const openedAt = parseOpenedAt(n.opened_at ?? n.sys_created_on)
      const externalStatus = String(n.state ?? n.external_status ?? '').trim() || null
      const mappedInternalStatus = externalStatus
        ? (context.statusMap.get(externalStatus.toLowerCase()) ?? null)
        : null
      const osNumber = extractOsNumber(n)
      const hasOs = Boolean(osNumber)

      return {
        network_id: context.networkId,
        ticket_external_id: ticketExternalId,
        ticket_type: inferTicketType(ticketExternalId, n.sys_class_name, n.type),
        opened_at: openedAt,
        external_status: externalStatus,
        internal_status: mappedInternalStatus,
        assigned_to: typeof n.assigned_to === 'string' ? n.assigned_to.trim() || null : null,
        os_number: osNumber,
        has_os: hasOs,
        os_found_in_vdesk: null,
        inconsistency_code: !openedAt
          ? 'NO_OPENED_AT'
          : (!mappedInternalStatus ? 'UNKNOWN_STATUS' : (hasOs ? null : 'NO_OS_WITHIN_GRACE')),
        severity: !openedAt
          ? 'critico'
          : (hasOs ? 'info' : (!mappedInternalStatus ? 'atencao' : 'atencao')),
        raw_payload: n && typeof n === 'object' ? n : {},
        vdesk_payload: null,
        last_seen_at: context.importedAtIso,
        is_active: true,
        updated_at: context.importedAtIso,
      }
    },
  },
  cs_implantacoes_v1: {
    table: 'cs_implantacoes_records',
    mapRow: (n, batchId) => ({
      batch_id: batchId,
      data_referencia: n.data_referencia || null,
      cliente: n.cliente || null,
      consultor: n.consultor || null,
      solucao: n.solucao || null,
      status_implantacao: n.status_implantacao || null,
      data_inicio: n.data_inicio || null,
      data_fim: n.data_fim || null,
      horas_totais: n.horas_totais ? Number(n.horas_totais) : null,
      observacoes: n.observacoes || null,
      contato: n.contato || null,
      licenca: n.licenca || null,
      atuacao: n.atuacao || null,
      puxada: n.puxada || null,
      raw: n,
    }),
  },
  cs_fila_cs_v1: {
    table: 'cs_fila_manual_records',
    mapRow: (n, batchId) => ({
      batch_id: batchId,
      data_referencia: n.data_referencia || null,
      id_origem: n.id_origem || null,
      cliente: n.cliente || null,
      responsavel: n.responsavel || null,
      status: n.status || null,
      data_entrada: n.data_entrada || null,
      data_saida: n.data_saida || null,
      prioridade: n.prioridade || null,
      observacoes: n.observacoes || null,
      raw: n,
    }),
  },
  comercial_pesquisa_v1: {
    table: 'comercial_pesquisa_satisfacao',
    onConflict: 'cliente_codigo,data_pesquisa',
    mapRow: (n, batchId) => ({
      batch_id: batchId,
      cliente_codigo: n.cliente_codigo ? Number(n.cliente_codigo) : null,
      cliente_nome: n.cliente_nome || null,
      bandeira: n.bandeira || null,
      data_pesquisa: safeDate(n.data_pesquisa),
      responsavel_contato: n.responsavel_contato || null,
      notas_por_produto: typeof n.notas_por_produto === 'string'
        ? (() => { try { return JSON.parse(n.notas_por_produto) } catch { return {} } })()
        : (n.notas_por_produto || {}),
      qualitativo: typeof n.qualitativo === 'string'
        ? (() => { try { return JSON.parse(n.qualitativo) } catch { return {} } })()
        : (n.qualitativo || {}),
    }),
  },
}

serve(async (req: Request) => {
  const responseHeaders = resolveCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: responseHeaders })
  }

  const admin = getSupabaseAdmin()

  try {
    const userId = await getAuthUserId(req)
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Autenticação obrigatória' }), {
        status: 401, headers: { ...responseHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { batch_id, force } = body

    if (!batch_id) {
      return new Response(JSON.stringify({ error: 'batch_id é obrigatório' }), {
        status: 400, headers: { ...responseHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Load batch with template
    const { data: batch, error: bErr } = await admin
      .from('manual_import_batches')
      .select('*, manual_import_templates!manual_import_batches_template_id_fkey(key, area_id)')
      .eq('id', batch_id)
      .single()

    if (bErr || !batch) {
      return new Response(JSON.stringify({ error: 'Batch não encontrado' }), {
        status: 404, headers: { ...responseHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Authorization: global admin/gestao OR hub admin OR area owner/operacional
    const batchAreaId = batch.area_id || (batch as any).manual_import_templates?.area_id || null
    const [globalOk, hubAdmin, areaOk] = await Promise.all([
      hasGlobalUploadRole(userId),
      isHubAdmin(userId),
      hasAreaUploadRole(userId, batchAreaId),
    ])

    if (!globalOk && !hubAdmin && !areaOk) {
      return new Response(JSON.stringify({ error: 'Acesso negado — requer papel de Owner ou Admin na área' }), {
        status: 403, headers: { ...responseHeaders, 'Content-Type': 'application/json' },
      })
    }

    const templateKey = (batch as any).manual_import_templates?.key
    if (!templateKey) {
      return new Response(JSON.stringify({ error: 'Template não associado ao batch' }), {
        status: 400, headers: { ...responseHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (batch.status === 'published' && !force) {
      return new Response(JSON.stringify({
        success: true,
        batch_id,
        template: templateKey,
        target_table: PUBLISH_TARGETS[templateKey]?.table ?? 'manual_import_rows',
        published_rows: 0,
        already_published: true,
        note: 'Batch já estava publicado',
      }), { headers: { ...responseHeaders, 'Content-Type': 'application/json' } })
    }

    // Check status
    if (!['validated', 'parsed'].includes(batch.status)) {
      return new Response(JSON.stringify({
        error: `Batch em status '${batch.status}', não pode ser publicado. Status esperado: validated ou parsed`,
      }), { status: 400, headers: { ...responseHeaders, 'Content-Type': 'application/json' } })
    }

    const target = PUBLISH_TARGETS[templateKey]
    if (!target) {
      // For templates without a publish target (e.g. helpdesk_v1),
      // just mark as published — rows stay in manual_import_rows as raw data
      await admin.from('manual_import_batches').update({
        status: 'published',
        published_at: new Date().toISOString(),
        published_by: userId,
      }).eq('id', batch_id)

      await admin.rpc('hub_audit_log', {
        p_action: 'manual_upload_publish',
        p_entity_type: 'manual_import_batch',
        p_entity_id: batch_id,
        p_metadata: { template_key: templateKey, target_table: 'manual_import_rows (raw)', published: 0 },
      })

      return new Response(JSON.stringify({
        success: true,
        batch_id,
        template: templateKey,
        target_table: 'manual_import_rows',
        published_rows: 0,
        note: 'Dados armazenados como raw — sem tabela curada configurada',
      }), { headers: { ...responseHeaders, 'Content-Type': 'application/json' } })
    }

    // 2. Load valid rows
    const { data: rows, error: rErr } = await admin
      .from('manual_import_rows')
      .select('normalized')
      .eq('batch_id', batch_id)
      .eq('is_valid', true)
      .order('row_number')

    if (rErr) throw new Error(`Falha ao carregar linhas: ${rErr.message}`)

    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Nenhuma linha válida para publicar' }), {
        status: 400, headers: { ...responseHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Map rows to target table format and deduplicate by conflict key (last wins)
    const importedAtIso = batch.imported_at || new Date().toISOString()
    let publishNetworkId: number | null = null
    let statusMap = new Map<string, string>()

    if (templateKey === 'helpdesk_v1') {
      // Resolve network_id from the batch area or from domain_network_mapping
      // Cannot use hub_resolve_area_network_id RPC here because it relies on auth.uid()
      // which is null when called with the service role client.
      const batchUserId = batch.imported_by
      const [networkByMember, networkByDomain, statusResp] = await Promise.all([
        // Try hub_area_members first (explicit network_id on membership)
        admin.from('hub_area_members')
          .select('network_id')
          .eq('user_id', batchUserId)
          .eq('is_active', true)
          .not('network_id', 'is', null)
          .limit(1)
          .maybeSingle(),
        // Fallback: resolve from user email domain
        (async () => {
          const { data: authUser } = await admin.auth.admin.getUserById(batchUserId)
          if (!authUser?.user?.email) return null
          const domain = authUser.user.email.split('@')[1]
          if (!domain) return null
          const { data } = await admin.from('domain_network_mapping')
            .select('network_id')
            .eq('email_domain', domain)
            .maybeSingle()
          return data?.network_id ?? null
        })(),
        admin.from('status_mapping').select('external_status, internal_status').eq('is_active', true),
      ])

      publishNetworkId = networkByMember?.data?.network_id ?? networkByDomain ?? null

      if (!publishNetworkId) {
        // Last resort: use the first (and likely only) network
        const { data: fallbackNet } = await admin.from('networks').select('id').limit(1).maybeSingle()
        publishNetworkId = fallbackNet?.id ?? null
      }

      if (!publishNetworkId) {
        throw new Error('Não foi possível resolver network_id para o batch. Verifique domain_network_mapping ou hub_area_members.')
      }

      statusMap = new Map(
        (statusResp.data ?? []).map((row: any) => [String(row.external_status || '').toLowerCase(), row.internal_status])
      )
    }

    const context: PublishContext = {
      networkId: publishNetworkId,
      importedAtIso,
      statusMap,
    }

    let records = rows.map((r: { normalized: Record<string, any> }) => target.mapRow(r.normalized as Record<string, any>, batch_id, context))

    if (templateKey === 'helpdesk_v1') {
      records = records.filter((rec) => rec.network_id && rec.ticket_external_id)
    }

    if (target.onConflict) {
      const conflictKeys = target.onConflict.split(',').map((k: string) => k.trim())
      const dedup = new Map<string, Record<string, any>>()
      for (const rec of records) {
        const key = conflictKeys.map((k: string) => String(rec[k] ?? '')).join('||')
        dedup.set(key, rec)
      }
      records = Array.from(dedup.values())
    }

    // 4. Insert into curated table
    let publishedCount = 0
    for (let i = 0; i < records.length; i += 100) {
      const chunk = records.slice(i, i + 100)
      const query = target.onConflict
        ? admin.from(target.table).upsert(chunk, { onConflict: target.onConflict })
        : admin.from(target.table).insert(chunk)
      const { error: iErr } = await query
      if (iErr) throw new Error(`Falha ao publicar: ${iErr.message}`)
      publishedCount += chunk.length
    }

    // 5. Update batch status
    await admin.from('manual_import_batches').update({
      status: 'published',
      published_at: new Date().toISOString(),
      published_by: userId,
    }).eq('id', batch_id)

    // 6. Audit
    await admin.rpc('hub_audit_log', {
      p_action: 'manual_upload_publish',
      p_entity_type: 'manual_import_batch',
      p_entity_id: batch_id,
      p_metadata: { template_key: templateKey, target_table: target.table, published: publishedCount },
    })

    return new Response(JSON.stringify({
      success: true,
      batch_id,
      template: templateKey,
      target_table: target.table,
      published_rows: publishedCount,
    }), { headers: { ...responseHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('[ManualUploadPublish] Error:', err)
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500, headers: { ...responseHeaders, 'Content-Type': 'application/json' },
    })
  }
})
