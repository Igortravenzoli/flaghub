import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCountUp } from '@/hooks/useCountUp';
import { ArrowUp, ArrowDown } from 'lucide-react';

interface DashboardKpiCardProps {
  label: string;
  value: number | string;
  icon?: React.ComponentType<{ className?: string }>;
  change?: number;
  changeLabel?: string;
  suffix?: string;
  prefix?: string;
  accent?: string;
  isLoading?: boolean;
  delay?: number;
  onClick?: () => void;
  active?: boolean;
}

export function DashboardKpiCard({
  label,
  value,
  icon: Icon,
  change,
  changeLabel,
  suffix = '',
  prefix = '',
  accent,
  isLoading,
  delay = 0,
}: DashboardKpiCardProps) {
  const numericValue = typeof value === 'number' ? value : 0;
  const animated = useCountUp(numericValue);
  const isPositive = (change ?? 0) >= 0;

  if (isLoading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-4 w-20 mb-3" />
        <Skeleton className="h-8 w-16 mb-1" />
        <Skeleton className="h-3 w-24" />
      </Card>
    );
  }

  return (
    <Card
      className="p-5 animate-fade-in group hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`absolute inset-0 opacity-[0.04] ${accent || 'bg-primary'}`} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          {Icon && (
            <div className={`p-2.5 rounded-xl ${accent ? accent + '/10' : 'bg-primary/10'}`}>
              <Icon className={`h-5 w-5 ${accent ? accent.replace('bg-', 'text-') : 'text-primary'}`} />
            </div>
          )}
          {change !== undefined && (
            <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
              isPositive
                ? 'bg-[hsl(142,71%,45%)]/10 text-[hsl(142,71%,45%)]'
                : 'bg-[hsl(0,84%,60%)]/10 text-[hsl(0,84%,60%)]'
            }`}>
              {isPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(change)}%
            </div>
          )}
        </div>
        <p className="text-3xl font-bold text-foreground tracking-tight">
          {prefix}{typeof value === 'number' ? animated : value}{suffix}
        </p>
        <p className="text-xs text-muted-foreground mt-1 font-medium">{label}</p>
        {changeLabel && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{changeLabel}</p>}
      </div>
    </Card>
  );
}
