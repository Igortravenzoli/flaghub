import { useState } from 'react';
import { useTicketOSCorrelation } from '@/hooks/useTicketOSCorrelation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  TrendingUp,
  Link2,
  Unlink,
  Info,
  Play,
  FileWarning
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Correlacao() {
  const {
    metrics,
    metricsLoading,
    ticketsNeedingCorrelation,
    ticketsNeedingCorrelationLoading,
    inconsistencyReport,
    inconsistencyReportLoading,
    isCorrelating,
    correlateAllPending,
    correlateTicket,
    markOSNotFound,
    refreshAll,
    isCorrelatingTicket,
  } = useTicketOSCorrelation();

  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);

  // Estatísticas gerais
  const totalTickets = metrics?.totalTickets || 0;
  const correlationRate = metrics?.correlationRate || 0;
  const ticketsWithOS = metrics?.ticketsWithOS || 0;
  const osFoundInVDESK = metrics?.osFoundInVDESK || 0;
  const osNotFoundInVDESK = metrics?.osNotFoundInVDESK || 0;
  const pendingValidation = ticketsNeedingCorrelation?.length || 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Análise de Correlação</h1>
          <p className="text-muted-foreground mt-1">
            Correlação entre Tickets ServiceNow e Ordens de Serviço VDESK
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={refreshAll}
            disabled={metricsLoading}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", metricsLoading && "animate-spin")} />
            Atualizar
          </Button>
          {pendingValidation > 0 && (
            <Button
              onClick={correlateAllPending}
              disabled={isCorrelating}
            >
              <Play className={cn("h-4 w-4 mr-2", isCorrelating && "animate-pulse")} />
              Correlacionar Pendentes ({pendingValidation})
            </Button>
          )}
        </div>
      </div>

      {/* Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Taxa de Correlação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-primary" />
              <div className="flex-1">
                <div className="text-3xl font-bold">{correlationRate.toFixed(1)}%</div>
                <Progress value={correlationRate} className="mt-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              OS Validadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <div>
                <div className="text-3xl font-bold">{osFoundInVDESK}</div>
                <div className="text-sm text-muted-foreground">
                  de {ticketsWithOS} com OS
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              OS Não Encontradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-500" />
              <div>
                <div className="text-3xl font-bold">{osNotFoundInVDESK}</div>
                <div className="text-sm text-muted-foreground">
                  não localizadas no VDESK
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pendentes Validação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
              <div>
                <div className="text-3xl font-bold">{pendingValidation}</div>
                <div className="text-sm text-muted-foreground">
                  aguardando validação
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alert de Status */}
      {isCorrelating && (
        <Alert>
          <RefreshCw className="h-4 w-4 animate-spin" />
          <AlertTitle>Correlação em Andamento</AlertTitle>
          <AlertDescription>
            Processando {pendingValidation} ticket(s). Aguarde...
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs de Análise */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="pending">
            Pendentes ({pendingValidation})
          </TabsTrigger>
          <TabsTrigger value="inconsistencies">
            Inconsistências ({inconsistencyReport?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* Tab: Visão Geral */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="h-5 w-5" />
                  Tickets com OS
                </CardTitle>
                <CardDescription>
                  Distribuição de tickets que possuem OS informada
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total com OS</span>
                  <span className="font-bold">{ticketsWithOS}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" />
                    Validadas no VDESK
                  </span>
                  <span className="font-bold text-green-600">{osFoundInVDESK}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-red-600 flex items-center gap-1">
                    <XCircle className="h-4 w-4" />
                    Não Encontradas
                  </span>
                  <span className="font-bold text-red-600">{osNotFoundInVDESK}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-yellow-600 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" />
                    Aguardando Validação
                  </span>
                  <span className="font-bold text-yellow-600">{pendingValidation}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Unlink className="h-5 w-5" />
                  Tickets sem OS
                </CardTitle>
                <CardDescription>
                  Tickets que ainda não possuem OS vinculada
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total sem OS</span>
                  <span className="font-bold">{metrics?.ticketsWithoutOS || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-red-600">Críticos</span>
                  <span className="font-bold text-red-600">{metrics?.criticalIssues || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-yellow-600">Atenção</span>
                  <span className="font-bold text-yellow-600">{metrics?.warningIssues || 0}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Instruções */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Como funciona a correlação?</AlertTitle>
            <AlertDescription className="mt-2 space-y-2">
              <p>
                O sistema correlaciona automaticamente tickets do ServiceNow com ordens de serviço (OS) do VDESK usando o número da OS informado no ticket.
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Tickets com OS são validados automaticamente no VDESK</li>
                <li>OS não encontradas são marcadas como críticas</li>
                <li>Tickets sem OS há mais de 24h são marcados como críticos</li>
                <li>Use o botão "Correlacionar Pendentes" para processar validações pendentes</li>
              </ul>
            </AlertDescription>
          </Alert>
        </TabsContent>

        {/* Tab: Pendentes de Validação */}
        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Tickets Aguardando Validação</CardTitle>
              <CardDescription>
                Tickets com OS informada que ainda não foram validados no VDESK
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ticketsNeedingCorrelationLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : ticketsNeedingCorrelation && ticketsNeedingCorrelation.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ticket</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ticketsNeedingCorrelation.slice(0, 20).map((ticketId) => (
                      <TableRow key={ticketId}>
                        <TableCell className="font-mono">{ticketId}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => correlateTicket(ticketId)}
                              disabled={isCorrelatingTicket}
                            >
                              <Link2 className="h-3 w-3 mr-1" />
                              Validar
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => markOSNotFound(ticketId)}
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              Marcar Não Encontrada
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
                  <p>Nenhum ticket pendente de validação!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Inconsistências */}
        <TabsContent value="inconsistencies">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileWarning className="h-5 w-5" />
                Relatório de Inconsistências
              </CardTitle>
              <CardDescription>
                Tickets com problemas identificados na correlação
              </CardDescription>
            </CardHeader>
            <CardContent>
              {inconsistencyReportLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : inconsistencyReport && inconsistencyReport.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ticket</TableHead>
                      <TableHead>Inconsistência</TableHead>
                      <TableHead>OS</TableHead>
                      <TableHead>Severidade</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inconsistencyReport.map((item) => (
                      <TableRow key={item.ticketId}>
                        <TableCell className="font-mono">{item.ticketId}</TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {item.inconsistencyCode}
                          </code>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {item.osNumber || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.severity === 'critico' ? 'destructive' :
                              item.severity === 'atencao' ? 'default' : 'secondary'
                            }
                          >
                            {item.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {item.internalStatus || 'N/A'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
                  <p>Nenhuma inconsistência encontrada!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
