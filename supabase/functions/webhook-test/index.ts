import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const WEBHOOK_TYPES = new Set(['teams', 'telegram']);

const DEFAULT_ALLOWED_HOSTS: Record<string, string[]> = {
  teams: [
    'outlook.office.com',
    'outlook.office365.com',
    'webhook.office.com',
    '.webhook.office.com',
    '.logic.azure.com',
  ],
  telegram: [
    'api.telegram.org',
  ],
};

function isIpv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d+$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

function isPrivateIpv4(hostname: string): boolean {
  if (!isIpv4(hostname)) return false;
  const [a, b] = hostname.split('.').map(Number);

  // RFC1918 + loopback + link-local + CGNAT + unspecified
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;

  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();

  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '0.0.0.0' || h === '::' || h === '::1') return true;
  if (h === '169.254.169.254') return true; // cloud metadata common endpoint
  if (isPrivateIpv4(h)) return true;

  // Block direct IPv6 literals by policy (including ULA/link-local)
  if (h.includes(':')) return true;

  return false;
}

function parseEnvAllowedHosts(type: 'teams' | 'telegram'): string[] {
  const raw = Deno.env.get(`WEBHOOK_TEST_ALLOWED_HOSTS_${type.toUpperCase()}`) ?? '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedHost(type: 'teams' | 'telegram', hostname: string): boolean {
  const host = hostname.toLowerCase();
  const envHosts = parseEnvAllowedHosts(type);
  const allowed = envHosts.length > 0 ? envHosts : DEFAULT_ALLOWED_HOSTS[type];

  return allowed.some((entry) => {
    if (entry.startsWith('.')) return host.endsWith(entry);
    return host === entry;
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  try {
    // Validate JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Missing auth' }), { status: 401, headers: corsHeaders(req) });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: corsHeaders(req) });
    }

    const { url, type, label } = await req.json();
    if (!url || !type) {
      return new Response(JSON.stringify({ success: false, error: 'Missing url or type' }), { status: 400, headers: corsHeaders(req) });
    }

    if (!WEBHOOK_TYPES.has(type)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid webhook type' }), { status: 400, headers: corsHeaders(req) });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new Response(JSON.stringify({ success: false, error: 'Invalid webhook URL' }), { status: 400, headers: corsHeaders(req) });
    }

    if (parsedUrl.protocol !== 'https:') {
      return new Response(JSON.stringify({ success: false, error: 'Webhook URL must use HTTPS' }), { status: 400, headers: corsHeaders(req) });
    }

    if (isBlockedHostname(parsedUrl.hostname)) {
      return new Response(JSON.stringify({ success: false, error: 'Blocked webhook host' }), { status: 400, headers: corsHeaders(req) });
    }

    if (!isAllowedHost(type, parsedUrl.hostname)) {
      return new Response(JSON.stringify({ success: false, error: 'Webhook host not allowed' }), { status: 400, headers: corsHeaders(req) });
    }

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
      body = JSON.stringify({
        chat_id: parsedUrl.searchParams.get('chat_id') || '',
        text: `🔔 HubFusion - Teste de Webhook\n\nWebhook "${label || 'Sem label'}" configurado com sucesso!`,
        parse_mode: 'HTML',
      });
    }

    const res = await fetch(url, { method: 'POST', headers, body });
    const resText = await res.text();

    if (!res.ok) {
      return new Response(JSON.stringify({ success: false, error: `HTTP ${res.status}: ${resText.substring(0, 300)}` }), { status: 200, headers: corsHeaders(req) });
    }

    return new Response(JSON.stringify({ success: true, message: `Teste enviado com sucesso para ${type === 'teams' ? 'Teams' : 'Telegram'}!` }), { headers: corsHeaders(req) });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || String(err) }), { status: 200, headers: corsHeaders(req) });
  }
});
