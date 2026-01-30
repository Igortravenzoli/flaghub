import { cn } from '@/lib/utils';
import { Severidade } from '@/types';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ModernStatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  severity?: Severidade;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  className?: string;
}

const severityConfig: Record<Severidade, { 
  gradient: string; 
  glow: string; 
  icon: string;
  border: string;
}> = {
  critical: {
    gradient: 'from-[hsl(var(--critical))] to-[hsl(0,70%,45%)]',
    glow: 'glow-critical',
    icon: 'text-[hsl(var(--critical))]',
    border: 'border-[hsl(var(--critical))]/30',
  },
  warning: {
    gradient: 'from-[hsl(var(--warning))] to-[hsl(30,80%,40%)]',
    glow: 'glow-warning',
    icon: 'text-[hsl(var(--warning))]',
    border: 'border-[hsl(var(--warning))]/30',
  },
  info: {
    gradient: 'from-[hsl(var(--info))] to-[hsl(210,80%,40%)]',
    glow: 'glow-primary',
    icon: 'text-[hsl(var(--info))]',
    border: 'border-[hsl(var(--info))]/30',
  },
  success: {
    gradient: 'from-[hsl(var(--success))] to-[hsl(150,60%,35%)]',
    glow: 'glow-success',
    icon: 'text-[hsl(var(--success))]',
    border: 'border-[hsl(var(--success))]/30',
  }
};

export function ModernStatCard({ 
  title, 
  value, 
  icon: Icon, 
  severity,
  subtitle, 
  trend,
  trendValue,
  className 
}: ModernStatCardProps) {
  const config = severity ? severityConfig[severity] : null;
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  
  return (
    <div 
      className={cn(
        "group relative overflow-hidden rounded-xl transition-all duration-500",
        "bg-card border hover:border-primary/50",
        "hover:translate-y-[-2px] hover:shadow-xl hover:shadow-primary/10",
        config?.border || "border-border",
        className
      )}
    >
      {/* Gradient overlay on hover */}
      <div className={cn(
        "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500",
        "bg-gradient-to-br from-primary/5 via-transparent to-transparent"
      )} />
      
      {/* Glow effect for severity */}
      {severity && (
        <div className={cn(
          "absolute -top-1/2 -right-1/2 w-32 h-32 rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity",
          severity === 'critical' && "bg-[hsl(var(--critical))]",
          severity === 'warning' && "bg-[hsl(var(--warning))]",
          severity === 'success' && "bg-[hsl(var(--success))]",
          severity === 'info' && "bg-[hsl(var(--info))]",
        )} />
      )}

      <div className="relative p-6">
        <div className="flex items-start justify-between">
          {/* Content */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {title}
            </p>
            <div className="flex items-baseline gap-2">
              <p className={cn(
                "text-4xl font-bold tracking-tight",
                config?.icon || "text-foreground"
              )}>
                {value}
              </p>
              {trend && trendValue && (
                <div className={cn(
                  "flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                  trend === 'up' && "text-[hsl(var(--success))] bg-[hsl(var(--success))]/10",
                  trend === 'down' && "text-[hsl(var(--critical))] bg-[hsl(var(--critical))]/10",
                  trend === 'neutral' && "text-muted-foreground bg-muted"
                )}>
                  <TrendIcon className="h-3 w-3" />
                  {trendValue}
                </div>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>

          {/* Icon */}
          <div className={cn(
            "relative p-3 rounded-xl transition-all duration-300",
            "bg-gradient-to-br",
            config?.gradient || "from-primary/20 to-primary/5",
            "group-hover:scale-110"
          )}>
            <Icon className={cn(
              "h-6 w-6",
              config?.icon || "text-primary"
            )} />
          </div>
        </div>
      </div>

      {/* Bottom accent line */}
      <div className={cn(
        "absolute bottom-0 left-0 h-1 w-0 group-hover:w-full transition-all duration-500",
        "bg-gradient-to-r",
        config?.gradient || "from-primary to-[hsl(var(--info))]"
      )} />
    </div>
  );
}
