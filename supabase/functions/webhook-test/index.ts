import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Missing auth' }), { status: 401, headers: corsHeaders });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { url, type, label } = await req.json();
    if (!url || !type) {
      return new Response(JSON.stringify({ success: false, error: 'Missing url or type' }), { status: 400, headers: corsHeaders });
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
        chat_id: new URL(url).searchParams.get('chat_id') || '',
        text: `🔔 HubFusion - Teste de Webhook\n\nWebhook "${label || 'Sem label'}" configurado com sucesso!`,
        parse_mode: 'HTML',
      });
    }

    const res = await fetch(url, { method: 'POST', headers, body });
    const resText = await res.text();

    if (!res.ok) {
      return new Response(JSON.stringify({ success: false, error: `HTTP ${res.status}: ${resText.substring(0, 300)}` }), { status: 200, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ success: true, message: `Teste enviado com sucesso para ${type === 'teams' ? 'Teams' : 'Telegram'}!` }), { headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || String(err) }), { status: 200, headers: corsHeaders });
  }
});
