import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TicketsTable } from '@/components/dashboard/TicketsTable';
import { AlertTriangle, ShieldAlert, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CriticalAlertsProps {
  tickets: any[];
}

export function CriticalAlerts({ tickets }: CriticalAlertsProps) {
  if (tickets.length === 0) return null;

  return (
    <Card className={cn(
      "relative overflow-hidden",
      "bg-gradient-to-br from-[hsl(var(--critical))]/10 via-card to-card",
      "border-[hsl(var(--critical))]/30"
    )}>
      {/* Pulsing glow effect */}
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-[hsl(var(--critical))]/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-[hsl(var(--critical))]/10 rounded-full blur-2xl" />

      <CardHeader className="relative pb-2">
        <CardTitle className="flex items-center gap-3">
          {/* Animated alert icon */}
          <div className="relative">
            <div className="absolute inset-0 bg-[hsl(var(--critical))]/30 rounded-lg blur-md animate-pulse" />
            <div className="relative p-2 rounded-lg bg-[hsl(var(--critical))]/20">
              <ShieldAlert className="h-5 w-5 text-[hsl(var(--critical))]" />
            </div>
          </div>
          
          <div className="flex-1">
            <span className="text-lg font-semibold text-[hsl(var(--critical))]">
              Alertas Críticos
            </span>
            <p className="text-xs text-muted-foreground font-normal mt-0.5">
              Tickets sem OS vinculada
            </p>
          </div>

          {/* Counter badge */}
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full",
            "bg-[hsl(var(--critical))]/20 border border-[hsl(var(--critical))]/30"
          )}>
            <AlertTriangle className="h-4 w-4 text-[hsl(var(--critical))]" />
            <span className="text-sm font-bold text-[hsl(var(--critical))]">
              {tickets.length}
            </span>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="relative">
        {/* Time indicator */}
        <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Tickets aguardando vinculação de OS há mais de 4 horas</span>
        </div>

        <TicketsTable tickets={tickets.slice(0, 5)} compact />

        {tickets.length > 5 && (
          <div className="mt-4 pt-4 border-t border-border/50 text-center">
            <span className="text-sm text-muted-foreground">
              +{tickets.length - 5} tickets adicionais
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
