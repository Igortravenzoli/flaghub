import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TicketsTable } from '@/components/dashboard/TicketsTable';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertTriangle, ShieldAlert, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CriticalAlertsProps {
  tickets: any[];
}

export function CriticalAlerts({ tickets }: CriticalAlertsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (tickets.length === 0) return null;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card className={cn(
        "relative overflow-hidden",
        "bg-gradient-to-br from-[hsl(var(--critical))]/10 via-card to-card",
        "border-[hsl(var(--critical))]/30"
      )}>
        <CollapsibleTrigger asChild>
          <CardHeader className="relative cursor-pointer hover:bg-muted/30 transition-colors py-3">
            <CardTitle className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-[hsl(var(--critical))]/30 rounded-lg blur-md animate-pulse" />
                <div className="relative p-1.5 rounded-lg bg-[hsl(var(--critical))]/20">
                  <ShieldAlert className="h-4 w-4 text-[hsl(var(--critical))]" />
                </div>
              </div>

              <span className="text-sm font-semibold text-[hsl(var(--critical))] flex-1">
                Alertas Críticos
              </span>

              <div className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full",
                "bg-[hsl(var(--critical))]/20 border border-[hsl(var(--critical))]/30"
              )}>
                <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--critical))]" />
                <span className="text-xs font-bold text-[hsl(var(--critical))]">
                  {tickets.length}
                </span>
              </div>

              <ChevronDown className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                isExpanded && "rotate-180"
              )} />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="relative pt-0">
            <TicketsTable tickets={tickets} compact />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
