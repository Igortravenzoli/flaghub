import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Severidade } from '@/types';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: number | string;
  icon?: LucideIcon;
  severity?: Severidade;
  subtitle?: string;
  className?: string;
}

const severityStyles: Record<Severidade, { border: string; bg: string; icon: string }> = {
  critical: {
    border: 'border-[hsl(var(--critical))]/30',
    bg: 'bg-[hsl(var(--critical))]/5',
    icon: 'text-[hsl(var(--critical))]'
  },
  warning: {
    border: 'border-[hsl(var(--warning))]/30',
    bg: 'bg-[hsl(var(--warning))]/5',
    icon: 'text-[hsl(var(--warning))]'
  },
  info: {
    border: 'border-[hsl(var(--info))]/30',
    bg: 'bg-[hsl(var(--info))]/5',
    icon: 'text-[hsl(var(--info))]'
  },
  success: {
    border: 'border-[hsl(var(--success))]/30',
    bg: 'bg-[hsl(var(--success))]/5',
    icon: 'text-[hsl(var(--success))]'
  }
};

export function StatCard({ title, value, icon: Icon, severity, subtitle, className }: StatCardProps) {
  const styles = severity ? severityStyles[severity] : null;
  
  return (
    <Card 
      className={cn(
        "transition-all",
        styles?.border,
        styles?.bg,
        className
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {Icon && (
            <div className={cn("p-2 rounded-lg", styles?.bg || "bg-muted")}>
              <Icon className={cn("h-5 w-5", styles?.icon || "text-muted-foreground")} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
