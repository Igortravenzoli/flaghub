import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Timer } from 'lucide-react';
import { CHART_COLORS } from '@/lib/chartColors';
import type { TimelogAggregation } from '@/hooks/useFabricaKpis';

// Ranking de horas apontadas (TimeLog) — extraído do FabricaDashboard para
// reuso entre setores (Fábrica e Infraestrutura).
export function HoursRankingCard({ title, icon: Icon, data, isLoading, emptyMessage, delay = 0, onItemClick, activeItemName, summaryBadge }: {
  title: string; icon: React.ComponentType<{ className?: string }>;
  data: TimelogAggregation[]; isLoading: boolean; emptyMessage: string; delay?: number;
  onItemClick?: (item: TimelogAggregation) => void;
  activeItemName?: string | null;
  summaryBadge?: string;
}) {
  const maxHours = data.length > 0 ? data[0].hours : 1;

  if (isLoading) {
    return (
      <Card className="animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
        <CardHeader className="pb-3"><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />{title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Timer className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Dados disponíveis após sincronização do TimeLog</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />{title}
          </CardTitle>
          {summaryBadge ? (
            <Badge variant="outline" className="text-[10px] whitespace-nowrap">{summaryBadge}</Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {data.slice(0, 8).map((item, idx) => {
          const isActive = activeItemName === item.name;
          return (
            <button
              key={item.name}
              type="button"
              className={`group animate-fade-in w-full text-left rounded-md px-1 py-1 transition-colors ${onItemClick ? 'cursor-pointer hover:bg-muted/50' : ''} ${isActive ? 'ring-1 ring-primary bg-muted/40' : ''}`}
              style={{ animationDelay: `${idx * 50}ms` }}
              onClick={() => onItemClick?.(item)}
            >
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-foreground font-medium truncate max-w-[60%]">{item.name}</span>
                <span className="text-muted-foreground font-mono text-xs">{item.hours}h</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${Math.max(4, (item.hours / maxHours) * 100)}%`,
                    background: CHART_COLORS[idx % CHART_COLORS.length],
                  }}
                />
              </div>
            </button>
          );
        })}
        {data.length > 8 && (
          <p className="text-xs text-muted-foreground/60 text-center pt-1">
            +{data.length - 8} mais
          </p>
        )}
      </CardContent>
    </Card>
  );
}
