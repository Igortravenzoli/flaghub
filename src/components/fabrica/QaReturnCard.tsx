import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface QaReturnCardProps {
  totalEvents: number;
  openEvents: number;
  avgDaysOpen: number | null;
  maxDaysOpen: number | null;
  isLoading: boolean;
  onClick: () => void;
}

export function QaReturnCard({
  totalEvents,
  openEvents,
  avgDaysOpen,
  maxDaysOpen,
  isLoading,
  onClick,
}: QaReturnCardProps) {
  if (isLoading) {
    return (
      <Card className="relative overflow-hidden">
        <div className="p-5">
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-9 w-16 mb-1" />
          <Skeleton className="h-3 w-40" />
        </div>
      </Card>
    );
  }

  const iconColor = openEvents > 0 ? 'text-destructive' : 'text-muted-foreground';
  const iconBg = openEvents > 0 ? 'bg-destructive/10' : 'bg-muted';

  return (
    <Card
      className="p-5 cursor-pointer hover:bg-muted/20 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${iconBg}`}>
            <AlertTriangle className={`h-3.5 w-3.5 ${iconColor}`} />
          </div>
          <p className="text-xs font-medium text-muted-foreground">Retorno QA</p>
        </div>
        {openEvents > 0 && (
          <Badge variant="destructive" className="text-xs">
            {openEvents} abertos
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <p className="text-[11px] text-muted-foreground/70 mb-0.5">Total</p>
          <p className="text-xl font-semibold text-foreground">{totalEvents}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground/70 mb-0.5">Abertos</p>
          <p className={`text-xl font-semibold ${openEvents > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
            {openEvents}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground/70 mb-0.5">Média (dias)</p>
          <p className="text-xl font-semibold text-foreground">
            {avgDaysOpen != null ? avgDaysOpen.toFixed(1) : '—'}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground/70 mb-0.5">Máximo (dias)</p>
          <p className={`text-xl font-semibold ${maxDaysOpen != null && maxDaysOpen > 14 ? 'text-destructive' : 'text-foreground'}`}>
            {maxDaysOpen != null ? maxDaysOpen : '—'}
          </p>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/50 mt-3 text-right">Clique para detalhes →</p>
    </Card>
  );
}
