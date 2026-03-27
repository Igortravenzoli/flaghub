// smtp-test — Envia um e-mail de teste usando configuração SMTP fornecida
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SmtpClient } from 'https://deno.land/x/smtp@v0.7.0/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function resolveCors(req: Request) {
  const origin = req.headers.get('origin')
  return { ...corsHeaders, 'Access-Control-Allow-Origin': origin ?? '*', Vary: 'Origin' }
}

serve(async (req) => {
  const cors = resolveCors(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // Auth check – only admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: cors })

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: cors })

    // Check admin role via both role tables
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
    const hasPermission = (hubRoles && hubRoles.length > 0) || (legacyRoles && legacyRoles.length > 0)
    if (!hasPermission) {
      return new Response(JSON.stringify({ error: 'Sem permissão' }), { status: 403, headers: cors })
    }

    const body = await req.json()
    const { host, port, user: smtpUser, pass, from, tls, to } = body

    if (!host || !smtpUser || !pass || !from) {
      return new Response(JSON.stringify({ error: 'Campos obrigatórios: host, user, pass, from' }), { status: 400, headers: cors })
    }

    const recipient = to || user.email || from

    const client = new SmtpClient()

    const connectConfig = {
      hostname: host,
      port: Number(port) || 587,
      username: smtpUser,
      password: pass,
    }

    if (tls) {
      await client.connectTLS(connectConfig)
    } else {
      await client.connect(connectConfig)
    }

    await client.send({
      from: from,
      to: recipient,
      subject: '[HubFusion] Teste SMTP',
      content: 'Este é um e-mail de teste enviado pelo HubFusion para validar a configuração SMTP.',
      html: `
        <div style="font-family:Arial,sans-serif;padding:20px;">
          <h2 style="color:#333;">✅ Teste SMTP — HubFusion</h2>
          <p>Se você está lendo este e-mail, a configuração SMTP está funcionando corretamente.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
          <p style="font-size:12px;color:#999;">Servidor: ${host}:${port} | Remetente: ${from}</p>
        </div>
      `,
    })

    await client.close()

    return new Response(JSON.stringify({ success: true, message: `E-mail de teste enviado para ${recipient}` }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('SMTP test error:', err)
    return new Response(JSON.stringify({ success: false, error: err.message || String(err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
