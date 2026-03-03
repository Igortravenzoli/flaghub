/**
 * Componente de Teste: Setup Supabase + Import JSON
 * 
 * Este componente permite:
 * 1. Testar conexão com Supabase
 * 2. Importar arquivos JSON para testar comportamento
 * 3. Verificar dados salvos em Supabase
 * 4. Depois fazer consultas ao VDESK via API
 */

import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface TestResult {
  status: 'success' | 'error' | 'pending';
  message: string;
  details?: any;
  timestamp?: string;
}

export function TesteSupabaseSetup() {
  const [supabaseStatus, setSupabaseStatus] = useState<TestResult | null>(null);
  const [importStatus, setImportStatus] = useState<TestResult | null>(null);
  const [ticketsImportados, setTicketsImportados] = useState<any[]>([]);
  const [isLoadingSupabase, setIsLoadingSupabase] = useState(false);
  const [isLoadingImport, setIsLoadingImport] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Test 1: Conexão com Supabase
  const testarSupabaseConexao = async () => {
    setIsLoadingSupabase(true);
    setSupabaseStatus({ status: 'pending', message: 'Testando conexão...' });

    try {
      // Tentar verificar conexão com auth
      const { data: { session }, error: authError } = await supabase.auth.getSession();

      if (authError) {
        // Tenta ligar sem autenticação (modo anônimo)
        const { data, error } = await supabase
          .from('tickets')
          .select('count()', { count: 'exact', head: true });

        if (error) {
          throw error;
        }

        setSupabaseStatus({
          status: 'success',
          message: '✅ Supabase conectado com sucesso! (Modo anônimo)',
          details: {
            url: import.meta.env.VITE_SUPABASE_URL,
            authenticated: false,
            hasAnonymousAccess: true,
            timestamp: new Date().toLocaleString('pt-BR')
          }
        });
      } else {
        setSupabaseStatus({
          status: 'success',
          message: '✅ Supabase conectado! Usuário autenticado',
          details: {
            url: import.meta.env.VITE_SUPABASE_URL,
            email: session?.user?.email,
            authenticated: true,
            timestamp: new Date().toLocaleString('pt-BR')
          }
        });
      }
    } catch (err: any) {
      console.error('Erro ao conectar Supabase:', err);
      setSupabaseStatus({
        status: 'error',
        message: `❌ Erro ao conectar: ${err.message}`,
        details: {
          error: err,
          url: import.meta.env.VITE_SUPABASE_URL,
          publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.substring(0, 20) + '...',
          timestamp: new Date().toLocaleString('pt-BR')
        }
      });
    } finally {
      setIsLoadingSupabase(false);
    }
  };

  // Test 2: Importar JSON e salvar em Supabase
  const importarJSON = async () => {
    if (!selectedFile) {
      setImportStatus({
        status: 'error',
        message: '❌ Selecione um arquivo JSON primeiro'
      });
      return;
    }

    setIsLoadingImport(true);
    setImportStatus({ status: 'pending', message: 'Importando JSON...' });

    try {
      const content = await selectedFile.text();
      const jsonData = JSON.parse(content);
      const tickets = Array.isArray(jsonData) ? jsonData : [jsonData];

      // Validar dados
      if (tickets.length === 0) {
        throw new Error('JSON vazio ou inválido');
      }

      // Preparar dados para inserção
      const ticketsFormatados = tickets.map((ticket: any) => ({
        network_id: 1, // Para testes
        ticket_external_id: ticket.number || ticket.ticket_external_id || `TEST-${Math.random()}`,
        ticket_type: ticket.type || 'incident',
        opened_at: ticket.opened_at || new Date().toISOString(),
        external_status: ticket.state || ticket.external_status || 'open',
        internal_status: ticket.internal_status || 'novo',
        assigned_to: ticket.assigned_to || null,
        os_number: ticket.os_number || ticket.os || null,
        inconsistency_code: null,
        severity: 'info',
        raw_payload: ticket,
        last_import_id: null, // NULL em vez de 0 para evitar erro de foreign key
        updated_at: new Date().toISOString()
      }));

      // Inserir em Supabase
      const { data, error } = await supabase
        .from('tickets')
        .upsert(ticketsFormatados as any, {
          onConflict: 'network_id,ticket_external_id'
        })
        .select();

      if (error) {
        throw error;
      }

      setTicketsImportados(data || []);
      setImportStatus({
        status: 'success',
        message: `✅ ${tickets.length} tickets importados com sucesso!`,
        details: {
          totalImportado: tickets.length,
          amostraBase: data?.slice(0, 2),
          timestamp: new Date().toLocaleString('pt-BR')
        }
      });

      // Limpar seleção
      setSelectedFile(null);

    } catch (err: any) {
      console.error('Erro ao importar:', err);
      setImportStatus({
        status: 'error',
        message: `❌ Erro ao importar: ${err.message}`,
        details: {
          error: err.toString(),
          arquivo: selectedFile?.name,
          timestamp: new Date().toLocaleString('pt-BR')
        }
      });
    } finally {
      setIsLoadingImport(false);
    }
  };

  // Test 3: Listar tickets importados
  const listarTicketsImportados = async () => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .limit(10)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setTicketsImportados(data || []);
      setImportStatus({
        status: 'success',
        message: `✅ ${data?.length || 0} tickets encontrados em Supabase`,
        timestamp: new Date().toLocaleString('pt-BR')
      });
    } catch (err: any) {
      setImportStatus({
        status: 'error',
        message: `❌ Erro ao listar: ${err.message}`
      });
    }
  };

  // Test 4: Limpar dados (para testes repetidos)
  const limparDados = async () => {
    if (!confirm('Tem certeza que deseja limpar TODOS os tickets? Esta ação é irreversível!')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('tickets')
        .delete()
        .neq('network_id', 0); // Delete all where network_id != 0

      if (error) throw error;

      setTicketsImportados([]);
      setImportStatus({
        status: 'success',
        message: '✅ Todos os dados foram limpos'
      });
    } catch (err: any) {
      setImportStatus({
        status: 'error',
        message: `❌ Erro ao limpar: ${err.message}`
      });
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">🧪 Teste de Setup: Supabase + VDESK API</h1>
        <p className="text-gray-600 mt-2">Valide a conexão com Supabase e teste import de JSON antes de usar a aplicação</p>
      </div>

      <Tabs defaultValue="supabase" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="supabase">1️⃣ Supabase</TabsTrigger>
          <TabsTrigger value="import">2️⃣ Import JSON</TabsTrigger>
          <TabsTrigger value="vdesk">3️⃣ VDESK API</TabsTrigger>
        </TabsList>

        {/* Tab 1: Testar Supabase */}
        <TabsContent value="supabase" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Teste de Conexão Supabase</CardTitle>
              <CardDescription>Valide a conexão com a instância Supabase</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  <strong>URL:</strong> {import.meta.env.VITE_SUPABASE_URL}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Chave Publica:</strong> {import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.substring(0, 30)}...
                </p>
              </div>

              <Button 
                onClick={testarSupabaseConexao}
                disabled={isLoadingSupabase}
                className="w-full"
                size="lg"
              >
                {isLoadingSupabase ? '⏳ Testando...' : '🔌 Testar Conexão'}
              </Button>

              {supabaseStatus && (
                <Alert className={
                  supabaseStatus.status === 'success' ? 'bg-green-50 border-green-200' :
                  supabaseStatus.status === 'error' ? 'bg-red-50 border-red-200' :
                  'bg-blue-50 border-blue-200'
                }>
                  <AlertTitle className={
                    supabaseStatus.status === 'success' ? 'text-green-900' :
                    supabaseStatus.status === 'error' ? 'text-red-900' :
                    'text-blue-900'
                  }>
                    {supabaseStatus.status === 'success' ? '✅' :
                     supabaseStatus.status === 'error' ? '❌' :
                     '⏳'} {supabaseStatus.message}
                  </AlertTitle>
                  {supabaseStatus.details && (
                    <AlertDescription className="mt-2">
                      <pre className="text-xs bg-white p-2 rounded overflow-auto">
                        {JSON.stringify(supabaseStatus.details, null, 2)}
                      </pre>
                    </AlertDescription>
                  )}
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Importar JSON */}
        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Importar e Testar JSON</CardTitle>
              <CardDescription>Importe um arquivo JSON para testar o armazenamento em Supabase</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition cursor-pointer">
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="json-input"
                />
                <label htmlFor="json-input" className="cursor-pointer">
                  <p className="text-sm text-gray-600">
                    📁 Selecione um arquivo JSON ou <strong>clique aqui</strong>
                  </p>
                  {selectedFile && (
                    <p className="text-sm text-green-600 mt-2">✅ {selectedFile.name}</p>
                  )}
                </label>
              </div>

              {selectedFile && (
                <div className="space-y-2">
                  <Button
                    onClick={importarJSON}
                    disabled={isLoadingImport}
                    className="w-full bg-green-600 hover:bg-green-700"
                    size="lg"
                  >
                    {isLoadingImport ? '⏳ Importando...' : '📤 Importar JSON'}
                  </Button>
                  <Button
                    onClick={() => setSelectedFile(null)}
                    variant="outline"
                    className="w-full"
                  >
                    Cancelar
                  </Button>
                </div>
              )}

              {importStatus && (
                <Alert className={
                  importStatus.status === 'success' ? 'bg-green-50 border-green-200' :
                  importStatus.status === 'error' ? 'bg-red-50 border-red-200' :
                  'bg-blue-50 border-blue-200'
                }>
                  <AlertTitle className={
                    importStatus.status === 'success' ? 'text-green-900' :
                    importStatus.status === 'error' ? 'text-red-900' :
                    'text-blue-900'
                  }>
                    {importStatus.message}
                  </AlertTitle>
                  {importStatus.details && (
                    <AlertDescription className="mt-2 text-xs">
                      <details className="cursor-pointer">
                        <summary>Detalhes</summary>
                        <pre className="bg-white p-2 rounded mt-2 overflow-auto">
                          {JSON.stringify(importStatus.details, null, 2)}
                        </pre>
                      </details>
                    </AlertDescription>
                  )}
                </Alert>
              )}

              <div className="space-y-2 pt-4 border-t">
                <Button
                  onClick={listarTicketsImportados}
                  variant="outline"
                  className="w-full"
                >
                  🔍 Listar Tickets Importados
                </Button>
                <Button
                  onClick={limparDados}
                  variant="destructive"
                  className="w-full"
                >
                  🗑️ Limpar Dados
                </Button>
              </div>

              {ticketsImportados.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <h3 className="font-semibold mb-2">Tickets em Supabase:</h3>
                  <table className="w-full text-xs border">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-2 text-left">ID Externo</th>
                        <th className="p-2 text-left">Tipo</th>
                        <th className="p-2 text-left">Status</th>
                        <th className="p-2 text-left">OS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ticketsImportados.map((ticket, idx) => (
                        <tr key={idx} className="border-t hover:bg-gray-50">
                          <td className="p-2 font-mono">{ticket.ticket_external_id}</td>
                          <td className="p-2">{ticket.ticket_type}</td>
                          <td className="p-2">
                            <Badge variant="outline">{ticket.internal_status}</Badge>
                          </td>
                          <td className="p-2 font-mono">{ticket.os_number || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Teste VDESK API */}
        <TabsContent value="vdesk" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Consultar VDESK via API</CardTitle>
              <CardDescription>Após testar Supabase, use este componente para testar a API</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="bg-blue-50">
                <AlertTitle>📌 Instruções</AlertTitle>
                <AlertDescription>
                  <ol className="list-decimal list-inside mt-2 space-y-1">
                    <li>Certifique-se de que VDESKProxy está rodando em <code className="bg-white px-1 rounded">http://localhost:5000</code></li>
                    <li>Use o componente <code className="bg-white px-1 rounded">TicketBuscaComponente</code> para testar queries</li>
                    <li>Ou navegue até a página de busca de tickets</li>
                  </ol>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <p className="text-sm font-semibold">API Status:</p>
                <div className="bg-gray-100 p-4 rounded">
                  <p className="text-sm">
                    <strong>URL:</strong> {import.meta.env.VITE_API_BASE_URL}
                  </p>
                  <p className="text-sm mt-2">
                    Use o componente <code className="bg-white px-1 rounded">TicketBuscaComponente</code> para testar
                  </p>
                </div>
              </div>

              <Alert className="bg-yellow-50 border-yellow-200">
                <AlertTitle className="text-yellow-900">⚠️ Próximo Passo</AlertTitle>
                <AlertDescription className="text-yellow-800">
                  Após confirmar que Supabase está funcionando, navegue para <strong>/ticket-busca</strong> para testar as queries ao VDESK
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sumário de Fluxo */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="text-blue-900">📋 Fluxo de Teste Recomendado</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm">
            <li>
              <Badge className="mr-2">1️⃣</Badge>
              <strong>Conectar Supabase:</strong> Clique no botão "Testar Conexão" acima
            </li>
            <li>
              <Badge className="mr-2">2️⃣</Badge>
              <strong>Importar JSON:</strong> Selecione um arquivo JSON de teste e importe
            </li>
            <li>
              <Badge className="mr-2">3️⃣</Badge>
              <strong>Verificar dados:</strong> Clique "Listar Tickets Importados" para confirmar
            </li>
            <li>
              <Badge className="mr-2">4️⃣</Badge>
              <strong>Consultar VDESK:</strong> Navegue para <code className="bg-white px-1 rounded">/ticket-busca</code> e teste as queries
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

export default TesteSupabaseSetup;
