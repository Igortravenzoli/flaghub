/**
 * Script de Validação: Retorno QA S10-2026
 * 
 * Execute no console do browser enquanto está na visão gerencial
 * para verificar se os dados do React Query estão em sync com o banco
 */

async function validateQaReturn() {
  console.log('🔍 Validando Retorno QA para S10-2026...\n');

  // 1. Verificar cache React Query
  const queryCache = window.queryClient?.getQueryCache?.();
  const gerencialData = queryCache?.findAll({
    queryKey: ['gerencial-fabrica', 'S10-2026']
  })?.[0];

  console.log('📦 Cache React Query:');
  if (gerencialData?.state?.data) {
    const qaTotal = gerencialData.state.data[0]?.qa_return_total;
    console.log(`   qa_return_total: ${qaTotal} (esperado: 12) ${qaTotal === 12 ? '✅' : '❌'}`);
  } else {
    console.log('   Nenhum dado encontrado no cache');
  }

  // 2. Fazer query nova do Supabase
  const supabase = window.supabase?.client;
  if (supabase) {
    console.log('\n🔄 Consultando RPC novamente...');
    const { data, error } = await supabase.rpc('rpc_gerencial_fabrica_summary', {
      p_sprint_code: 'S10-2026',
      p_date_start: null,
      p_date_end: null,
      p_sector: null,
    });
    
    if (error) {
      console.log(`   ❌ Erro: ${error.message}`);
    } else {
      const qaTotal = data?.[0]?.qa_return_total;
      console.log(`   qa_return_total: ${qaTotal} (esperado: 12) ${qaTotal === 12 ? '✅' : '❌'}`);
    }
  }

  // 3. Dicas
  console.log('\n💡 Se houver divergência, tente:');
  console.log('   1. F5 + Ctrl+Shift+Delete (limpar cache)');
  console.log('   2. Ou executar: window.queryClient.invalidateQueries({ queryKey: ["gerencial-fabrica"] })');
}

// Executar
await validateQaReturn();
