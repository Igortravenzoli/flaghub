// smtp-test — Testa conexão SMTP via TCP/TLS (compatível com Supabase Edge Runtime)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Read lines from a TCP connection until we get a complete SMTP response */
async function readResponse(conn: Deno.Conn): Promise<string> {
  const buf = new Uint8Array(4096)
  const n = await conn.read(buf)
  if (n === null) throw new Error('Conexão fechada pelo servidor')
  return new TextDecoder().decode(buf.subarray(0, n))
}

/** Send a command and read the response */
async function sendCommand(conn: Deno.Conn, cmd: string): Promise<string> {
  await conn.write(new TextEncoder().encode(cmd + '\r\n'))
  return await readResponse(conn)
}

/** Check that response starts with expected code */
function assertCode(response: string, expected: string, context: string) {
  if (!response.startsWith(expected)) {
    throw new Error(`${context}: esperado ${expected}, recebeu: ${response.trim()}`)
  }
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
    const { host, port, user: smtpUser, pass, from } = body

    if (!host || !smtpUser || !pass || !from) {
      return new Response(JSON.stringify({ error: 'Campos obrigatórios: host, user, pass, from' }), { status: 400, headers: corsHeaders })
    }

    const smtpPort = Number(port) || 587
    const recipient = body.to || user.email || from
    const steps: string[] = []

    let conn: Deno.Conn

    if (smtpPort === 465) {
      // Direct TLS (SMTPS)
      conn = await Deno.connectTls({ hostname: host, port: smtpPort })
      steps.push('TLS direto na porta 465')
    } else {
      // Plain TCP connection (for STARTTLS on 587 or plain on 25)
      conn = await Deno.connect({ hostname: host, port: smtpPort })
      steps.push(`Conectado na porta ${smtpPort}`)
    }

    try {
      // Read greeting
      const greeting = await readResponse(conn)
      assertCode(greeting, '220', 'Greeting')
      steps.push('Greeting OK')

      // EHLO
      const ehlo = await sendCommand(conn, `EHLO hubfusion.local`)
      assertCode(ehlo, '250', 'EHLO')
      steps.push('EHLO OK')

      // STARTTLS for non-465 ports (if available)
      if (smtpPort !== 465 && ehlo.includes('STARTTLS')) {
        const starttlsResp = await sendCommand(conn, 'STARTTLS')
        assertCode(starttlsResp, '220', 'STARTTLS')

        // Upgrade to TLS
        conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: host })
        steps.push('STARTTLS OK')

        // Re-EHLO after TLS
        const ehlo2 = await sendCommand(conn, `EHLO hubfusion.local`)
        assertCode(ehlo2, '250', 'EHLO pós-TLS')
        steps.push('EHLO pós-TLS OK')
      }

      // AUTH LOGIN
      const authResp = await sendCommand(conn, 'AUTH LOGIN')
      assertCode(authResp, '334', 'AUTH LOGIN')

      const userResp = await sendCommand(conn, btoa(smtpUser))
      assertCode(userResp, '334', 'Username')

      const passResp = await sendCommand(conn, btoa(pass))
      assertCode(passResp, '235', 'Autenticação')
      steps.push('Autenticação OK')

      // MAIL FROM
      const mailFrom = await sendCommand(conn, `MAIL FROM:<${from}>`)
      assertCode(mailFrom, '250', 'MAIL FROM')
      steps.push('MAIL FROM OK')

      // RCPT TO
      const rcptTo = await sendCommand(conn, `RCPT TO:<${recipient}>`)
      assertCode(rcptTo, '250', 'RCPT TO')
      steps.push('RCPT TO OK')

      // DATA
      const dataResp = await sendCommand(conn, 'DATA')
      assertCode(dataResp, '354', 'DATA')

      // Send email content
      const emailBody = [
        `From: ${from}`,
        `To: ${recipient}`,
        `Subject: [HubFusion] Teste SMTP`,
        `Content-Type: text/html; charset=UTF-8`,
        ``,
        `<div style="font-family:Arial,sans-serif;padding:20px;">`,
        `<h2 style="color:#333;">✅ Teste SMTP — HubFusion</h2>`,
        `<p>Se você está lendo este e-mail, a configuração SMTP está funcionando corretamente.</p>`,
        `<hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />`,
        `<p style="font-size:12px;color:#999;">Servidor: ${host}:${smtpPort} | Remetente: ${from}</p>`,
        `</div>`,
        `.`,
      ].join('\r\n')

      const sendResult = await sendCommand(conn, emailBody)
      assertCode(sendResult, '250', 'Envio')
      steps.push('E-mail enviado com sucesso')

      // QUIT
      await sendCommand(conn, 'QUIT').catch(() => {})
    } finally {
      try { conn.close() } catch {}
    }

    return new Response(JSON.stringify({
      success: true,
      message: `E-mail de teste enviado para ${recipient} via ${host}:${smtpPort}`,
      steps,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('SMTP test error:', err)
    return new Response(JSON.stringify({
      success: false,
      error: err.message || String(err),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
