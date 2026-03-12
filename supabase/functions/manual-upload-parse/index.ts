// manual-upload-parse v1.0 — Parse e validação de uploads manuais (CSV/XLSX/JSON)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

async function validateAuth(req: Request): Promise<string | null> {
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

/** Remove null bytes and problematic Unicode escape sequences from strings */
function sanitizeValue(val: unknown): unknown {
  if (typeof val === 'string') {
    return val.replace(/\0/g, '').replace(/\\u0000/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  }
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(val)) {
      clean[sanitizeValue(k) as string] = sanitizeValue(v)
    }
    return clean
  }
  if (Array.isArray(val)) return val.map(sanitizeValue)
  return val
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  
  // Detect separator
  const sep = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''))
  
  return lines.slice(1).map(line => {
    const values = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i] || '' })
    return row
  })
}

function normalizeRow(raw: Record<string, any>, columnMapping: Record<string, string> | null): Record<string, any> {
  if (!columnMapping) return raw

  const normalized: Record<string, any> = {}
  for (const [targetField, sourceField] of Object.entries(columnMapping)) {
    // Try exact match, then case-insensitive
    const value = raw[sourceField] ??
      raw[Object.keys(raw).find(k => k.toLowerCase() === sourceField.toLowerCase()) ?? ''] ??
      null
    normalized[targetField] = value
  }
  return normalized
}

function validateRow(
  normalized: Record<string, any>,
  requiredColumns: string[] | null,
  _validationRules: any,
): { isValid: boolean; errors: string[] } {
  const errors: string[] = []

  if (requiredColumns) {
    for (const col of requiredColumns) {
      const val = normalized[col]
      if (val === undefined || val === null || val === '') {
        errors.push(`Campo obrigatório ausente: ${col}`)
      }
    }
  }

  return { isValid: errors.length === 0, errors }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const admin = getSupabaseAdmin()

  try {
    const userId = await validateAuth(req)
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Autenticação obrigatória' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { upload_id, template_key, file_content, file_type } = body

    if (!template_key || !file_content) {
      return new Response(JSON.stringify({ error: 'template_key e file_content são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Load template
    const { data: template, error: tErr } = await admin
      .from('manual_import_templates')
      .select('*')
      .eq('key', template_key)
      .eq('is_active', true)
      .single()

    if (tErr || !template) {
      return new Response(JSON.stringify({ error: `Template '${template_key}' não encontrado` }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Parse file content
    let rows: Record<string, any>[]
    const detectedType = file_type || 'csv'

    if (detectedType === 'json') {
      const parsed = JSON.parse(file_content)
      rows = Array.isArray(parsed) ? parsed : [parsed]
    } else {
      // CSV (also handles TSV with semicolons)
      rows = parseCSV(file_content)
    }

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Nenhuma linha encontrada no arquivo' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Create batch
    const columnMapping = template.column_mapping as Record<string, string> | null
    const requiredColumns = template.required_columns as string[] | null
    const validationRules = template.validation_rules

    const { data: batch, error: bErr } = await admin
      .from('manual_import_batches')
      .insert({
        upload_id: upload_id || null,
        template_id: template.id,
        area_id: template.area_id,
        status: 'parsed',
        total_rows: rows.length,
        imported_by: userId,
        imported_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (bErr || !batch) {
      throw new Error(`Falha ao criar batch: ${bErr?.message}`)
    }

    // 4. Process rows
    let validCount = 0
    let invalidCount = 0
    const importRows: any[] = []

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i]
      const normalized = normalizeRow(raw, columnMapping)
      const { isValid, errors } = validateRow(normalized, requiredColumns, validationRules)

      if (isValid) validCount++
      else invalidCount++

      importRows.push({
        batch_id: batch.id,
        row_number: i + 1,
        raw,
        normalized,
        validation_errors: errors.length > 0 ? errors : null,
        is_valid: isValid,
      })
    }

    // Insert rows in chunks
    for (let i = 0; i < importRows.length; i += 200) {
      const chunk = importRows.slice(i, i + 200)
      const { error: rErr } = await admin.from('manual_import_rows').insert(chunk)
      if (rErr) throw new Error(`Falha ao inserir linhas: ${rErr.message}`)
    }

    // 5. Update batch status
    const status = invalidCount === rows.length ? 'rejected' : 'validated'
    await admin.from('manual_import_batches').update({
      status,
      valid_rows: validCount,
      invalid_rows: invalidCount,
    }).eq('id', batch.id)

    // 6. Audit
    await admin.rpc('hub_audit_log', {
      p_action: 'manual_upload_parse',
      p_entity_type: 'manual_import_batch',
      p_entity_id: batch.id,
      p_metadata: { template_key, total: rows.length, valid: validCount, invalid: invalidCount },
    })

    return new Response(JSON.stringify({
      success: true,
      batch_id: batch.id,
      template: template_key,
      total_rows: rows.length,
      valid_rows: validCount,
      invalid_rows: invalidCount,
      status,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('[ManualUploadParse] Error:', err)
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
