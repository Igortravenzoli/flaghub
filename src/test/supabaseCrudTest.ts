import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://nxmgppfyltwsqryfxkbm.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54bWdwcGZ5bHR3c3FyeWZ4a2JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDEwMDEsImV4cCI6MjA4NTExNzAwMX0.6TqJwx2_8dbFwbvflSZKVe6MSaagmPosQaxpg0l9Waw';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log('Conectando ao Supabase:', SUPABASE_URL);

async function main() {
  // 1. Cadastro
  const insertRes = await supabase.from('comercial_movimentacao_clientes').insert([
    {
      cliente_codigo: 9999,
      cliente_nome: 'Cliente Teste Supabase',
      tipo: 'ganho',
      bandeira: 'Teste',
      sistema: 'Demo',
      motivo: 'Validação',
      status_encerramento: 'Incluído via script',
      valor_mensal: 123.45,
      ano_referencia: 2026,
      data_evento: new Date().toISOString().slice(0, 10),
    },
  ]).select();
  console.log('Insert:', insertRes.data, insertRes.error);

  const id = insertRes.data?.[0]?.id;
  if (!id) throw new Error('Falha ao inserir');

  // 2. Edição
  const updateRes = await supabase.from('comercial_movimentacao_clientes').update({
    motivo: 'Edição via script',
    status_encerramento: 'Editado',
  }).eq('id', id).select();
  console.log('Update:', updateRes.data, updateRes.error);

  // 3. Exclusão
  const deleteRes = await supabase.from('comercial_movimentacao_clientes').delete().eq('id', id);
  console.log('Delete:', deleteRes.data, deleteRes.error);
}

main().catch(console.error);
