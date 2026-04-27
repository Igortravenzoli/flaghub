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

interface RelatedWorkItem {
  id: number
  parent_id: number | null
  title: string | null
  work_item_type: string | null
  state: string | null
  web_url: string | null
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

function shortTypeLabel(typeName: string | null): string {
  if (!typeName) return 'Item'
  if (typeName === 'Product Backlog Item') return 'PBI'
  if (typeName === 'User Story') return 'Story'
  return typeName
}

function buildRelatedItemsMarkdown(relatedItems: RelatedWorkItem[]): string {
  if (relatedItems.length === 0) {
    return 'Sem work items relacionados mapeados para este item.'
  }

  const topItems = relatedItems.slice(0, 6)
  const lines = topItems.map((rel) => {
    const label = `${shortTypeLabel(rel.work_item_type)} #${rel.id}`
    const title = rel.title ?? 'Sem titulo'
    const state = rel.state ?? '—'
    if (rel.web_url) {
      return `- [${label}](${rel.web_url}) — ${title} (Status: ${state})`
    }
    return `- ${label} — ${title} (Status: ${state})`
  })

  if (relatedItems.length > topItems.length) {
    lines.push(`- ... e mais ${relatedItems.length - topItems.length} item(ns)`)
  }

  return lines.join('  \n')
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
 * Obtém token delegado (service account) para envio 1:1 no Teams.
 * Requer que a app aceite ROPC e que o utilizador técnico não exija MFA.
 */
async function getDelegatedGraphToken(): Promise<string> {
  const tenantId = Deno.env.get('TEAMS_GRAPH_TENANT_ID')!
  const clientId = Deno.env.get('TEAMS_GRAPH_CLIENT_ID')!
  const clientSecret = Deno.env.get('TEAMS_GRAPH_CLIENT_SECRET')!
  const delegatedScopes =
    Deno.env.get('TEAMS_GRAPH_DELEGATED_SCOPES') ??
    'https://graph.microsoft.com/Chat.Create https://graph.microsoft.com/Chat.ReadWrite https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/User.Read https://graph.microsoft.com/User.Read.All'
  const username =
    Deno.env.get('TEAMS_GRAPH_SENDER_USER_ID') ??
    Deno.env.get('TEAMS_DELEGATED_USERNAME')
  const password =
    Deno.env.get('TEAMS_GRAPH_SENDER_USER_AUTH') ??
    Deno.env.get('TEAMS_DELEGATED_PASSWORD')

  if (!username || !password) {
    throw new Error('Delegated token skipped: missing TEAMS_DELEGATED_USERNAME/TEAMS_DELEGATED_PASSWORD')
  }

  const resp = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: clientId,
        client_secret: clientSecret,
        username,
        password,
        scope: delegatedScopes,
      }),
    },
  )
  if (!resp.ok) {
    const body = await resp.text()
    if (body.includes('AADSTS50076') || body.includes('AADSTS50079')) {
      throw new Error(`Delegated token blocked by MFA (${resp.status}): ${body.slice(0, 240)}`)
    }
    throw new Error(`Delegated token failed (${resp.status}): ${body.slice(0, 240)}`)
  }
  const data = await resp.json()
  return data.access_token as string
}

/** Lê o user id do utilizador autenticado no token delegado */
async function getMeUserId(token: string): Promise<string> {
  const resp = await fetch('https://graph.microsoft.com/v1.0/me?$select=id', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Read /me failed (${resp.status}): ${body.slice(0, 200)}`)
  }
  const data = await resp.json()
  const id = data?.id as string | undefined
  if (!id) throw new Error('Read /me failed: missing id')
  return id
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
  // webhookbot.c-toss.com expects a bot message payload (type/text/attachments)
  if (webhookUrl.includes('webhookbot.c-toss.com')) {
    const asAny = card as any
    const text = typeof asAny?.text === 'string'
      ? asAny.text
      : (typeof asAny?.summary === 'string' ? asAny.summary : 'Notificação de Retorno QA')

    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'message',
        text,
        attachments: [],
      }),
    })
    if (!resp.ok) {
      const body = await resp.text()
      throw new Error(`Webhook failed (${resp.status}): ${body.slice(0, 260)}`)
    }
    return
  }

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

function buildAdaptiveCard(
  item: WorkItem,
  sprintCode: string | null,
  relatedItems: RelatedWorkItem[],
): object {
  const relatedMarkdown = buildRelatedItemsMarkdown(relatedItems)

  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      {
        type: 'TextBlock',
        text: '🔔 Notificação de Retorno QA',
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
        text: 'Descrição: Este item retornou de **Em Teste** para **Em desenvolvimento**. Favor validar o feedback e ajustar o plano de correção.',
        wrap: true,
        color: 'Attention',
      },
      {
        type: 'TextBlock',
        text: `Work items relacionados:\n${relatedMarkdown}`,
        wrap: true,
      },
    ],
    actions: item.web_url
      ? [{ type: 'Action.OpenUrl', title: 'Abrir no Azure DevOps', url: item.web_url }]
      : [],
  }
}

function buildWebhookCard(
  item: WorkItem,
  sprintCode: string | null,
  relatedItems: RelatedWorkItem[],
): object {
  const relatedMarkdown = buildRelatedItemsMarkdown(relatedItems)
  const relatedActions = relatedItems
    .filter((rel) => !!rel.web_url)
    .slice(0, 3)
    .map((rel) => ({
      '@type': 'OpenUri',
      name: `${shortTypeLabel(rel.work_item_type)} #${rel.id}`,
      targets: [{ os: 'default', uri: rel.web_url! }],
    }))

  const plainText = [
    '🔔 Notificação de Retorno QA',
    `Work Item: #${item.id}`,
    `Título: ${item.title ?? 'Sem titulo'}`,
    `Responsável: ${item.assigned_to_display ?? '—'}`,
    `Sprint: ${sprintCode ?? '—'}`,
    `Tipo: ${item.work_item_type ?? '—'}`,
    '',
    'Descrição:',
    'Este item retornou de Em Teste para Em desenvolvimento. Favor validar o feedback do QA e atualizar as tasks de correção.',
    '',
    'Work items relacionados (PBI/Bug/Task):',
    relatedItems.length > 0
      ? relatedItems
          .slice(0, 6)
          .map((rel) => `- ${shortTypeLabel(rel.work_item_type)} #${rel.id}: ${rel.title ?? 'Sem titulo'} (${rel.state ?? '—'})`)
          .join('\n')
      : '- Sem work items relacionados mapeados para este item.',
  ].join('\n')

  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: 'FF8C00',
    summary: `Notificacao de Retorno QA — #${item.id} ${item.title ?? ''}`,
    title: '🔔 Notificação de Retorno QA',
    sections: [
      {
        activityTitle: `**${item.title ?? 'Sem titulo'}**`,
        facts: [
          { name: 'Work Item', value: `#${item.id}` },
          { name: 'Tipo', value: item.work_item_type ?? '—' },
          { name: 'Responsavel', value: item.assigned_to_display ?? '—' },
          { name: 'Sprint', value: sprintCode ?? '—' },
        ],
        markdown: true,
      },
      {
        title: 'Descricao',
        text: 'Este item retornou de **Em Teste** para **Em desenvolvimento**. Favor validar o feedback do QA e atualizar as tasks de correcao.',
        markdown: true,
      },
      {
        title: 'Work items relacionados (PBI/Bug/Task)',
        text: relatedMarkdown,
        markdown: true,
      },
    ],
    text: plainText,
    potentialAction: [
      ...(item.web_url
        ? [
            {
              '@type': 'OpenUri',
              name: 'Abrir item principal no Azure DevOps',
              targets: [{ os: 'default', uri: item.web_url }],
            },
          ]
        : []),
      ...relatedActions,
    ],
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
  const delegatedConfigured =
    (!!Deno.env.get('TEAMS_GRAPH_SENDER_USER_ID') && !!Deno.env.get('TEAMS_GRAPH_SENDER_USER_AUTH')) ||
    (!!Deno.env.get('TEAMS_DELEGATED_USERNAME') && !!Deno.env.get('TEAMS_DELEGATED_PASSWORD'))

  // Obtém token Graph uma única vez (reutilizado para todos os alertas)
  let graphToken: string | null = null
  if (graphConfigured) {
    try {
      graphToken = await getGraphToken()
    } catch (err) {
      console.error('[QAAlert] Graph token error:', (err as Error).message)
    }
  }

  // Token delegado para envio 1:1 (evita limitação de app-only no send message)
  let delegatedToken: string | null = null
  let delegatedSenderUserId: string | null = null
  let delegatedInitError: string | null = null
  if (delegatedConfigured) {
    try {
      delegatedToken = await getDelegatedGraphToken()
      delegatedSenderUserId = Deno.env.get('TEAMS_GRAPH_SENDER_USER_ID') ?? await getMeUserId(delegatedToken)
    } catch (err) {
      delegatedInitError = (err as Error).message
      console.error('[QAAlert] Delegated token error:', delegatedInitError)
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

  // Pré-carrega itens relacionados (filhos) para enriquecer a notificação visual.
  const candidateIds = ((candidates ?? []) as WorkItem[]).map((wi) => wi.id)
  const relatedByParent = new Map<number, RelatedWorkItem[]>()

  if (candidateIds.length > 0) {
    const { data: relatedItems, error: relatedErr } = await admin
      .from('devops_work_items')
      .select('id, parent_id, title, work_item_type, state, web_url')
      .in('parent_id', candidateIds)
      .in('work_item_type', ['Product Backlog Item', 'User Story', 'Task', 'Bug'])

    if (relatedErr) {
      console.error('[QAAlert] Related items query error:', relatedErr.message)
    } else {
      for (const rel of (relatedItems ?? []) as RelatedWorkItem[]) {
        if (rel.parent_id == null) continue
        const bucket = relatedByParent.get(rel.parent_id) ?? []
        bucket.push(rel)
        relatedByParent.set(rel.parent_id, bucket)
      }
    }
  }

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
    // Prefer delegated token when available to avoid app-only permission gaps on /users lookup.
    const resolverToken = delegatedToken ?? graphToken
    if (resolverToken && item.assigned_to_unique) {
      teamsUserId = await resolveTeamsUserId(item.assigned_to_unique, resolverToken)
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
    const relatedItems = relatedByParent.get(item.id) ?? []
    const adaptiveCard = buildAdaptiveCard(item, sprintCode, relatedItems)
    let alertStatus = 'skipped'
    let alertChannelType = 'none'
    let alertError: string | null = null

    try {
      // Se modo delegado está configurado, não cair para app-only automaticamente.
      // Em tenant com MFA/CA, ROPC pode falhar; nesse caso usamos webhook com erro explícito.
      let tokenFor1on1: string | null = null
      let senderFor1on1: string | null = null

      if (delegatedConfigured) {
        tokenFor1on1 = delegatedToken
        senderFor1on1 = delegatedSenderUserId
        if (!tokenFor1on1 || !senderFor1on1) {
          alertError = `1:1 delegated unavailable: ${delegatedInitError ?? 'missing delegated token or sender'}`
        }
      } else {
        tokenFor1on1 = graphToken
        senderFor1on1 = senderUserId
      }

      if (!teamsUserId) {
        alertError = alertError ?? `1:1 skipped: recipient not resolved from assigned_to_unique (${item.assigned_to_unique ?? 'null'})`
      }

      if (tokenFor1on1 && teamsUserId && senderFor1on1) {
        // 1ª opção: Teams 1:1 via Graph
        // Preferência: token delegado (service account). Fallback: app-only.
        await sendTeams1on1(tokenFor1on1, senderFor1on1, teamsUserId, adaptiveCard)
        alertStatus = 'sent'
        alertChannelType = 'teams_1on1'
        alerted++
      } else if (fallbackWebhook) {
        // 2ª opção: webhook de canal (fallback)
        await sendTeamsWebhook(fallbackWebhook, buildWebhookCard(item, sprintCode, relatedItems))
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
          await sendTeamsWebhook(fallbackWebhook, buildWebhookCard(item, sprintCode, relatedItems))
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
