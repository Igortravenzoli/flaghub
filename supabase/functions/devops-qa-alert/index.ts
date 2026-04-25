/**
 * devops-qa-alert — Detecção e alerta de Retorno QA
 *
 * Detecta work items que transitaram de "Em Teste" → "Em desenvolvimento",
 * registra eventos em devops_qa_return_events e envia alertas nominais via
 * Microsoft Teams (1:1 Graph API ou fallback para webhook de canal).
 *
 * Chamada por:
 *   - devops-sync-all (ao final de cada ciclo de sync)
 *   - Cron próprio (a cada 30min)
 *   - Admin via SyncCentral (manual)
 *
 * Secrets necessários (Supabase Edge Function Secrets):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   CRON_SECRET                    — autenticação de cron
 *   TEAMS_GRAPH_TENANT_ID          — tenant Azure AD
 *   TEAMS_GRAPH_CLIENT_ID          — App Registration client ID
 *   TEAMS_GRAPH_CLIENT_SECRET      — App Registration client secret
 *   TEAMS_GRAPH_SENDER_USER_ID     — UPN ou ID do usuário que envia (ex: hub@flag.com.br)
 *   TEAMS_FALLBACK_WEBHOOK_URL     — URL do webhook de canal (fallback)
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface StateChange {
  oldValue: string | null;
  newValue: string;
  revisedDate: string;
  revisedBy: string | null;
}

interface WorkItemRow {
  id: number;
  title: string;
  work_item_type: string;
  state: string;
  tags: string | null;
  area_path: string;
  iteration_path: string;
  assigned_to_display: string | null;
  assigned_to_unique: string | null;
  state_history: StateChange[] | null;
  web_url: string | null;
  custom_fields: Record<string, unknown> | null;
}

interface LeadMapping {
  devops_unique_name: string | null;
  teams_user_id: string | null;
  teams_email: string | null;
  canonical_name: string | null;
}

interface QaReturnEvent {
  work_item_id: number;
  work_item_title: string;
  work_item_type: string;
  area_path: string;
  iteration_path: string;
  sprint_code: string | null;
  web_url: string | null;
  detected_state: string;
  detected_tags: string | null;
  transition_from_state: string;
  transition_to_state: string;
  transition_date: string | null;
  assigned_to_display: string | null;
  assigned_to_email: string | null;
  lead_email: string | null;
  lead_teams_user_id: string | null;
  detection_method: string;
}

interface RunStats {
  items_scanned:  number;
  returns_found:  number;
  new_events:     number;
  alerts_sent:    number;
  alerts_failed:  number;
  alerts_skipped: number;
  errors:         string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractSprintCode(iterationPath: string): string | null {
  const m = iterationPath.match(/S(\d+)-(\d{4})/i);
  return m ? m[0].toUpperCase() : null;
}

/** Extrai transições "Em Teste" → "Em desenvolvimento" do histórico */
function findQaReturnTransitions(history: StateChange[]): StateChange[] {
  return history.filter(
    (ch) =>
      ch.oldValue?.toLowerCase().includes("em teste") &&
      ch.newValue?.toLowerCase().includes("em desenvolvimento")
  );
}

/** Verifica se item tem tag "Retorno QA" (case-insensitive) */
function hasQaReturnTag(tags: string | null): boolean {
  if (!tags) return false;
  return tags.toLowerCase().split(";").some((t) => t.trim() === "retorno qa");
}

// ── Microsoft Graph: obter token ─────────────────────────────────────────────

async function getGraphToken(
  tenantId: string,
  clientId: string,
  clientSecret: string
): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
          scope: "https://graph.microsoft.com/.default",
        }),
      }
    );
    if (!resp.ok) {
      console.error("[graph-token] HTTP", resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    return data.access_token ?? null;
  } catch (e) {
    console.error("[graph-token] Error:", e);
    return null;
  }
}

// ── Enviar mensagem 1:1 via Graph API ─────────────────────────────────────────

async function sendTeams1on1(
  token: string,
  senderUserId: string,
  recipientUserId: string,
  card: object
): Promise<{ ok: boolean; error?: string }> {
  try {
    // 1. Criar/obter chat 1:1
    const chatResp = await fetch("https://graph.microsoft.com/v1.0/chats", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chatType: "oneOnOne",
        members: [
          {
            "@odata.type": "#microsoft.graph.aadUserConversationMember",
            roles: ["owner"],
            "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${senderUserId}')`,
          },
          {
            "@odata.type": "#microsoft.graph.aadUserConversationMember",
            roles: ["owner"],
            "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${recipientUserId}')`,
          },
        ],
      }),
    });

    if (!chatResp.ok) {
      const err = await chatResp.text();
      return { ok: false, error: `Chat create: ${chatResp.status} ${err.slice(0, 200)}` };
    }

    const chat = await chatResp.json();
    const chatId = chat.id;

    // 2. Enviar mensagem com Adaptive Card
    const msgResp = await fetch(
      `https://graph.microsoft.com/v1.0/chats/${chatId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          body: {
            contentType: "html",
            content: '<attachment id="qa-return-card"></attachment>',
          },
          attachments: [
            {
              id: "qa-return-card",
              contentType: "application/vnd.microsoft.card.adaptive",
              content: JSON.stringify(card),
            },
          ],
        }),
      }
    );

    if (!msgResp.ok) {
      const err = await msgResp.text();
      return { ok: false, error: `Message send: ${msgResp.status} ${err.slice(0, 200)}` };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ── Enviar via webhook de canal (fallback) ────────────────────────────────────

async function sendTeamsWebhook(
  webhookUrl: string,
  payload: object
): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      return { ok: false, error: `Webhook HTTP ${resp.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ── Montar Adaptive Card ──────────────────────────────────────────────────────

function buildAdaptiveCard(ev: QaReturnEvent, daysSince?: number): object {
  const daysLabel = daysSince != null ? `${daysSince.toFixed(1)} dia(s) atrás` : "";
  const sprintLabel = ev.sprint_code ?? "Sprint não identificada";
  const assigneeLabel = ev.assigned_to_display ?? ev.assigned_to_email ?? "Não atribuído";
  const typeLabel = ev.work_item_type ?? "Work Item";

  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "Container",
        style: "attention",
        items: [
          {
            type: "TextBlock",
            text: "🔁 Retorno de QA para Desenvolvimento",
            weight: "Bolder",
            size: "Medium",
            color: "Attention",
          },
        ],
      },
      {
        type: "FactSet",
        facts: [
          { title: "Item", value: `[#${ev.work_item_id}] ${ev.work_item_title ?? ""}` },
          { title: "Tipo", value: typeLabel },
          { title: "Sprint", value: sprintLabel },
          { title: "Responsável", value: assigneeLabel },
          { title: "Transição", value: `${ev.transition_from_state} → ${ev.transition_to_state}` },
          ...(ev.transition_date
            ? [{ title: "Data da transição", value: new Date(ev.transition_date).toLocaleDateString("pt-BR") }]
            : []),
          ...(daysLabel ? [{ title: "Detectado", value: daysLabel }] : []),
          { title: "Detecção", value: ev.detection_method },
        ],
      },
    ],
    actions: ev.web_url
      ? [
          {
            type: "Action.OpenUrl",
            title: "Abrir no Azure DevOps",
            url: ev.web_url,
          },
        ]
      : [],
  };
}

function buildWebhookCard(ev: QaReturnEvent): object {
  const sprintLabel = ev.sprint_code ?? "Sem sprint";
  const assigneeLabel = ev.assigned_to_display ?? ev.assigned_to_email ?? "Não atribuído";
  return {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    summary: `Retorno QA: #${ev.work_item_id}`,
    themeColor: "CC0000",
    title: `🔁 Retorno QA → Dev | ${sprintLabel}`,
    sections: [
      {
        activityTitle: `[#${ev.work_item_id}] ${ev.work_item_title ?? ""}`,
        activitySubtitle: `${ev.work_item_type} | ${assigneeLabel}`,
        facts: [
          { name: "Transição", value: `${ev.transition_from_state} → ${ev.transition_to_state}` },
          { name: "Sprint", value: sprintLabel },
          { name: "Responsável", value: assigneeLabel },
          ...(ev.transition_date
            ? [{ name: "Data", value: new Date(ev.transition_date).toLocaleDateString("pt-BR") }]
            : []),
        ],
      },
    ],
    potentialAction: ev.web_url
      ? [{ "@type": "OpenUri", name: "Abrir DevOps", targets: [{ os: "default", uri: ev.web_url }] }]
      : [],
  };
}

// ── Lógica principal ──────────────────────────────────────────────────────────

async function run(admin: SupabaseClient): Promise<RunStats> {
  const stats: RunStats = {
    items_scanned: 0,
    returns_found: 0,
    new_events: 0,
    alerts_sent: 0,
    alerts_failed: 0,
    alerts_skipped: 0,
    errors: [],
  };

  // Credenciais Graph (opcionais — se ausentes só usa webhook)
  const tenantId    = Deno.env.get("TEAMS_GRAPH_TENANT_ID");
  const clientId    = Deno.env.get("TEAMS_GRAPH_CLIENT_ID");
  const clientSecret = Deno.env.get("TEAMS_GRAPH_CLIENT_SECRET");
  const senderUserId = Deno.env.get("TEAMS_GRAPH_SENDER_USER_ID");
  const fallbackWebhook = Deno.env.get("TEAMS_FALLBACK_WEBHOOK_URL");

  const graphEnabled = !!(tenantId && clientId && clientSecret && senderUserId);
  let graphToken: string | null = null;

  if (graphEnabled) {
    graphToken = await getGraphToken(tenantId!, clientId!, clientSecret!);
    if (!graphToken) {
      stats.errors.push("Falha ao obter token Graph — usando fallback webhook");
    }
  }

  // ── Buscar canal Teams de fallback ─────────────────────────────────────────
  let webhookUrl = fallbackWebhook ?? null;
  if (!webhookUrl) {
    const { data: channels } = await admin
      .from("alert_channels")
      .select("id, config")
      .eq("channel_type", "teams")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (channels?.config) {
      const cfg = channels.config as Record<string, string>;
      webhookUrl = cfg.url ?? cfg.webhook_url ?? null;
    }
  }

  // ── Buscar work items candidatos ───────────────────────────────────────────
  // Critério primário: state = "Em desenvolvimento" E tag "Retorno QA"
  // Critério secundário: state_history tem transição Em Teste → Em desenvolvimento

  const { data: candidates, error: fetchErr } = await admin
    .from("devops_work_items")
    .select(
      "id, title, work_item_type, state, tags, area_path, iteration_path, " +
      "assigned_to_display, assigned_to_unique, state_history, web_url, custom_fields"
    )
    .or(
      "state.eq.Em desenvolvimento," +
      // também pega itens com histórico recente (mudaram nos últimos 30d)
      "and(state.eq.Em desenvolvimento,state_history.not.is.null)"
    )
    .not("state_history", "is", null);

  if (fetchErr) {
    stats.errors.push(`Fetch candidates: ${fetchErr.message}`);
    return stats;
  }

  const items = (candidates ?? []) as WorkItemRow[];
  stats.items_scanned = items.length;

  // ── Para cada candidato, avaliar retornos QA ───────────────────────────────

  for (const item of items) {
    const history: StateChange[] = Array.isArray(item.state_history) ? item.state_history : [];
    const tagMatch = hasQaReturnTag(item.tags);
    const transitions = findQaReturnTransitions(history);

    // Só processa se tem sinal de retorno QA
    if (!tagMatch && transitions.length === 0) continue;

    const detectionMethod = tagMatch && transitions.length > 0
      ? "tag+history"
      : tagMatch
      ? "tag"
      : "history";

    // Cada transição distinta é um evento separado (item pode ter retornado N vezes)
    const eventsToProcess = transitions.length > 0
      ? transitions.map((tr) => ({ transition_date: tr.revisedDate }))
      : [{ transition_date: null as string | null }]; // tag only: um evento sem data exata

    for (const trInfo of eventsToProcess) {
      stats.returns_found++;

      // ── Verificar duplicidade ────────────────────────────────────────────
      // Não re-alertar se já existe evento aberto para este item
      const { data: existingOpen } = await admin
        .from("devops_qa_return_events")
        .select("id, alert_status")
        .eq("work_item_id", item.id)
        .eq("is_open", true)
        .eq("transition_date", trInfo.transition_date ?? "")
        .maybeSingle();

      if (existingOpen) {
        stats.alerts_skipped++;
        continue;
      }

      // ── Resolver lead/responsável ────────────────────────────────────────
      const assigneeEmail = item.assigned_to_unique ?? null;
      let leadMapping: LeadMapping | null = null;

      if (assigneeEmail) {
        const { data: mapping } = await admin
          .from("devops_lead_mapping")
          .select("devops_unique_name, teams_user_id, teams_email, canonical_name")
          .eq("devops_unique_name", assigneeEmail)
          .eq("is_active", true)
          .maybeSingle();
        leadMapping = mapping;
      }

      const sprintCode = extractSprintCode(item.iteration_path ?? "");

      const event: QaReturnEvent = {
        work_item_id:         item.id,
        work_item_title:      item.title,
        work_item_type:       item.work_item_type,
        area_path:            item.area_path,
        iteration_path:       item.iteration_path,
        sprint_code:          sprintCode,
        web_url:              item.web_url,
        detected_state:       item.state,
        detected_tags:        item.tags,
        transition_from_state: "Em Teste",
        transition_to_state:   "Em desenvolvimento",
        transition_date:       trInfo.transition_date,
        assigned_to_display:   item.assigned_to_display,
        assigned_to_email:     assigneeEmail,
        lead_email:            leadMapping?.teams_email ?? assigneeEmail,
        lead_teams_user_id:    leadMapping?.teams_user_id ?? null,
        detection_method:      detectionMethod,
      };

      // ── Inserir evento ───────────────────────────────────────────────────
      const { data: inserted, error: insertErr } = await admin
        .from("devops_qa_return_events")
        .insert({
          ...event,
          alert_status: "pending",
          is_open: true,
        })
        .select("id")
        .single();

      if (insertErr) {
        stats.errors.push(`Insert event #${item.id}: ${insertErr.message}`);
        continue;
      }

      stats.new_events++;
      const eventId = inserted.id;

      // ── Enviar alerta ────────────────────────────────────────────────────
      let alertStatus: string = "pending";
      let alertChannelType: string | null = null;
      let alertError: string | null = null;

      const teamsUserId = event.lead_teams_user_id;
      const adaptiveCard = buildAdaptiveCard(event);

      if (graphToken && teamsUserId) {
        // Tentativa 1: Teams 1:1 via Graph API
        const result = await sendTeams1on1(graphToken, senderUserId!, teamsUserId, adaptiveCard);
        if (result.ok) {
          alertStatus = "sent";
          alertChannelType = "teams_1on1";
        } else {
          alertError = result.error ?? "Erro desconhecido";
          stats.errors.push(`Graph 1:1 #${item.id}: ${alertError}`);
          // Fallback para webhook de canal
          if (webhookUrl) {
            const fallback = await sendTeamsWebhook(webhookUrl, buildWebhookCard(event));
            if (fallback.ok) {
              alertStatus = "fallback_sent";
              alertChannelType = "teams_webhook";
            } else {
              alertStatus = "failed";
              alertError += ` | Fallback: ${fallback.error}`;
            }
          } else {
            alertStatus = "failed";
          }
        }
      } else if (webhookUrl) {
        // Apenas webhook (sem Graph ou sem teams_user_id)
        const result = await sendTeamsWebhook(webhookUrl, buildWebhookCard(event));
        alertStatus = result.ok ? "sent" : "failed";
        alertChannelType = "teams_webhook";
        if (!result.ok) alertError = result.error ?? null;
      } else {
        alertStatus = "skipped";
        alertError = "Sem canal de alerta configurado (nem Graph nem webhook)";
      }

      // ── Atualizar status do alerta ───────────────────────────────────────
      await admin.from("devops_qa_return_events").update({
        alert_status:      alertStatus,
        alert_channel_type: alertChannelType,
        alert_sent_at:     alertStatus !== "failed" && alertStatus !== "skipped"
          ? new Date().toISOString()
          : null,
        alert_error: alertError,
      }).eq("id", eventId);

      // Auditoria em hub_audit_logs (best-effort)
      admin.from("hub_audit_logs").insert({
        action:      "qa_return_alert",
        entity_type: "devops_work_item",
        entity_id:   String(item.id),
        metadata: {
          event_id:       eventId,
          alert_status:   alertStatus,
          channel_type:   alertChannelType,
          sprint_code:    sprintCode,
          assignee_email: assigneeEmail,
          detection:      detectionMethod,
        },
      }).then(() => {}).catch(() => {});

      if (alertStatus === "sent" || alertStatus === "fallback_sent") {
        stats.alerts_sent++;
      } else if (alertStatus === "failed") {
        stats.alerts_failed++;
      } else {
        stats.alerts_skipped++;
      }
    }
  }

  // ── Marcar como resolvidos os eventos cujo item saiu de "Em desenvolvimento" ─
  // (best-effort — não bloqueia a resposta)
  EdgeRuntime.waitUntil(
    (async () => {
      const { data: openEvents } = await admin
        .from("devops_qa_return_events")
        .select("id, work_item_id")
        .eq("is_open", true)
        .limit(200);

      if (!openEvents?.length) return;

      const openIds = openEvents.map((e: { work_item_id: number }) => e.work_item_id);
      const { data: currentItems } = await admin
        .from("devops_work_items")
        .select("id, state")
        .in("id", openIds);

      if (!currentItems) return;

      const resolvedIds = openEvents
        .filter((ev: { id: number; work_item_id: number }) => {
          const cur = currentItems.find((i: { id: number; state: string }) => i.id === ev.work_item_id);
          return cur && cur.state !== "Em desenvolvimento";
        })
        .map((ev: { id: number }) => ev.id);

      if (resolvedIds.length > 0) {
        await admin
          .from("devops_qa_return_events")
          .update({ is_open: false, resolved_at: new Date().toISOString() })
          .in("id", resolvedIds);
      }
    })()
  );

  return stats;
}

// ── Handler HTTP ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  // Autenticação: cron secret OU Bearer token de admin
  const cronSecret = Deno.env.get("CRON_SECRET");
  const incomingCron = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("Authorization");

  const isCron = cronSecret && incomingCron === cronSecret;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  if (!isCron) {
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Verificar role admin ou gestao
    const { data: roles } = await admin
      .from("hub_user_global_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "gestao"]);
    if (!roles?.length) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
  }

  try {
    const started = Date.now();
    const stats = await run(admin);
    const elapsed = Date.now() - started;

    const payload = { ok: true, elapsed_ms: elapsed, stats };
    console.log("[devops-qa-alert]", JSON.stringify(payload));

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[devops-qa-alert] Fatal:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
