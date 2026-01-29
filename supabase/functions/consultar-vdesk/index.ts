// Supabase Edge Function para consultar banco VDESK SQL Server
// Deploy: supabase functions deploy consultar-vdesk

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

// ⚠️ CONFIGURAR SECRETS NO SUPABASE:
// supabase secrets set VDESK_HOST=FIWSRVSQL01
// supabase secrets set VDESK_USER=User_TicketOS
// supabase secrets set VDESK_PASSWORD=Password
// supabase secrets set VDESK_DATABASE=VDESK

const VDESK_CONNECTION = {
  hostname: Deno.env.get('VDESK_HOST') || 'FIWSRVSQL01',
  username: Deno.env.get('VDESK_USER') || 'User_TicketOS',
  password: Deno.env.get('VDESK_PASSWORD') || '', // ⚠️ CONFIGURAR!
  database: Deno.env.get('VDESK_DATABASE') || 'VDESK',
  port: 1433
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { ticketNestle, osNumber } = await req.json();

    // Query VDESK SQL Server
    const query = `
      SELECT TOP 100
        T1.Apeli_At AS Cliente,
        CASE T3.BANDE_CLIE 
          WHEN 'O' THEN 'Outros'
          WHEN 'N' THEN 'Nestlé'
          WHEN 'H' THEN 'Heineken'
          WHEN '1' THEN 'DPA'
          WHEN '2' THEN 'Garoto'
          WHEN 'D' THEN 'Danone'
          WHEN 'B' THEN 'Brahma'
          WHEN 'E' THEN 'Pakera'
          WHEN '4' THEN 'Nespresso'
          WHEN '5' THEN 'Froneri'
          ELSE 'Outros'
        END AS Bandeira,
        T2.Funrpsos_ AS Programador,
        T2.NUMOS_ AS OS,
        T1.NumChamadoB1_At AS TICKET_NESTLE,
        T2.IntSeqRealizacao AS Sequencia,
        CONVERT(VARCHAR, T1.Data_At, 103) AS DataRegistro,
        T6.Descr_Sis AS Sistema,
        T1.Programa AS Componente,
        T7.Descricao AS Descricao,
        CAST(T5.DUVIDA AS VARCHAR(1000)) AS DescricaoOS,
        CONVERT(VARCHAR, T1.DataPrevEnt_De, 103) AS Previsao,
        MAX(T2.Dathorhtros_) AS DataHistorico,
        LEFT(FORMAT(tmppvtos_ / 60,'00')+':'+FORMAT(((tmppvtos_ / 60.0)-(tmppvtos_ / 60))*60,'00'),9) AS PrevisaoMinutos,
        T4.ERROPADRAO AS TipoChamado,
        T1.CODCRITICIDADE AS Criticidade,
        CASE T2.RetErrOS_ 
          WHEN '1' THEN 'Sim'
          WHEN '0' THEN 'Não'
          ELSE ''
        END AS Retorno
      FROM ATENDIMENTO T1 (NOLOCK)
      JOIN HistoricoOS T2 ON T1.NUMER_AT = T2.NUMOS_
      JOIN CLIENTES T3 (NOLOCK) ON T1.Apeli_At = T3.Apeli_Clie
      JOIN TempoErrosPadroes T4 (NOLOCK) ON T4.CODIGOERRO = T1.ERROPAD_AT
      LEFT JOIN DuvidasSolucoes T5 (NOLOCK) ON T1.Numer_At = T5.ATENDIMENTO AND T1.Siste_At = T5.Sistema
      JOIN Sistemas T6 (NOLOCK) ON T1.Siste_At = T6.Sist_Sis
      JOIN ProgramasValidos T7 (NOLOCK) ON T1.Siste_At = T7.Sistema AND T1.PROGRAMA = T7.Programa
      WHERE T2.Datatdos_ IS NULL
        AND T1.DataB_At IS NULL
        AND T1.NumChamadoB1_At <> ''
        ${ticketNestle ? `AND T1.NumChamadoB1_At = '${ticketNestle}'` : ''}
        ${osNumber ? `AND T2.NUMOS_ = '${osNumber}'` : ''}
      GROUP BY T1.Apeli_At, T3.BANDE_CLIE, T2.Funrpsos_, T2.Dathorhtros_, 
        T1.NUMER_AT, T2.NUMOS_, T2.IntSeqRealizacao, T1.Data_At, 
        T6.Descr_Sis, T1.Programa, T7.Descricao, T1.DataPrevEnt_De,
        T2.Tmppvtos_, T4.ERROPADRAO, CAST(T5.DUVIDA AS VARCHAR(1000)),
        T1.CODCRITICIDADE, T2.RetErrOS_, T1.NumChamadoB1_At
      ORDER BY T2.NUMOS_ DESC
    `;

    // Conectar ao SQL Server via proxy PostgreSQL
    // Nota: Para SQL Server direto, você precisará usar uma lib específica
    // ou proxy. Por ora, vamos retornar mock para você testar a estrutura.
    
    // TODO: Implementar conexão real com SQL Server
    // Opções:
    // 1. Usar mssql lib do Node.js via Deno
    // 2. Criar proxy em .NET que exponha REST API
    // 3. Usar ODBC via Deno

    const records: Record<string, unknown>[] = []; // Aqui virão os dados reais do VDESK

    return new Response(
      JSON.stringify({ records }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    )

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        },
        status: 400 
      }
    )
  }
})
