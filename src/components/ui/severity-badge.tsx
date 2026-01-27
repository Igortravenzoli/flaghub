import { cn } from '@/lib/utils';
import { Severidade } from '@/types';

interface SeverityBadgeProps {
  severity: Severidade;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const severityConfig: Record<Severidade, { label: string; icon: string; className: string }> = {
  critical: {
    label: 'Crítico',
    icon: '🔴',
    className: 'bg-[hsl(var(--critical))] text-[hsl(var(--critical-foreground))]'
  },
  warning: {
    label: 'Atenção',
    icon: '🟡',
    className: 'bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]'
  },
  info: {
    label: 'Informativo',
    icon: '🔵',
    className: 'bg-[hsl(var(--info))] text-[hsl(var(--info-foreground))]'
  },
  success: {
    label: 'OK',
    icon: '🟢',
    className: 'bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]'
  }
};

export function SeverityBadge({ severity, size = 'md', showLabel = true }: SeverityBadgeProps) {
  const config = severityConfig[severity];
  
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5'
  };
  
  return (
    <span 
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        config.className,
        sizeClasses[size]
      )}
    >
      <span>{config.icon}</span>
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}

interface SeverityDotProps {
  severity: Severidade;
  className?: string;
}

export function SeverityDot({ severity, className }: SeverityDotProps) {
  const dotColors: Record<Severidade, string> = {
    critical: 'bg-[hsl(var(--critical))]',
    warning: 'bg-[hsl(var(--warning))]',
    info: 'bg-[hsl(var(--info))]',
    success: 'bg-[hsl(var(--success))]'
  };
  
  return (
    <span 
      className={cn(
        "inline-block w-2 h-2 rounded-full",
        dotColors[severity],
        className
      )}
    />
  );
}
