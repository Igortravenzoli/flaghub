import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Timer, ChevronDown, ChevronRight } from 'lucide-react';
import { CHART_COLORS } from '@/lib/chartColors';
import type { TimelogAggregation } from '@/hooks/useFabricaKpis';

// Ranking de horas apontadas (TimeLog) — extraído do FabricaDashboard para
// reuso entre setores (Fábrica e Infraestrutura).
export function HoursRankingCard({ title, icon: Icon, data, isLoading, emptyMessage, delay = 0, onItemClick, activeItemName, summaryBadge, subItemsByName, headerRight }: {
  title: string; icon: React.ComponentType<{ className?: string }>;
  data: TimelogAggregation[]; isLoading: boolean; emptyMessage: string; delay?: number;
  onItemClick?: (item: TimelogAggregation) => void;
  activeItemName?: string | null;
  summaryBadge?: string;
  /** Sub-itens (ex.: colaboradores) por item.name — habilita expansão inline */
  subItemsByName?: Record<string, TimelogAggregation[]>;
  /** Conteúdo extra no cabeçalho (ex.: toggle de modo), à esquerda do badge */
  headerRight?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (name: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
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
          <div className="flex items-center gap-2">
            {headerRight}
            {summaryBadge ? (
              <Badge variant="outline" className="text-[10px] whitespace-nowrap">{summaryBadge}</Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {data.slice(0, 8).map((item, idx) => {
          const isActive = activeItemName === item.name;
          const subs = subItemsByName?.[item.name];
          const hasSubs = !!subs && subs.length > 0;
          const isExpanded = expanded.has(item.name);
          const subMax = hasSubs ? Math.max(...subs.map((s) => s.hours), 1) : 1;
          const color = CHART_COLORS[idx % CHART_COLORS.length];
          return (
            <div key={item.name} className="animate-fade-in" style={{ animationDelay: `${idx * 50}ms` }}>
              <div className={`group flex items-stretch gap-1 rounded-md px-1 py-1 transition-colors ${isActive ? 'ring-1 ring-primary bg-muted/40' : ''}`}>
                <button
                  type="button"
                  className={`flex-1 text-left ${onItemClick ? 'cursor-pointer hover:bg-muted/50 rounded-sm' : ''}`}
                  onClick={() => onItemClick?.(item)}
                >
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-foreground font-medium truncate max-w-[60%]">{item.name}</span>
                    <span className="text-muted-foreground font-mono text-xs">{item.hours}h</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${Math.max(4, (item.hours / maxHours) * 100)}%`, background: color }}
                    />
                  </div>
                </button>
                {hasSubs && (
                  <button
                    type="button"
                    aria-label={isExpanded ? 'Recolher colaboradores' : 'Expandir colaboradores'}
                    aria-expanded={isExpanded}
                    className="self-center px-1 text-muted-foreground hover:text-foreground"
                    onClick={() => toggle(item.name)}
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                )}
              </div>
              {hasSubs && isExpanded && (
                <div className="ml-2 mt-1.5 mb-1 space-y-1.5 border-l border-border/60 pl-3">
                  {subs.map((s) => (
                    <div key={s.name} className="flex items-center gap-2 text-xs">
                      <span className="w-[44%] truncate text-muted-foreground">{s.name}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(3, (s.hours / subMax) * 100)}%`, background: color, opacity: 0.7 }} />
                      </div>
                      <span className="w-12 text-right font-mono text-muted-foreground">{s.hours}h</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
