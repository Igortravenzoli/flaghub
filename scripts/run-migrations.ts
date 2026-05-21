import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Script para executar migrations SQL no Supabase
 * Uso: bun run scripts/run-migrations.ts
 * 
 * Requer variável de ambiente:
 *   SUPABASE_SERVICE_ROLE_KEY=sua_chave_aqui
 */

async function runMigrations() {
  const SUPABASE_URL = 'https://nxmgppfyltwsqryfxkbm.supabase.co';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ Erro: SUPABASE_SERVICE_ROLE_KEY não definida');
    console.error('   Windows PowerShell:');
    console.error('   $env:SUPABASE_SERVICE_ROLE_KEY = "sua_chave_aqui"');
    console.error('   bun run scripts/run-migrations.ts');
    process.exit(1);
  }

  console.log('🔑 Conectando ao Supabase com Service Role Key...\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Ler arquivo SQL
    const migrationPath = join(process.cwd(), 'supabase/migrations/20260520_create_movimentacao_rpcs.sql');
    const sqlContent = readFileSync(migrationPath, 'utf-8');

    console.log('📂 Arquivo SQL carregado');
    console.log(`📝 Linhas: ${sqlContent.split('\n').length}`);
    console.log('🔄 Executando...\n');

    // Executar cada statement SQL
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    let executed = 0;

    for (const statement of statements) {
      try {
        console.log(`⏳ Executando statement ${executed + 1}/${statements.length}...`);
        
        // Usar rpc admin para executar SQL
        const { data, error } = await supabase.rpc('execute_sql', {
          sql: statement
        });

        if (error) {
          // Se error aqui, significa que a função execute_sql não existe
          // Tentar outra estratégia: usar directly via Postgres
          console.warn(`⚠️  Tentando método alternativo...`);
          
          // Este método requer que o banco de dados tenha uma função específica
          // Ou usar o cliente Postgres diretamente (não disponível via Supabase JS SDK de forma simples)
          console.error(`❌ Erro: ${error.message}`);
          throw error;
        }

        console.log('✅ Statement executada com sucesso');
        executed++;
      } catch (err: any) {
        console.error(`❌ Erro ao executar statement: ${err.message}`);
        throw err;
      }
    }

    console.log('\n✅ Todas as migrations executadas com sucesso!\n');
    console.log('📋 Funções criadas:');
    console.log('   ✅ insert_movimentacao_comercial()');
    console.log('   ✅ update_movimentacao_comercial()');
    console.log('   ✅ delete_movimentacao_comercial()\n');

    console.log('🎯 Próximos passos:');
    console.log('   1. Verifique as funções no Supabase SQL Editor');
    console.log('   2. Execute o script de testes: supabase/migrations/20260520_test_movimentacao_rpcs.sql');
    console.log('   3. Teste a UI: Clique em "+ Nova Movimentação" na aba Ganho/Perda\n');

  } catch (err: any) {
    console.error('\n❌ Erro fatal ao executar migrations:');
    console.error(`   ${err.message}`);
    
    console.error('\n📌 Alternativa: Executar manualmente no Supabase');
    console.error('   1. Vá para: https://supabase.com/dashboard/project/nxmgppfyltwsqryfxkbm/sql/new');
    console.error('   2. Copie o arquivo: supabase/migrations/20260520_create_movimentacao_rpcs.sql');
    console.error('   3. Cole no SQL Editor e clique em "Run"');
    
    process.exit(1);
  }
}

runMigrations();
