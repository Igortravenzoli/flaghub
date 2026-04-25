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
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
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

  const totalTickets = metrics?.totalTickets || 0;
  const correlationRate = metrics?.correlationRate || 0;
  const ticketsWithOS = metrics?.ticketsWithOS || 0;
  const osFoundInVDESK = metrics?.osFoundInVDESK || 0;
  const osNotFoundInVDESK = metrics?.osNotFoundInVDESK || 0;
  const pendingValidation = ticketsNeedingCorrelation?.length || 0;

  return (
    <div className="space-y-6 p-6">
      {/* Header — sector dashboard pattern */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Link2 className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Correlação Ticket × OS</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-9">
            Correlação entre Tickets ServiceNow e Ordens de Serviço VDESK
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={metricsLoading}
          >
            <RefreshCw className={cn("h-4 w-4 mr-1", metricsLoading && "animate-spin")} />
            Atualizar
          </Button>
          {pendingValidation > 0 && (
            <Button
              size="sm"
              onClick={correlateAllPending}
              disabled={isCorrelating}
            >
              <Play className={cn("h-4 w-4 mr-1", isCorrelating && "animate-pulse")} />
              Correlacionar ({pendingValidation})
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <DashboardKpiCard
          label="Taxa de Correlação"
          value={`${correlationRate.toFixed(1)}%`}
          icon={TrendingUp}
        />
        <DashboardKpiCard
          label="OS Validadas"
          value={osFoundInVDESK}
          icon={CheckCircle2}
          accent="bg-[hsl(142,71%,45%)]"
        />
        <DashboardKpiCard
          label="OS Não Encontradas"
          value={osNotFoundInVDESK}
          icon={XCircle}
          accent="bg-destructive"
        />
        <DashboardKpiCard
          label="Pendentes"
          value={pendingValidation}
          icon={AlertTriangle}
          accent="bg-[hsl(43,85%,46%)]"
        />
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
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Link2 className="h-4 w-4 text-primary" />
                  Tickets com OS
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total com OS</span>
                  <span className="font-bold">{ticketsWithOS}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[hsl(142,71%,45%)] flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Validadas no VDESK
                  </span>
                  <span className="font-bold text-[hsl(142,71%,45%)]">{osFoundInVDESK}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-destructive flex items-center gap-1">
                    <XCircle className="h-3.5 w-3.5" />
                    Não Encontradas
                  </span>
                  <span className="font-bold text-destructive">{osNotFoundInVDESK}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[hsl(43,85%,46%)] flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Aguardando Validação
                  </span>
                  <span className="font-bold text-[hsl(43,85%,46%)]">{pendingValidation}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Unlink className="h-4 w-4 text-primary" />
                  Tickets sem OS
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total sem OS</span>
                  <span className="font-bold">{metrics?.ticketsWithoutOS || 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-destructive">Críticos</span>
                  <span className="font-bold text-destructive">{metrics?.criticalIssues || 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[hsl(43,85%,46%)]">Atenção</span>
                  <span className="font-bold text-[hsl(43,85%,46%)]">{metrics?.warningIssues || 0}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Como funciona a correlação?</AlertTitle>
            <AlertDescription className="mt-2 space-y-2">
              <p className="text-sm">
                O sistema correlaciona tickets do ServiceNow com OS do VDESK usando autenticação service-token segura.
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                <li>Tickets com OS são validados automaticamente no VDESK</li>
                <li>OS não encontradas são marcadas como críticas</li>
                <li>Tickets sem OS há mais de 24h são marcados como críticos</li>
              </ul>
            </AlertDescription>
          </Alert>
        </TabsContent>

        {/* Tab: Pendentes */}
        <TabsContent value="pending">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Tickets Aguardando Validação</CardTitle>
              <CardDescription className="text-xs">
                Tickets com OS informada que ainda não foram validados no VDESK
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ticketsNeedingCorrelationLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : ticketsNeedingCorrelation && ticketsNeedingCorrelation.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Ticket</TableHead>
                      <TableHead className="text-xs">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ticketsNeedingCorrelation.slice(0, 20).map((ticketId) => (
                      <TableRow key={ticketId}>
                        <TableCell className="font-mono text-sm">{ticketId}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => correlateTicket(ticketId)}
                              disabled={isCorrelatingTicket}
                              className="h-7 text-xs"
                            >
                              <Link2 className="h-3 w-3 mr-1" />
                              Validar
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => markOSNotFound(ticketId)}
                              className="h-7 text-xs"
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              Não Encontrada
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-[hsl(142,71%,45%)]" />
                  <p className="text-sm">Nenhum ticket pendente de validação</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Inconsistências */}
        <TabsContent value="inconsistencies">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileWarning className="h-4 w-4 text-primary" />
                Relatório de Inconsistências
              </CardTitle>
              <CardDescription className="text-xs">
                Tickets com problemas identificados na correlação
              </CardDescription>
            </CardHeader>
            <CardContent>
              {inconsistencyReportLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : inconsistencyReport && inconsistencyReport.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Ticket</TableHead>
                      <TableHead className="text-xs">Inconsistência</TableHead>
                      <TableHead className="text-xs">OS</TableHead>
                      <TableHead className="text-xs">Severidade</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inconsistencyReport.map((item) => (
                      <TableRow key={item.ticketId}>
                        <TableCell className="font-mono text-sm">{item.ticketId}</TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            {item.inconsistencyCode}
                          </code>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {item.osNumber || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.severity === 'critico' ? 'destructive' :
                              item.severity === 'atencao' ? 'default' : 'secondary'
                            }
                            className="text-xs"
                          >
                            {item.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {item.internalStatus || 'N/A'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-[hsl(142,71%,45%)]" />
                  <p className="text-sm">Nenhuma inconsistência encontrada</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
