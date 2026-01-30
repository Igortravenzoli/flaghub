/**
 * Componente de Exemplo: Busca e Correlação de Tickets
 * 
 * Demonstra o uso dos novos hooks de API REST (ticketsOSApi.ts)
 * para consumir dados do backend VDESKProxy em localhost:5000
 * 
 * Funcionalidades:
 * - Buscar tickets/OS por número de ticket
 * - Buscar por período de datas
 * - Buscar por programador
 * - Buscar por cliente
 * - Busca por OS
 * - Exibir resultados em tabela formatada
 * - Correlação de tickets com OS
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  useConsultarTicketsOS,
  useCorrelacionarTicket,
  useBuscarPorPeriodo,
  useBuscarPorProgramador,
  useBuscarPorOS,
  useBuscarPorCliente,
} from '@/hooks/useTicketsOSApi';

interface SearchParams {
  ticketNestle: string;
  programador: string;
  cliente: string;
  osNumber: string;
  dateFrom: string;
  dateTo: string;
}

export function TicketBuscaComponente() {
  const [params, setParams] = useState<SearchParams>({
    ticketNestle: '',
    programador: '',
    cliente: '',
    osNumber: '',
    dateFrom: '',
    dateTo: '',
  });

  // Hook para busca geral com filtros
  const { data: consultaData, isLoading: loadingConsulta, error: errorConsulta } = useConsultarTicketsOS(
    {
      ticketNestle: params.ticketNestle || undefined,
      pageNumber: 1,
      pageSize: 50,
    },
    params.ticketNestle.length > 0
  );

  // Hook para busca por período
  const { data: periodoData, isLoading: loadingPeriodo, error: errorPeriodo } = useBuscarPorPeriodo(
    params.dateFrom || undefined,
    params.dateTo || undefined
  );

  // Hook para busca por programador
  const { data: programadorData, isLoading: loadingProgramador, error: errorProgramador } = useBuscarPorProgramador(
    params.programador
  );

  // Hook para busca por cliente
  const { data: clienteData, isLoading: loadingCliente, error: errorCliente } = useBuscarPorCliente(
    params.cliente
  );

  // Hook para busca por OS
  const { data: osData, isLoading: loadingOS, error: errorOS } = useBuscarPorOS(
    params.osNumber
  );

  const [correlacaoTrigger, setCorrelacaoTrigger] = useState(false);
  
  // Hook para correlação de ticket individual
  const { data: correlacaoData, isLoading: loadingCorrelacao, error: errorCorrelacao } = useCorrelacionarTicket(
    params.ticketNestle,
    correlacaoTrigger
  );

  const handleCorrelacionar = () => {
    if (params.ticketNestle.trim()) {
      setCorrelacaoTrigger(true);
    }
  };

  const renderResultados = (dados: any, isLoading: boolean, erro: any) => {
    if (isLoading) {
      return <p className="text-center text-muted-foreground py-4">Carregando...</p>;
    }

    if (erro) {
      return (
        <Alert variant="destructive">
          <AlertTitle>Erro na Busca</AlertTitle>
          <AlertDescription>{erro.message || 'Erro ao buscar dados'}</AlertDescription>
        </Alert>
      );
    }

    if (!dados || !Array.isArray(dados.data) || dados.data.length === 0) {
      return <p className="text-center text-muted-foreground py-4">Nenhum resultado encontrado</p>;
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              <th className="text-left p-2">Ticket</th>
              <th className="text-left p-2">OS</th>
              <th className="text-left p-2">Cliente</th>
              <th className="text-left p-2">Programador</th>
              <th className="text-left p-2">Bandeira</th>
              <th className="text-left p-2">Data Registro</th>
            </tr>
          </thead>
          <tbody>
            {dados.data.map((item: any, idx: number) => (
              <tr key={idx} className="border-b border-border hover:bg-accent/50">
                <td className="p-2 font-mono text-primary">{item.ticketNestle}</td>
                <td className="p-2 font-mono">{item.os || '-'}</td>
                <td className="p-2">{item.cliente || '-'}</td>
                <td className="p-2">{item.programador || '-'}</td>
                <td className="p-2">
                  <Badge variant="outline">{item.bandeira || 'N/A'}</Badge>
                </td>
                <td className="p-2 text-xs text-muted-foreground">
                  {item.dataRegistro ? new Date(item.dataRegistro).toLocaleDateString('pt-BR') : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {dados.totalPages && dados.totalPages > 1 && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Página {dados.currentPage} de {dados.totalPages}
          </p>
        )}
      </div>
    );
  };

  const renderCorrelacao = () => {
    if (loadingCorrelacao) {
      return <p className="text-center text-muted-foreground py-4">Correlacionando...</p>;
    }

    if (errorCorrelacao) {
      return (
        <Alert variant="destructive">
          <AlertTitle>Erro na Correlação</AlertTitle>
          <AlertDescription>{errorCorrelacao.message || 'Erro ao correlacionar'}</AlertDescription>
        </Alert>
      );
    }

    if (!correlacaoData) {
      return <p className="text-center text-muted-foreground py-4">Nenhuma correlação encontrada</p>;
    }

    return (
      <div className="space-y-4">
        <Alert className="bg-accent">
          <AlertTitle>OS Encontradas</AlertTitle>
          <AlertDescription>
            {correlacaoData.osEncontradas ? (
              <ul className="list-disc pl-5 mt-2">
                {correlacaoData.osEncontradas.map((os: string, idx: number) => (
                  <li key={idx} className="font-mono">
                    {os}
                  </li>
                ))}
              </ul>
            ) : (
              'Nenhuma OS encontrada para este ticket'
            )}
          </AlertDescription>
        </Alert>

        {correlacaoData.data && correlacaoData.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted">
                <tr>
                  <th className="text-left p-2">OS</th>
                  <th className="text-left p-2">Ticket</th>
                  <th className="text-left p-2">Cliente</th>
                  <th className="text-left p-2">Programador</th>
                  <th className="text-left p-2">Descrição</th>
                </tr>
              </thead>
              <tbody>
                {correlacaoData.data.map((item: any, idx: number) => (
                  <tr key={idx} className="border-b border-border">
                    <td className="p-2 font-mono font-bold">{item.os}</td>
                    <td className="p-2 font-mono text-primary">{item.ticketNestle}</td>
                    <td className="p-2">{item.cliente || '-'}</td>
                    <td className="p-2">{item.programador || '-'}</td>
                    <td className="p-2 text-xs text-muted-foreground max-w-xs truncate">{item.descricao || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Busca de Tickets e OS</CardTitle>
          <CardDescription>
            Integração com API REST (localhost:5000) - VDESKProxy
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="ticket" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="ticket">Por Ticket</TabsTrigger>
              <TabsTrigger value="periodo">Por Período</TabsTrigger>
              <TabsTrigger value="programador">Por Programador</TabsTrigger>
              <TabsTrigger value="cliente">Por Cliente</TabsTrigger>
              <TabsTrigger value="os">Por OS</TabsTrigger>
            </TabsList>

            {/* Busca por Ticket */}
            <TabsContent value="ticket" className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Digite o número do ticket (ex: 12345678)"
                  value={params.ticketNestle}
                  onChange={(e) => setParams({ ...params, ticketNestle: e.target.value })}
                  className="flex-1"
                />
              </div>

              {params.ticketNestle && (
                <Button onClick={handleCorrelacionar} variant="default" className="w-full">
                  🔗 Correlacionar Ticket
                </Button>
              )}

              {params.ticketNestle && (
                <div className="mt-4 border-t pt-4">
                  <h3 className="font-semibold mb-3">Correlação de OS:</h3>
                  {renderCorrelacao()}
                </div>
              )}

              {params.ticketNestle && (
                <div className="mt-4 border-t pt-4">
                  <h3 className="font-semibold mb-3">Registros Encontrados:</h3>
                  {renderResultados(consultaData, loadingConsulta, errorConsulta)}
                </div>
              )}
            </TabsContent>

            {/* Busca por Período */}
            <TabsContent value="periodo" className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={params.dateFrom}
                  onChange={(e) => setParams({ ...params, dateFrom: e.target.value })}
                  placeholder="Data Inicial"
                />
                <Input
                  type="date"
                  value={params.dateTo}
                  onChange={(e) => setParams({ ...params, dateTo: e.target.value })}
                  placeholder="Data Final"
                />
              </div>
              <div className="mt-4">
                <h3 className="font-semibold mb-3">Resultados:</h3>
                {renderResultados(periodoData, loadingPeriodo, errorPeriodo)}
              </div>
            </TabsContent>

            {/* Busca por Programador */}
            <TabsContent value="programador" className="space-y-4">
              <Input
                placeholder="Digite o nome do programador"
                value={params.programador}
                onChange={(e) => setParams({ ...params, programador: e.target.value })}
              />
              {params.programador && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-3">Resultados:</h3>
                  {renderResultados(programadorData, loadingProgramador, errorProgramador)}
                </div>
              )}
            </TabsContent>

            {/* Busca por Cliente */}
            <TabsContent value="cliente" className="space-y-4">
              <Input
                placeholder="Digite o nome do cliente"
                value={params.cliente}
                onChange={(e) => setParams({ ...params, cliente: e.target.value })}
              />
              {params.cliente && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-3">Resultados:</h3>
                  {renderResultados(clienteData, loadingCliente, errorCliente)}
                </div>
              )}
            </TabsContent>

            {/* Busca por OS */}
            <TabsContent value="os" className="space-y-4">
              <Input
                placeholder="Digite o número da OS"
                value={params.osNumber}
                onChange={(e) => setParams({ ...params, osNumber: e.target.value })}
              />
              {params.osNumber && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-3">Resultados:</h3>
                  {renderResultados(osData, loadingOS, errorOS)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Alert className="bg-accent">
        <AlertTitle>ℹ️ Integração em Produção</AlertTitle>
        <AlertDescription className="space-y-2 text-sm">
          <p>
            Este componente demonstra o uso dos novos hooks de integração com API REST.
          </p>
          <p>
            <strong>Arquitetura:</strong> Frontend (React) → API REST (VDESKProxy @localhost:5000) → SQL Server VDESK
          </p>
          <p>
            <strong>Autenticação:</strong> JWT Bearer token (Supabase Auth)
          </p>
          <p>
            <strong>Serviços:</strong>
            <br />
            • <code className="text-xs bg-muted px-1 rounded">src/services/ticketsOSApi.ts</code> - Camada de API
            <br />
            • <code className="text-xs bg-muted px-1 rounded">src/hooks/useTicketsOSApi.ts</code> - Hooks React Query
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}

export default TicketBuscaComponente;
