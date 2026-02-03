import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Phone, Users } from 'lucide-react';
import { AgentTelephony } from '@/data/mockAttendanceData';
import { AgentStateBadge, DirectionIcon } from './AgentStateBadge';
import { useAttendanceTimer } from '@/hooks/useAttendanceTimer';

interface AgentsTableProps {
  agents: AgentTelephony[];
  isLoading?: boolean;
  isAvailable?: boolean;
}

export function AgentsTable({ agents, isLoading, isAvailable = true }: AgentsTableProps) {
  const { formatDuration, getElapsedSeconds } = useAttendanceTimer();

  if (!isAvailable) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Phone className="h-5 w-5 text-muted-foreground" />
            Agentes (Telefonia)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-sm font-medium">Sem integração de telefonia</p>
            <p className="text-xs">Os dados de telefonia não estão disponíveis no momento</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Phone className="h-5 w-5" />
            Agentes (Telefonia)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Phone className="h-5 w-5 text-primary" />
          Agentes (Telefonia)
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            {agents.length} agentes
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Agente</TableHead>
                <TableHead className="font-semibold">Ramal</TableHead>
                <TableHead className="font-semibold text-center">Direção</TableHead>
                <TableHead className="font-semibold">Estado</TableHead>
                <TableHead className="font-semibold">Fila</TableHead>
                <TableHead className="font-semibold text-center">Logado</TableHead>
                <TableHead className="font-semibold text-center">Atend./Perdidas/Ativas</TableHead>
                <TableHead className="font-semibold text-center">Tempo Chamada</TableHead>
                <TableHead className="font-semibold text-center">TMA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => (
                <TableRow key={agent.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium">{agent.agentName}</TableCell>
                  <TableCell className="font-mono text-sm">{agent.extension}</TableCell>
                  <TableCell className="text-center">
                    <DirectionIcon direction={agent.direction} />
                  </TableCell>
                  <TableCell>
                    <AgentStateBadge 
                      state={agent.state} 
                      timer={formatDuration(getElapsedSeconds(agent.stateStartTime))}
                    />
                  </TableCell>
                  <TableCell className="text-sm">{agent.queue}</TableCell>
                  <TableCell className="text-center font-mono text-sm">
                    {formatDuration(agent.loggedTime)}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-green-600 dark:text-green-400 font-medium">{agent.answeredCalls}</span>
                    {' / '}
                    <span className="text-red-600 dark:text-red-400 font-medium">{agent.missedCalls}</span>
                    {' / '}
                    <span className="text-blue-600 dark:text-blue-400 font-medium">{agent.outboundCalls}</span>
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm">
                    {formatDuration(agent.talkTime)}
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm">
                    {formatDuration(agent.avgTalkTime)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
