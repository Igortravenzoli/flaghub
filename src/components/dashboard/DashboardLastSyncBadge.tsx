import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DashboardLastSyncBadgeProps {
  syncedAt?: string | null;
  status?: 'ok' | 'error' | 'running' | null;
}

export function DashboardLastSyncBadge({ syncedAt, status }: DashboardLastSyncBadgeProps) {
  if (!syncedAt) {
    return (
      <Badge variant="outline" className="gap-1 text-xs font-normal text-muted-foreground">
        <Clock className="h-3 w-3" />
        Ainda não sincronizado
      </Badge>
    );
  }

  const relative = formatDistanceToNow(new Date(syncedAt), { addSuffix: true, locale: ptBR });

  const icon = status === 'error'
    ? <AlertCircle className="h-3 w-3 text-destructive" />
    : status === 'running'
    ? <Clock className="h-3 w-3 animate-spin" />
    : <CheckCircle className="h-3 w-3 text-[hsl(142,71%,45%)]" />;

  return (
    <Badge variant="outline" className="gap-1 text-xs font-normal text-muted-foreground">
      {icon}
      {relative}
    </Badge>
  );
}
