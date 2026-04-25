import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Clock, Users, AlertTriangle } from 'lucide-react';
import { QueueTelephony } from '@/data/mockAttendanceData';
import { useAttendanceTimer } from '@/hooks/useAttendanceTimer';
import { cn } from '@/lib/utils';

interface QueueTableProps {
  queue: QueueTelephony[];
  isLoading?: boolean;
  isAvailable?: boolean;
}

const priorityConfig = {
  alta: { label: 'Alta', className: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/50' },
  media: { label: 'Média', className: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 border-yellow-500/50' },
  baixa: { label: 'Baixa', className: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/50' },
};

export function QueueTable({ queue, isLoading, isAvailable = true }: QueueTableProps) {
  const { formatDuration, getElapsedSeconds } = useAttendanceTimer();

  if (!isAvailable) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Fila / Clientes em Espera (Telefonia)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-sm font-medium">Fila indisponível</p>
            <p className="text-xs">Sem integração VoIP ativa</p>
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
            <Clock className="h-5 w-5" />
            Fila / Clientes em Espera (Telefonia)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (queue.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-primary" />
            Fila / Clientes em Espera (Telefonia)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-sm font-medium">Nenhum cliente em espera</p>
            <p className="text-xs">A fila está vazia no momento</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-5 w-5 text-primary" />
          Fila / Clientes em Espera (Telefonia)
          <Badge variant="secondary" className="ml-auto">
            {queue.length} em espera
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Fila</TableHead>
                <TableHead className="font-semibold text-center">Tempo em Fila</TableHead>
                <TableHead className="font-semibold">Telefone</TableHead>
                <TableHead className="font-semibold">Origem</TableHead>
                <TableHead className="font-semibold text-center">Prioridade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((item) => {
                const waitSeconds = getElapsedSeconds(item.entryTime);
                const isLongWait = waitSeconds > 120;
                
                return (
                  <TableRow key={item.id} className={cn("hover:bg-muted/30", isLongWait && "bg-red-500/5")}>
                    <TableCell className="font-medium">{item.queueName}</TableCell>
                    <TableCell className="text-center">
                      <span className={cn(
                        "font-mono text-sm font-medium",
                        isLongWait ? "text-red-600 dark:text-red-400" : "text-foreground"
                      )}>
                        {formatDuration(waitSeconds)}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{item.phone}</TableCell>
                    <TableCell className="text-sm">{item.origin}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={priorityConfig[item.priority].className}>
                        {priorityConfig[item.priority].label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
