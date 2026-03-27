// smtp-test — Envia um e-mail de teste usando configuração SMTP fornecida
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: corsHeaders })

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: corsHeaders })

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
    if (!(hubRoles?.length || legacyRoles?.length)) {
      return new Response(JSON.stringify({ error: 'Sem permissão' }), { status: 403, headers: corsHeaders })
    }

    const body = await req.json()
    const { host, port, user: smtpUser, pass, from, tls, to } = body

    if (!host || !smtpUser || !pass || !from) {
      return new Response(JSON.stringify({ error: 'Campos obrigatórios: host, user, pass, from' }), { status: 400, headers: corsHeaders })
    }

    const recipient = to || user.email || from
    const smtpPort = Number(port) || 587

    // Send email in background to avoid Edge Function timeout
    const sendPromise = (async () => {
      try {
        const client = new SMTPClient({
          connection: {
            hostname: host,
            port: smtpPort,
            tls: smtpPort === 465,
            auth: {
              username: smtpUser,
              password: pass,
            },
          },
        })

        await client.send({
          from,
          to: recipient,
          subject: '[HubFusion] Teste SMTP',
          content: 'Teste SMTP enviado pelo HubFusion.',
          html: `
            <div style="font-family:Arial,sans-serif;padding:20px;">
              <h2 style="color:#333;">✅ Teste SMTP — HubFusion</h2>
              <p>Se você está lendo este e-mail, a configuração SMTP está funcionando corretamente.</p>
              <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
              <p style="font-size:12px;color:#999;">Servidor: ${host}:${smtpPort} | Remetente: ${from}</p>
            </div>
          `,
        })

        await client.close()
        console.log(`SMTP test email sent to ${recipient}`)
      } catch (err) {
        console.error('SMTP background send error:', err)
      }
    })()

    // Use waitUntil if available (Supabase Edge Runtime), otherwise fire-and-forget
    if (typeof (globalThis as any).EdgeRuntime?.waitUntil === 'function') {
      ;(globalThis as any).EdgeRuntime.waitUntil(sendPromise)
    }

    return new Response(JSON.stringify({
      success: true,
      message: `E-mail de teste sendo enviado para ${recipient}. Verifique sua caixa de entrada em alguns segundos.`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('SMTP test error:', err)
    return new Response(JSON.stringify({ success: false, error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
