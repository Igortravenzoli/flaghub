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
  const accentColor = openEvents > 0 ? 'bg-destructive' : 'bg-muted-foreground';

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

  return (
    <Card 
      className="relative overflow-hidden group cursor-pointer transition-all duration-300 hover:shadow-md animate-fade-in"
      style={{ animationDelay: '540ms' }}
      onClick={onClick}
    >
      <div className={`absolute top-0 left-0 w-1 h-full ${accentColor}`} />
      <div className="p-5 pl-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl ${accentColor}/10`}>
              <AlertTriangle className={`h-4 w-4 ${accentColor.replace('bg-', 'text-')}`} />
            </div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Retorno QA</p>
          </div>
          {openEvents > 0 && (
            <Badge variant="destructive" className="text-xs animate-pulse">
              {openEvents} abertos
            </Badge>
          )}
        </div>

        {/* 4-Metric Grid */}
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1">Total</p>
            <p className="text-2xl font-bold text-foreground">{totalEvents}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1">Abertos</p>
            <p className={`text-2xl font-bold ${openEvents > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {openEvents}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1">Média (dias)</p>
            <p className="text-2xl font-bold text-foreground">
              {avgDaysOpen != null ? avgDaysOpen.toFixed(1) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1">Máximo (dias)</p>
            <p className={`text-2xl font-bold ${maxDaysOpen != null && maxDaysOpen > 14 ? 'text-destructive' : 'text-foreground'}`}>
              {maxDaysOpen != null ? maxDaysOpen : '—'}
            </p>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground/70 text-center">Clique para detalhes</p>
      </div>
    </Card>
  );
}
