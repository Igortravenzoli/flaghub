// devops-qa-alert — Detecta retornos QA e envia alertas Teams
// Detecção: work item com state="Em desenvolvimento" + tag "Retorno QA" e/ou
// histórico de transição "Em Teste" → "Em desenvolvimento"
// Alerta: Teams 1:1 via Graph API (user ID resolvido on-demand pelo email DevOps)
//         Fallback: webhook de canal se Graph não disponível ou email não encontrado
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StateChange {
  oldValue: string | null
  newValue: string
  revisedDate: string
  revisedBy: string | null
}

interface WorkItem {
  id: number
  title: string | null
  work_item_type: string | null
  area_path: string | null
  iteration_path: string | null
  assigned_to_display: string | null
  assigned_to_unique: string | null   // email Azure DevOps (= email M365 na FLAG)
  state: string | null
  tags: string | null
  web_url: string | null
  state_history: StateChange[] | null
}

// ── Detection helpers ─────────────────────────────────────────────────────────

/** Retorna as transições "Em Teste" → "Em desenvolvimento" encontradas no histórico */
function findQaReturnTransitions(history: StateChange[]): StateChange[] {
  return history.filter(ch =>
    ch.oldValue?.toLowerCase().includes('em teste') &&
    ch.newValue?.toLowerCase().includes('em desenvolvimento')
  )
}

/** Verifica se as tags contêm "Retorno QA" (case-insensitive) */
function hasQaReturnTag(tags: string | null): boolean {
  if (!tags) return false
  return tags.split(';').some(t => t.trim().toLowerCase() === 'retorno qa')
}

/** Extrai código de sprint do iteration path, ex: "Flag\S45-2026" → "S45-2026" */
function extractSprintCode(iterationPath: string | null): string | null {
  if (!iterationPath) return null
  const match = iterationPath.match(/S(\d+)-(\d{4})/i)
  return match ? match[0].toUpperCase() : null
}

// ── Graph API ─────────────────────────────────────────────────────────────────

/** Obtém token via client credentials para o Microsoft Graph */
async function getGraphToken(): Promise<string> {
  const tenantId = Deno.env.get('TEAMS_GRAPH_TENANT_ID')!
  const clientId = Deno.env.get('TEAMS_GRAPH_CLIENT_ID')!
  const clientSecret = Deno.env.get('TEAMS_GRAPH_CLIENT_SECRET')!

  const resp = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    },
  )
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Graph token failed (${resp.status}): ${body.slice(0, 200)}`)
  }
  const data = await resp.json()
  return data.access_token as string
}

/**
 * Resolve o Graph user ID de um utilizador a partir do seu email, on-demand.
 * Usa GET /v1.0/users/{email} — funciona quando email DevOps = email M365.
 * Devolve null se o utilizador não for encontrado no tenant (ex: saiu da empresa,
 * email divergente) — nesse caso o alerta usa fallback webhook.
 */
async function resolveTeamsUserId(
  email: string | null,
  token: string,
): Promise<string | null> {
  if (!email) return null
  try {
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}?$select=id`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!resp.ok) return null   // 404 = não encontrado no tenant, 403 = sem permissão
    const data = await resp.json()
    return (data.id as string) ?? null
  } catch {
    return null
  }
}

// ── Teams messaging ───────────────────────────────────────────────────────────

/** Cria chat oneOnOne e envia Adaptive Card via Graph API */
async function sendTeams1on1(
  token: string,
  senderUserId: string,
  recipientUserId: string,
  card: object,
): Promise<void> {
  // 1. Criar (ou obter) o chat 1:1
  const chatResp = await fetch('https://graph.microsoft.com/v1.0/chats', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatType: 'oneOnOne',
      members: [
        {
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          roles: ['owner'],
          'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${senderUserId}')`,
        },
        {
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          roles: ['owner'],
          'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${recipientUserId}')`,
        },
      ],
    }),
  })
  if (!chatResp.ok) {
    const body = await chatResp.text()
    throw new Error(`Create chat failed (${chatResp.status}): ${body.slice(0, 200)}`)
  }
  const chat = await chatResp.json()

  // 2. Enviar mensagem com o Adaptive Card
  const msgResp = await fetch(
    `https://graph.microsoft.com/v1.0/chats/${chat.id}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: { contentType: 'html', content: '<attachment id="1"></attachment>' },
        attachments: [
          {
            id: '1',
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: JSON.stringify(card),
          },
        ],
      }),
    },
  )
  if (!msgResp.ok) {
    const body = await msgResp.text()
    throw new Error(`Send message failed (${msgResp.status}): ${body.slice(0, 200)}`)
  }
}

/** Fallback: envia MessageCard via webhook de canal */
async function sendTeamsWebhook(webhookUrl: string, card: object): Promise<void> {
  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(card),
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Webhook failed (${resp.status}): ${body.slice(0, 200)}`)
  }
}

// ── Card builders ─────────────────────────────────────────────────────────────

function buildAdaptiveCard(item: WorkItem, sprintCode: string | null): object {
  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      {
        type: 'TextBlock',
        text: '🔄 Retorno de QA — Item devolvido ao Desenvolvimento',
        weight: 'Bolder',
        size: 'Medium',
        color: 'Warning',
        wrap: true,
      },
      {
        type: 'FactSet',
        facts: [
          { title: 'ID', value: `#${item.id}` },
          { title: 'Título', value: item.title ?? '—' },
          { title: 'Tipo', value: item.work_item_type ?? '—' },
          { title: 'Sprint', value: sprintCode ?? '—' },
          { title: 'Responsável', value: item.assigned_to_display ?? '—' },
        ],
      },
      {
        type: 'TextBlock',
        text: 'Este item retornou de **Em Teste** para **Em desenvolvimento**. Por favor verifique o feedback de QA.',
        wrap: true,
        color: 'Attention',
      },
    ],
    actions: item.web_url
      ? [{ type: 'Action.OpenUrl', title: 'Abrir no Azure DevOps', url: item.web_url }]
      : [],
  }
}

function buildWebhookCard(item: WorkItem, sprintCode: string | null): object {
  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: 'FF8C00',
    summary: `Retorno QA — #${item.id} ${item.title ?? ''}`,
    title: `🔄 Retorno de QA — #${item.id}`,
    text: [
      `**${item.title ?? 'Sem título'}**`,
      `Responsável: ${item.assigned_to_display ?? '—'}`,
      `Sprint: ${sprintCode ?? '—'}`,
      `Tipo: ${item.work_item_type ?? '—'}`,
    ].join('  \n'),
    potentialAction: item.web_url
      ? [
          {
            '@type': 'OpenUri',
            name: 'Abrir no Azure DevOps',
            targets: [{ os: 'default', uri: item.web_url }],
          },
        ]
      : [],
  }
}

// ── Main logic ────────────────────────────────────────────────────────────────

async function run(
  admin: ReturnType<typeof createClient>,
): Promise<{ detected: number; alerted: number; resolved: number }> {
  let detected = 0
  let alerted = 0
  let resolved = 0

  const senderUserId = Deno.env.get('TEAMS_GRAPH_SENDER_USER_ID')   // UPN/ID do remetente
  const fallbackWebhook = Deno.env.get('TEAMS_FALLBACK_WEBHOOK_URL')
  const graphConfigured =
    !!Deno.env.get('TEAMS_GRAPH_TENANT_ID') &&
    !!Deno.env.get('TEAMS_GRAPH_CLIENT_ID') &&
    !!Deno.env.get('TEAMS_GRAPH_CLIENT_SECRET')

  // Obtém token Graph uma única vez (reutilizado para todos os alertas)
  let graphToken: string | null = null
  if (graphConfigured) {
    try {
      graphToken = await getGraphToken()
    } catch (err) {
      console.error('[QAAlert] Graph token error:', (err as Error).message)
    }
  }

  // ── 1. Candidatos: state = "Em desenvolvimento" ───────────────────────────
  const { data: candidates, error: candidatesErr } = await admin
    .from('devops_work_items')
    .select(
      'id, title, work_item_type, area_path, iteration_path, ' +
      'assigned_to_display, assigned_to_unique, state, tags, web_url, state_history',
    )
    .eq('state', 'Em desenvolvimento')

  if (candidatesErr) throw new Error(`Fetch candidates: ${candidatesErr.message}`)

  for (const item of (candidates ?? []) as WorkItem[]) {
    const history = (item.state_history ?? []) as StateChange[]
    const transitions = findQaReturnTransitions(history)
    const hasTag = hasQaReturnTag(item.tags)

    // Ignora items sem evidência de retorno QA
    if (transitions.length === 0 && !hasTag) continue

    const sprintCode = extractSprintCode(item.iteration_path)
    const detectionMethod =
      transitions.length > 0 && hasTag ? 'tag+history' :
      transitions.length > 0 ? 'history' : 'tag'

    // Usa a data da transição mais recente (ou null se só detectado por tag)
    const latestTransition = transitions.at(-1) ?? null

    // ── Deduplicação: não re-alertar enquanto o evento estiver em aberto ────
    const { data: existing } = await admin
      .from('devops_qa_return_events')
      .select('id')
      .eq('work_item_id', item.id)
      .eq('is_open', true)
      .maybeSingle()

    if (existing) continue   // já existe evento em aberto para este item

    detected++

    // ── Resolve Teams user ID on-demand via Graph API ────────────────────────
    // Usa o email do DevOps (assigned_to_unique) directamente — sem tabela de mapeamento.
    // Se o email DevOps = email M365 (padrão FLAG), o lookup funciona automaticamente.
    // Se não encontrado (email divergente, utilizador fora do tenant), teamsUserId = null
    // e o alerta cai em fallback webhook.
    let teamsUserId: string | null = null
    if (graphToken && item.assigned_to_unique) {
      teamsUserId = await resolveTeamsUserId(item.assigned_to_unique, graphToken)
    }

    // ── Inserir evento ───────────────────────────────────────────────────────
    const { data: event, error: insertErr } = await admin
      .from('devops_qa_return_events')
      .insert({
        work_item_id: item.id,
        work_item_title: item.title,
        work_item_type: item.work_item_type,
        area_path: item.area_path,
        iteration_path: item.iteration_path,
        sprint_code: sprintCode,
        web_url: item.web_url,
        detected_tags: item.tags,
        transition_from_state: 'Em Teste',
        transition_to_state: 'Em desenvolvimento',
        transition_date: latestTransition
          ? new Date(latestTransition.revisedDate).toISOString()
          : null,
        assigned_to_display: item.assigned_to_display,
        assigned_to_email: item.assigned_to_unique,
        lead_teams_user_id: teamsUserId,   // cacheado para auditoria
        detection_method: detectionMethod,
        alert_status: 'pending',
      })
      .select('id')
      .single()

    if (insertErr || !event) {
      console.error(`[QAAlert] Insert error for item ${item.id}:`, insertErr?.message)
      continue
    }

    // ── Enviar alerta ────────────────────────────────────────────────────────
    const adaptiveCard = buildAdaptiveCard(item, sprintCode)
    let alertStatus = 'skipped'
    let alertChannelType = 'none'
    let alertError: string | null = null

    try {
      if (graphToken && teamsUserId && senderUserId) {
        // 1ª opção: Teams 1:1 via Graph (user ID resolvido on-demand)
        await sendTeams1on1(graphToken, senderUserId, teamsUserId, adaptiveCard)
        alertStatus = 'sent'
        alertChannelType = 'teams_1on1'
        alerted++
      } else if (fallbackWebhook) {
        // 2ª opção: webhook de canal (fallback)
        await sendTeamsWebhook(fallbackWebhook, buildWebhookCard(item, sprintCode))
        alertStatus = 'fallback_sent'
        alertChannelType = 'teams_webhook'
        alerted++
      }
    } catch (err) {
      alertStatus = 'failed'
      alertError = (err as Error).message
      console.error(`[QAAlert] Alert 1:1 failed for item ${item.id}:`, alertError)

      // Tenta fallback se o 1:1 falhou
      if (fallbackWebhook) {
        try {
          await sendTeamsWebhook(fallbackWebhook, buildWebhookCard(item, sprintCode))
          alertStatus = 'fallback_sent'
          alertChannelType = 'teams_webhook'
          alerted++
        } catch (fbErr) {
          console.error(`[QAAlert] Fallback also failed for item ${item.id}:`, (fbErr as Error).message)
        }
      }
    }

    // Actualiza o evento com o resultado do alerta
    await admin
      .from('devops_qa_return_events')
      .update({
        alert_status: alertStatus,
        alert_channel_type: alertChannelType,
        alert_sent_at: alertStatus !== 'pending' && alertStatus !== 'skipped'
          ? new Date().toISOString()
          : null,
        lead_teams_user_id: teamsUserId,
        alert_error: alertError,
      })
      .eq('id', event.id)
  }

  // ── 2. Auto-resolver: marcar is_open=false para itens que saíram de "Em desenvolvimento" ──
  const { data: openEvents } = await admin
    .from('devops_qa_return_events')
    .select('id, work_item_id')
    .eq('is_open', true)

  for (const evt of (openEvents ?? []) as { id: number; work_item_id: number }[]) {
    const { data: wi } = await admin
      .from('devops_work_items')
      .select('state')
      .eq('id', evt.work_item_id)
      .maybeSingle()

    const stillInDev = wi?.state?.toLowerCase().includes('em desenvolvimento')
    if (!wi || !stillInDev) {
      await admin
        .from('devops_qa_return_events')
        .update({ is_open: false, resolved_at: new Date().toISOString() })
        .eq('id', evt.id)
      resolved++
    }
  }

  return { detected, alerted, resolved }
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  try {
    // Autorização: cron secret (automático) OU Bearer admin/gestao (manual)
    const cronSecret = req.headers.get('x-cron-secret')
    const expectedCron = Deno.env.get('CRON_SECRET')
    const authHeader = req.headers.get('Authorization')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let authorized = false

    if (cronSecret && expectedCron && cronSecret === expectedCron) {
      authorized = true
    } else if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authErr } = await admin.auth.getUser(token)
      if (!authErr && user) {
        const { data: hubRoles } = await admin
          .from('hub_user_global_roles')
          .select('role')
          .eq('user_id', user.id)
          .in('role', ['admin', 'gestao'])
        const { data: legacyRoles } = await admin
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .in('role', ['admin', 'gestao'])
        if (hubRoles?.length || legacyRoles?.length) authorized = true
      }
    }

    if (!authorized) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
      )
    }

    const result = await run(admin)

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[QAAlert] Fatal error:', err)
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    )
  }
})
