// Supabase Edge Function para consultar banco VDESK SQL Server
// Deploy: supabase functions deploy consultar-vdesk
// NOTA: Esta função está incompleta e não deve ser usada em produção
// Use vdesk-proxy para todas as consultas ao VDESK

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Valida autenticação do usuário via JWT
 */
async function validateAuthentication(req: Request): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get('authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.replace('Bearer ', '')
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[ConsultarVdesk] Variáveis de ambiente SUPABASE não configuradas')
    return null
  }

  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  })

  try {
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token)
    
    if (claimsError || !claimsData?.claims) {
      return null
    }

    return { userId: claimsData.claims.sub as string }
  } catch {
    return null
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // =========================================
  // AUTENTICAÇÃO OBRIGATÓRIA
  // =========================================
  const auth = await validateAuthentication(req)
  if (!auth) {
    return new Response(
      JSON.stringify({ error: 'Autenticação obrigatória' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401 
      }
    )
  }

  try {
    // Esta função está incompleta - conexão direta com SQL Server não está implementada
    // Retorna erro informativo ao invés de dados vazios
    return new Response(
      JSON.stringify({ 
        error: 'Função não implementada',
        message: 'Use a função vdesk-proxy para consultas ao VDESK. Esta função está desativada.',
        suggestion: 'Chame /functions/v1/vdesk-proxy?action=consultar ou ?action=correlacao'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 501 // Not Implemented
      }
    )

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})
