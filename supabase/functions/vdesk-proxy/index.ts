// vdesk-proxy v1.1 - Edge Function para proxy de requisições ao VDESK
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

// Endpoints disponíveis (ordem de prioridade)
const VDESK_ENDPOINTS = [
  { url: 'https://clientes.flag.com.br/Flag.AI.Gateway', name: 'externo (HTTPS)' },
  { url: 'http://clientes.flag.com.br/Flag.AI.Gateway', name: 'fallback (HTTP)' },
]

const FALLBACK_TIMEOUT_MS = 5000 // 5 segundos para timeout

// Cache do endpoint ativo (válido por instância)
let activeEndpoint: { url: string; name: string; testedAt: Date } | null = null

// Cache do token em memória (válido por instância)
let cachedToken: { token: string; expiresAt: Date; endpointUrl: string } | null = null

/**
 * Testa conectividade com um endpoint
 */
async function testEndpoint(baseUrl: string): Promise<boolean> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FALLBACK_TIMEOUT_MS)
  
  try {
    // Tenta um endpoint simples para validar conectividade
    const response = await fetch(`${baseUrl}/api/faq/validate-client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigoPuxada: '1' }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response.ok || response.status === 401 // 401 também indica que o servidor está respondendo
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    const error = err as Error
    console.log(`[VdeskProxy] Endpoint ${baseUrl} não respondeu:`, error.message)
    return false
  }
}

/**
 * Detecta e retorna o endpoint ativo com fallback
 */
async function getActiveEndpoint(): Promise<{ url: string; name: string }> {
  // Se já temos um endpoint ativo testado há menos de 5 minutos, reutilizar
  if (activeEndpoint && (new Date().getTime() - activeEndpoint.testedAt.getTime()) < 5 * 60 * 1000) {
    console.log(`[VdeskProxy] Reutilizando endpoint em cache: ${activeEndpoint.name}`)
    return activeEndpoint
  }

  console.log('[VdeskProxy] Testando endpoints disponíveis...')
  
  for (const endpoint of VDESK_ENDPOINTS) {
    console.log(`[VdeskProxy] Testando ${endpoint.name}: ${endpoint.url}`)
    const isAvailable = await testEndpoint(endpoint.url)
    
    if (isAvailable) {
      console.log(`[VdeskProxy] ✓ Endpoint ativo: ${endpoint.name}`)
      activeEndpoint = {
        url: endpoint.url,
        name: endpoint.name,
        testedAt: new Date(),
      }
      return activeEndpoint
    }
  }

  // Se nenhum endpoint respondeu, usar o primeiro como fallback
  console.warn('[VdeskProxy] ⚠ Nenhum endpoint respondeu, usando fallback para o externo')
  activeEndpoint = {
    url: VDESK_ENDPOINTS[0].url,
    name: VDESK_ENDPOINTS[0].name,
    testedAt: new Date(),
  }
  return activeEndpoint
}

/**
 * Força reset do endpoint ativo (útil para testes)
 */
function resetActiveEndpoint(): void {
  console.log('[VdeskProxy] Reset do endpoint ativo')
  activeEndpoint = null
  cachedToken = null
}

async function getVdeskToken(): Promise<string> {
  const endpoint = await getActiveEndpoint()
  
  // Verificar cache (também verifica se o endpoint mudou)
  if (cachedToken && 
      cachedToken.endpointUrl === endpoint.url && 
      new Date() < cachedToken.expiresAt) {
    console.log(`[VdeskProxy] Reutilizando token em cache (${endpoint.name})`)
    return cachedToken.token
  }

  console.log(`[VdeskProxy] Obtendo novo token via ${endpoint.name}`)
  
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FALLBACK_TIMEOUT_MS)
  
  try {
    const response = await fetch(`${endpoint.url}/api/faq/validate-client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigoPuxada: '1' }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      // Se falhar, tentar resetar e usar próximo endpoint
      console.warn(`[VdeskProxy] Falha na autenticação via ${endpoint.name}: ${response.status}`)
      resetActiveEndpoint()
      throw new Error(`Falha na autenticação VDESK: ${response.status}`)
    }

    const data = await response.json()
    
    // Cachear token com margem de 60s
    const expiresAt = new Date(data.expiresAt)
    expiresAt.setSeconds(expiresAt.getSeconds() - 60)
    
    cachedToken = {
      token: data.sessionToken,
      expiresAt,
      endpointUrl: endpoint.url,
    }

    return data.sessionToken
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    const error = err as Error
    
    // Se deu timeout ou erro de rede, resetar endpoint para tentar outro na próxima
    if (error.name === 'AbortError' || error.message?.includes('network')) {
      console.warn(`[VdeskProxy] Timeout/erro de rede em ${endpoint.name}, resetando...`)
      resetActiveEndpoint()
    }
    
    throw error
  }
}

async function proxyToVdesk(path: string, token: string): Promise<Response> {
  const endpoint = await getActiveEndpoint()
  const fullUrl = `${endpoint.url}${path}`
  
  console.log(`[VdeskProxy] Chamando ${endpoint.name}: ${path}`)
  
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s para operações
  
  try {
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    const data = await response.json()
    
    // Adicionar informação do endpoint usado na resposta
    const enrichedData = {
      ...data,
      _meta: {
        endpoint: endpoint.name,
        endpointUrl: endpoint.url,
        timestamp: new Date().toISOString(),
      }
    }
    
    return new Response(JSON.stringify(enrichedData), {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    const error = err as Error
    
    // Se falhar por timeout/rede, resetar endpoint
    if (error.name === 'AbortError') {
      console.warn(`[VdeskProxy] Timeout na requisição para ${endpoint.name}`)
      resetActiveEndpoint()
    }
    
    throw error
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const action = url.searchParams.get('action')
    
    // Ação especial: reset do endpoint
    if (action === 'reset') {
      resetActiveEndpoint()
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Endpoint resetado. Próxima requisição irá testar novamente.' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Ação especial: status do endpoint
    if (action === 'status') {
      const endpoint = await getActiveEndpoint()
      return new Response(
        JSON.stringify({ 
          success: true,
          activeEndpoint: {
            name: endpoint.name,
            url: endpoint.url,
            testedAt: activeEndpoint?.testedAt?.toISOString() || null,
          },
          hasToken: !!cachedToken,
          tokenExpiresAt: cachedToken?.expiresAt?.toISOString() || null,
          availableEndpoints: VDESK_ENDPOINTS.map(e => ({ name: e.name, url: e.url })),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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
        error: 'Ação inválida. Use action=correlacao, action=consultar, action=status ou action=reset' 
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
        error: error.message || 'Erro interno no proxy',
        activeEndpoint: activeEndpoint?.name || 'não determinado',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
