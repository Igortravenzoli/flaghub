import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { SeverityBadge, SeverityDot } from '@/components/ui/severity-badge';
import { TicketConsolidado } from '@/types';
import { Button } from '@/components/ui/button';
import { Eye, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface TicketsTableProps {
  tickets: TicketConsolidado[];
  compact?: boolean;
  onViewDetails?: (ticket: TicketConsolidado) => void;
}

const statusLabels: Record<string, string> = {
  novo: 'Novo',
  em_andamento: 'Em Andamento',
  aguardando: 'Aguardando',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
  nao_mapeado: 'Não Mapeado'
};

export function TicketsTable({ tickets, compact = false, onViewDetails }: TicketsTableProps) {
  if (tickets.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nenhum ticket encontrado
      </div>
    );
  }
  
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40px]"></TableHead>
          <TableHead>Ticket</TableHead>
          <TableHead>Descrição</TableHead>
          {!compact && <TableHead>Status</TableHead>}
          <TableHead>Severidade</TableHead>
          <TableHead>OS</TableHead>
          {!compact && <TableHead>Responsável</TableHead>}
          <TableHead>Data</TableHead>
          {onViewDetails && <TableHead className="w-[60px]"></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {tickets.map((tc) => (
          <TableRow key={tc.ticket.number}>
            <TableCell>
              <SeverityDot severity={tc.severidade} />
            </TableCell>
            <TableCell className="font-mono text-sm">
              <div className="flex items-center gap-2">
                {tc.ticket.number}
                {tc.ticket.type === 'request' && (
                  <Badge variant="outline" className="text-[10px]">REQ</Badge>
                )}
              </div>
            </TableCell>
            <TableCell className="max-w-[200px]">
              <span className="truncate block">
                {tc.ticket.short_description || (
                  <span className="text-muted-foreground italic">Sem descrição</span>
                )}
              </span>
            </TableCell>
            {!compact && (
              <TableCell>
                <Badge variant="secondary" className="text-xs">
                  {statusLabels[tc.statusNormalizado]}
                </Badge>
              </TableCell>
            )}
            <TableCell>
              <SeverityBadge severity={tc.severidade} size="sm" />
            </TableCell>
            <TableCell className="font-mono text-sm">
              {tc.osVinculada ? (
                <span className="text-[hsl(var(--success))]">{tc.osVinculada.os}</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[hsl(var(--critical))]">
                  <AlertTriangle className="h-3 w-3" />
                  {tc.horasSemOS !== null && `${tc.horasSemOS}h`}
                </span>
              )}
            </TableCell>
            {!compact && (
              <TableCell className="max-w-[150px]">
                <span className="truncate block text-sm">
                  {tc.ticket.assigned_to?.split(' (')[0] || (
                    <span className="text-muted-foreground">-</span>
                  )}
                </span>
              </TableCell>
            )}
            <TableCell className="text-sm text-muted-foreground">
              {tc.ticket.opened_at.split(' ')[0]}
            </TableCell>
            {onViewDetails && (
              <TableCell>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => onViewDetails(tc)}
                  className="h-8 w-8"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
