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

// Timeouts por etapa (evita aborts “genéricos” e facilita diagnóstico)
const ENDPOINT_TEST_TIMEOUT_MS = 8000 // teste rápido de conectividade
const TOKEN_TIMEOUT_MS = 20000 // obter token pode ser mais lento
const REQUEST_TIMEOUT_MS = 45000 // consultas podem demorar

// Cache do endpoint ativo (válido por instância)
let activeEndpoint: { url: string; name: string; testedAt: Date } | null = null

// Último endpoint conhecido (não é limpo no reset; útil para diagnosticar erros)
let lastKnownEndpoint: { url: string; name: string } | null = null

// Cache do token em memória (válido por instância)
let cachedToken: { token: string; expiresAt: Date; endpointUrl: string } | null = null

class TimeoutError extends Error {
  stage: string
  timeoutMs: number
  constructor(stage: string, timeoutMs: number) {
    super(`Timeout na etapa '${stage}' após ${timeoutMs}ms`)
    this.name = 'TimeoutError'
    this.stage = stage
    this.timeoutMs = timeoutMs
  }
}

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.name === 'TimeoutError' || err.name === 'AbortError' || err.message?.includes('signal has been aborted')
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  stage: string,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TimeoutError(stage, timeoutMs)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Testa conectividade com um endpoint
 */
async function testEndpoint(baseUrl: string): Promise<boolean> {
  try {
    // Usa /health para checagem rápida de conectividade (evita peso de autenticação)
    const response = await fetchWithTimeout(
      `${baseUrl}/health`,
      { method: 'GET' },
      ENDPOINT_TEST_TIMEOUT_MS,
      'endpoint_test',
    )

    // Qualquer resposta HTTP indica conectividade (mesmo que não seja 2xx)
    return true
  } catch (err: unknown) {
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
      lastKnownEndpoint = { url: activeEndpoint.url, name: activeEndpoint.name }
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
  lastKnownEndpoint = { url: activeEndpoint.url, name: activeEndpoint.name }
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

async function getVdeskToken(endpoint: { url: string; name: string }): Promise<string> {
  
  // Verificar cache (também verifica se o endpoint mudou)
  if (cachedToken && 
      cachedToken.endpointUrl === endpoint.url && 
      new Date() < cachedToken.expiresAt) {
    console.log(`[VdeskProxy] Reutilizando token em cache (${endpoint.name})`)
    return cachedToken.token
  }

  console.log(`[VdeskProxy] Obtendo novo token via ${endpoint.name}`)
  
  try {
    const response = await fetchWithTimeout(
      `${endpoint.url}/api/faq/validate-client`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigoPuxada: '1' }),
      },
      TOKEN_TIMEOUT_MS,
      'token',
    )

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
    throw err
  }
}

async function proxyToVdesk(endpoint: { url: string; name: string }, path: string, token: string): Promise<Response> {
  const fullUrl = `${endpoint.url}${path}`
  
  console.log(`[VdeskProxy] Chamando ${endpoint.name}: ${path}`)
  
  try {
    const response = await fetchWithTimeout(
      fullUrl,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      },
      REQUEST_TIMEOUT_MS,
      'request',
    )

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
    throw err
  }
}

async function executeProxyWithRetry(path: string): Promise<Response> {
  let lastError: unknown = null

  for (let attempt = 1; attempt <= 2; attempt++) {
    const endpoint = await getActiveEndpoint()
    lastKnownEndpoint = { url: endpoint.url, name: endpoint.name }

    try {
      const token = await getVdeskToken(endpoint)
      return await proxyToVdesk(endpoint, path, token)
    } catch (err: unknown) {
      lastError = err
      const msg = err instanceof Error ? err.message : String(err)

      if (isRetryableError(err) && attempt === 1) {
        console.warn(`[VdeskProxy] Falha retryable (${msg}). Tentando novamente com redetecção de endpoint...`)
        resetActiveEndpoint()
        continue
      }

      throw err
    }
  }

  throw lastError
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

    if (action === 'correlacao') {
      const ticketNestle = url.searchParams.get('ticketNestle')
      if (!ticketNestle) {
        return new Response(
          JSON.stringify({ success: false, error: 'ticketNestle é obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      return await executeProxyWithRetry(`/api/tickets-os/correlacao?ticketNestle=${encodeURIComponent(ticketNestle)}`)
    }

    if (action === 'consultar') {
      const params = new URLSearchParams()
      
      // Copiar parâmetros de consulta
      for (const [key, value] of url.searchParams.entries()) {
        if (key !== 'action') {
          params.append(key, value)
        }
      }
      
      return await executeProxyWithRetry(`/api/tickets-os/consultar?${params}`)
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
    
    const endpointForError = lastKnownEndpoint || (activeEndpoint ? { name: activeEndpoint.name, url: activeEndpoint.url } : null)
    const isTimeout = error?.name === 'TimeoutError'

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erro interno no proxy',
        errorCode: isTimeout ? 'TIMEOUT' : undefined,
        message: isTimeout ? 'Timeout ao chamar o VDESK. Tente novamente.' : undefined,
        activeEndpoint: endpointForError?.name || 'não determinado',
        _meta: {
          endpoint: endpointForError?.name || null,
          endpointUrl: endpointForError?.url || null,
          timestamp: new Date().toISOString(),
        },
      }),
      { status: isTimeout ? 504 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
