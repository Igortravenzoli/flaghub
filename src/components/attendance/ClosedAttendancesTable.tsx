import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, History } from 'lucide-react';
import { ClosedAttendanceVdesk } from '@/data/mockAttendanceData';
import { useAttendanceTimer } from '@/hooks/useAttendanceTimer';

interface ClosedAttendancesTableProps {
  attendances: ClosedAttendanceVdesk[];
  isLoading?: boolean;
}

const statusFinalConfig: Record<string, string> = {
  'Resolvido': 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/50',
  'Encaminhado': 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/50',
  'Pendente Cliente': 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 border-yellow-500/50',
  'Cancelado': 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/50',
};

export function ClosedAttendancesTable({ attendances, isLoading }: ClosedAttendancesTableProps) {
  const { formatDuration, formatTime } = useAttendanceTimer();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle className="h-5 w-5" />
            Atendimentos Encerrados (Vdesk)
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

  if (attendances.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle className="h-5 w-5 text-primary" />
            Atendimentos Encerrados (Vdesk)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <History className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-sm font-medium">Nenhum atendimento encerrado recentemente</p>
            <p className="text-xs">O histórico aparecerá aqui</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CheckCircle className="h-5 w-5 text-primary" />
          Atendimentos Encerrados (Vdesk)
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            Últimos {attendances.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Consultor</TableHead>
                <TableHead className="font-semibold">OS</TableHead>
                <TableHead className="font-semibold">Cliente</TableHead>
                <TableHead className="font-semibold">Sistema</TableHead>
                <TableHead className="font-semibold text-center">Tempo Total</TableHead>
                <TableHead className="font-semibold text-center">Início / Fim</TableHead>
                <TableHead className="font-semibold text-center">Status Final</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendances.map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium">{item.consultor}</TableCell>
                  <TableCell className="font-mono text-sm">{item.os}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={item.cliente}>
                    {item.cliente}
                  </TableCell>
                  <TableCell className="text-sm">{item.sistema}</TableCell>
                  <TableCell className="text-center font-mono text-sm">
                    {formatDuration(item.tempoTotal)}
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {formatTime(item.inicioAtendimento)} - {formatTime(item.fimAtendimento)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className={statusFinalConfig[item.statusFinal]}>
                      {item.statusFinal}
                    </Badge>
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
