import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Validates a webhook URL to prevent SSRF attacks.
 * Blocks:
 *   - Non-HTTPS schemes
 *   - RFC1918 / loopback / link-local / cloud metadata IP ranges
 *   - IPv6 link-local and unique-local ranges
 */
function validateWebhookUrl(rawUrl: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'URL inválida' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Apenas URLs HTTPS são permitidas para webhooks' };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (hostname === 'localhost') {
    return { ok: false, reason: 'Endereço de host não permitido' };
  }

  // Block IPv4 private/reserved ranges
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (
      a === 127 ||                              // loopback
      a === 10 ||                               // RFC1918 class A
      a === 0 ||                                // reserved
      (a === 172 && b >= 16 && b <= 31) ||      // RFC1918 class B
      (a === 192 && b === 168) ||               // RFC1918 class C
      (a === 169 && b === 254)                  // link-local / cloud metadata
    ) {
      return { ok: false, reason: 'Endereço IP privado ou reservado não permitido' };
    }
  }

  // Block IPv6 loopback, link-local, unique-local
  if (
    hostname === '::1' ||
    hostname.startsWith('fe80:') ||
    hostname.startsWith('fc') ||
    hostname.startsWith('fd')
  ) {
    return { ok: false, reason: 'Endereço IPv6 privado ou reservado não permitido' };
  }

  return { ok: true, url: parsed };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  try {
    // Validate JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Missing auth' }), {
        status: 401,
        headers: corsHeaders(req),
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: corsHeaders(req),
      });
    }

    // Restrict to admin/gestao — webhook testing is a privileged operation
    // that makes outbound HTTP calls and must not be open to all users.
    const { data: hubRoles } = await admin
      .from('hub_user_global_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'gestao']);
    const { data: legacyRoles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'gestao']);
    if (!(hubRoles?.length || legacyRoles?.length)) {
      return new Response(JSON.stringify({ success: false, error: 'Sem permissão' }), {
        status: 403,
        headers: corsHeaders(req),
      });
    }

    const { url: rawUrl, type, label } = await req.json();
    if (!rawUrl || !type) {
      return new Response(JSON.stringify({ success: false, error: 'Missing url or type' }), {
        status: 400,
        headers: corsHeaders(req),
      });
    }

    // SSRF guard: validate URL before making any outbound request
    const urlCheck = validateWebhookUrl(rawUrl);
    if (!urlCheck.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `URL rejeitada: ${urlCheck.reason}` }),
        { status: 400, headers: corsHeaders(req) },
      );
    }
    const parsedUrl = urlCheck.url;

    let body: string;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (type === 'teams') {
      body = JSON.stringify({
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        summary: "HubFusion Test",
        themeColor: "0076D7",
        title: "🔔 HubFusion - Teste de Webhook",
        text: `Webhook **${label || 'Sem label'}** configurado com sucesso!`,
      });
    } else {
      // Telegram — expect url like https://api.telegram.org/bot<token>/sendMessage
      const chatId = parsedUrl.searchParams.get('chat_id') || '';
      body = JSON.stringify({
        chat_id: chatId,
        text: `🔔 HubFusion - Teste de Webhook\n\nWebhook "${label || 'Sem label'}" configurado com sucesso!`,
        parse_mode: 'HTML',
      });
    }

    const res = await fetch(parsedUrl.toString(), { method: 'POST', headers, body });
    const resText = await res.text();

    if (!res.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `HTTP ${res.status}: ${resText.substring(0, 300)}` }),
        { status: 200, headers: corsHeaders(req) },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Teste enviado com sucesso para ${type === 'teams' ? 'Teams' : 'Telegram'}!`,
      }),
      { headers: corsHeaders(req) },
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message || String(err) }),
      { status: 200, headers: corsHeaders(req) },
    );
  }
});
