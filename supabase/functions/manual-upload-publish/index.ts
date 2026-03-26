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

async function getAuthUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return null
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
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
  const { data } = await admin
    .from('hub_area_members')
    .select('area_role')
    .eq('user_id', userId)
    .eq('area_id', areaId)
    .eq('is_active', true)
    .in('area_role', ['owner', 'operacional'])
    .maybeSingle()
  return !!data
}

// Maps template keys to their target table and field mapping
const PUBLISH_TARGETS: Record<string, {
  table: string
  mapRow: (normalized: Record<string, any>, batchId: string) => Record<string, any>
}> = {
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
    const { batch_id } = body

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

    // Check status
    if (!['validated', 'parsed'].includes(batch.status)) {
      return new Response(JSON.stringify({
        error: `Batch em status '${batch.status}', não pode ser publicado. Status esperado: validated ou parsed`,
      }), { status: 400, headers: { ...responseHeaders, 'Content-Type': 'application/json' } })
    }

    const templateKey = (batch as any).manual_import_templates?.key
    if (!templateKey) {
      return new Response(JSON.stringify({ error: 'Template não associado ao batch' }), {
        status: 400, headers: { ...responseHeaders, 'Content-Type': 'application/json' },
      })
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

    // 3. Map rows to target table format
    const records = rows.map((r: { normalized: Record<string, any> }) => target.mapRow(r.normalized as Record<string, any>, batch_id))

    // 4. Insert into curated table
    let publishedCount = 0
    for (let i = 0; i < records.length; i += 100) {
      const chunk = records.slice(i, i + 100)
      const { error: iErr } = await admin.from(target.table).insert(chunk)
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
