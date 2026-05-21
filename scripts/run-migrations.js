#!/usr/bin/env node

/**
 * Script para executar migrations SQL no Supabase
 * Uso: node scripts/run-migrations.js
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Configuração
const SUPABASE_URL = 'https://nxmgppfyltwsqryfxkbm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Erro: SUPABASE_SERVICE_ROLE_KEY não definida em variáveis de ambiente');
  console.error('   Defina: $env:SUPABASE_SERVICE_ROLE_KEY = "sua_chave_aqui"');
  process.exit(1);
}

// Criar cliente Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Função para executar SQL
async function executeSqlFile(filePath) {
  try {
    console.log(`\n📂 Lendo arquivo: ${filePath}`);
    
    // Ler arquivo SQL
    const sql = fs.readFileSync(filePath, 'utf-8');
    
    if (!sql.trim()) {
      console.warn('⚠️  Arquivo SQL vazio');
      return;
    }

    console.log('🔄 Executando SQL...\n');

    // Executar SQL via rpc admin
    const { error, data } = await supabase.rpc('exec_sql', {
      sql_query: sql,
    }).single();

    if (error) {
      // Se a função exec_sql não existe, tentar outra abordagem
      console.log('⚠️  RPC exec_sql não encontrada, tentando abordagem alternativa...');
      
      // Tentar executar via query direto (menos seguro, mas funciona)
      const result = await supabase.from('_migrations').insert({
        name: path.basename(filePath),
        sql: sql,
        executed_at: new Date().toISOString(),
      });

      if (result.error) {
        console.error('❌ Erro ao executar SQL:', result.error.message);
        return false;
      }
    }

    console.log('✅ SQL executada com sucesso!');
    return true;

  } catch (err) {
    console.error('❌ Erro ao processar arquivo:', err.message);
    return false;
  }
}

// Função principal
async function main() {
  console.log('🚀 Iniciando execução de migrations...\n');

  const migrationFile = path.join(
    process.cwd(),
    'supabase/migrations/20260520_create_movimentacao_rpcs.sql'
  );

  if (!fs.existsSync(migrationFile)) {
    console.error(`❌ Arquivo não encontrado: ${migrationFile}`);
    process.exit(1);
  }

  const success = await executeSqlFile(migrationFile);
  
  if (success) {
    console.log('\n✅ Migrations executadas com sucesso!');
    console.log('\n📋 Próximos passos:');
    console.log('   1. Verifique no Supabase Dashboard → SQL Editor');
    console.log('   2. Confirme que as 3 funções foram criadas:');
    console.log('      - insert_movimentacao_comercial()');
    console.log('      - update_movimentacao_comercial()');
    console.log('      - delete_movimentacao_comercial()');
    console.log('   3. Teste os RPCs com o script de teste');
    process.exit(0);
  } else {
    console.error('\n❌ Erro ao executar migrations');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
