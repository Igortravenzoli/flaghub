import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Headphones, MessageSquare, Mail, Phone, Monitor, User } from 'lucide-react';
import { MergedAttendance, ActiveAttendanceVdesk } from '@/data/mockAttendanceData';
import { TelephonyMatchBadge } from './TelephonyMatchBadge';
import { useAttendanceTimer } from '@/hooks/useAttendanceTimer';
import { cn } from '@/lib/utils';

interface ActiveAttendancesTableProps {
  attendances: MergedAttendance[] | ActiveAttendanceVdesk[];
  isLoading?: boolean;
  mode: 'vdesk' | 'telephony' | 'merged';
}

const meioContatoIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'Telefone': Phone,
  'WhatsApp': MessageSquare,
  'Email': Mail,
  'Chat': MessageSquare,
  'Presencial': User,
};

const statusConfig: Record<string, string> = {
  'Em Atendimento': 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/50',
  'Aguardando Retorno': 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 border-yellow-500/50',
  'Em Análise': 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/50',
  'Em Chamada (Telefonia)': 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/50',
};

export function ActiveAttendancesTable({ attendances, isLoading, mode }: ActiveAttendancesTableProps) {
  const { formatDuration, getElapsedSeconds } = useAttendanceTimer();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Headphones className="h-5 w-5" />
            Atendimentos em Andamento (Unificado)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
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
            <Headphones className="h-5 w-5 text-primary" />
            Atendimentos em Andamento (Unificado)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Monitor className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-sm font-medium">Nenhum atendimento em andamento</p>
            <p className="text-xs">Os atendimentos aparecerão aqui quando iniciados</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Type guard to check if it's MergedAttendance
  const isMergedAttendance = (item: any): item is MergedAttendance => {
    return 'hasTelephonyMatch' in item;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Headphones className="h-5 w-5 text-primary" />
          Atendimentos em Andamento (Unificado)
          <Badge variant="secondary" className="ml-auto">
            {attendances.length} ativos
          </Badge>
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
                <TableHead className="font-semibold">Contato</TableHead>
                <TableHead className="font-semibold text-center">Meio</TableHead>
                <TableHead className="font-semibold">Sistema</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold text-center">Tempo</TableHead>
                {mode === 'merged' && (
                  <TableHead className="font-semibold text-center">Telefonia</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendances.map((item) => {
                const merged = isMergedAttendance(item) ? item : null;
                const vdesk = !merged ? item as ActiveAttendanceVdesk : null;
                
                const consultor = merged?.consultor || vdesk?.consultor || '-';
                const os = merged?.os || vdesk?.os || '-';
                const cliente = merged?.cliente || vdesk?.cliente || '-';
                const contato = merged?.contato || vdesk?.contato || '-';
                const meioContato = merged?.meioContato || vdesk?.meioContato || '-';
                const sistema = merged?.sistema || vdesk?.sistema || '-';
                const status = merged?.status || vdesk?.status || '-';
                const inicioAtendimento = merged?.inicioAtendimento || vdesk?.inicioAtendimento || new Date();
                
                const MeioIcon = meioContatoIcons[meioContato] || MessageSquare;
                const elapsedSeconds = getElapsedSeconds(inicioAtendimento);
                const isLongAttendance = elapsedSeconds > 600; // 10 min

                return (
                  <TableRow 
                    key={merged?.id || vdesk?.id} 
                    className={cn("hover:bg-muted/30", isLongAttendance && "bg-yellow-500/5")}
                  >
                    <TableCell className="font-medium">{consultor}</TableCell>
                    <TableCell className="font-mono text-sm">{os}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={cliente}>
                      {cliente}
                    </TableCell>
                    <TableCell className="text-sm">{contato}</TableCell>
                    <TableCell className="text-center">
                      <MeioIcon className="h-4 w-4 mx-auto text-muted-foreground" />
                    </TableCell>
                    <TableCell className="text-sm">{sistema}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusConfig[status] || ''}>
                        {status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn(
                        "font-mono text-sm font-medium tabular-nums",
                        isLongAttendance ? "text-yellow-600 dark:text-yellow-400" : "text-foreground"
                      )}>
                        {formatDuration(elapsedSeconds)}
                      </span>
                    </TableCell>
                    {mode === 'merged' && merged && (
                      <TableCell className="text-center">
                        <TelephonyMatchBadge 
                          state={merged.telephonyState} 
                          hasMatch={merged.hasTelephonyMatch} 
                        />
                      </TableCell>
                    )}
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
