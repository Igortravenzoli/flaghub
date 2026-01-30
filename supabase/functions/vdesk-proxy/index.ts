import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const VDESK_API_BASE = 'https://clientes.flag.com.br/Flag.Ai.Gateway'

// Cache do token em memória (válido por instância)
let cachedToken: { token: string; expiresAt: Date } | null = null

async function getVdeskToken(): Promise<string> {
  // Verificar cache
  if (cachedToken && new Date() < cachedToken.expiresAt) {
    console.log('[VdeskProxy] Reutilizando token em cache')
    return cachedToken.token
  }

  console.log('[VdeskProxy] Obtendo novo token via validate-client')
  
  const response = await fetch(`${VDESK_API_BASE}/api/faq/validate-client`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigoPuxada: '1' }),
  })

  if (!response.ok) {
    throw new Error(`Falha na autenticação VDESK: ${response.status}`)
  }

  const data = await response.json()
  
  // Cachear token com margem de 60s
  const expiresAt = new Date(data.expiresAt)
  expiresAt.setSeconds(expiresAt.getSeconds() - 60)
  
  cachedToken = {
    token: data.sessionToken,
    expiresAt,
  }

  return data.sessionToken
}

async function proxyToVdesk(endpoint: string, token: string): Promise<Response> {
  console.log(`[VdeskProxy] Chamando: ${endpoint}`)
  
  const response = await fetch(`${VDESK_API_BASE}${endpoint}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  })

  const data = await response.json()
  
  return new Response(JSON.stringify(data), {
    status: response.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const action = url.searchParams.get('action')
    
    // Obter token válido
    const token = await getVdeskToken()

    if (action === 'correlacao') {
      const ticketNestle = url.searchParams.get('ticketNestle')
      if (!ticketNestle) {
        return new Response(
          JSON.stringify({ success: false, error: 'ticketNestle é obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      return await proxyToVdesk(`/api/tickets-os/correlacao?ticketNestle=${encodeURIComponent(ticketNestle)}`, token)
    }

    if (action === 'consultar') {
      const params = new URLSearchParams()
      
      // Copiar parâmetros de consulta
      for (const [key, value] of url.searchParams.entries()) {
        if (key !== 'action') {
          params.append(key, value)
        }
      }
      
      return await proxyToVdesk(`/api/tickets-os/consultar?${params}`, token)
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Ação inválida. Use action=correlacao ou action=consultar' 
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    const error = err as Error
    console.error('[VdeskProxy] Erro:', error)
    
    // Limpar cache em caso de erro de autenticação
    if (error.message?.includes('401') || error.message?.includes('autenticação')) {
      cachedToken = null
    }
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Erro interno no proxy' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
