import { memo } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCountUp } from '@/hooks/useCountUp';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { toneStyle, type QaTone } from '@/lib/qaTheme';

interface QaKpiCardProps {
  label: string;
  value: number | string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: QaTone;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  /** Sobrescreve a cor do número (ex.: cor por threshold). */
  valueColor?: string;
  /** 0–100: exibe mini-barra de progresso na cor do tom. */
  progress?: number;
  /** Variação % (badge de tendência). */
  trend?: number;
  /** true quando "para cima" é bom (verde); false inverte as cores. */
  trendUpIsGood?: boolean;
  sublabel?: string;
  tooltip?: string;
  onClick?: () => void;
  active?: boolean;
  isLoading?: boolean;
  delay?: number;
}

export const QaKpiCard = memo(function QaKpiCard({
  label, value, icon: Icon, tone = 'primary',
  suffix = '', prefix = '', decimals = 0, valueColor,
  progress, trend, trendUpIsGood = true, sublabel, tooltip,
  onClick, active, isLoading, delay = 0,
}: QaKpiCardProps) {
  const isNumeric = typeof value === 'number';
  const factor = Math.pow(10, decimals);
  const animatedScaled = useCountUp(isNumeric ? Math.round((value as number) * factor) : 0);
  const display = isNumeric ? (animatedScaled / factor).toFixed(decimals) : value;
  const t = toneStyle(tone);

  if (isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-9 w-9 rounded-xl mb-3" />
        <Skeleton className="h-7 w-16 mb-1" />
        <Skeleton className="h-3 w-24" />
      </Card>
    );
  }

  const trendPositive = (trend ?? 0) >= 0;
  const trendGood = trendUpIsGood ? trendPositive : !trendPositive;

  const labelNode = (
    <p className={`text-xs text-muted-foreground mt-1 font-medium ${tooltip ? 'underline decoration-dotted decoration-muted-foreground/40 cursor-help' : ''}`}>
      {label}
    </p>
  );

  return (
    <Card
      onClick={onClick}
      style={{ animationDelay: `${delay}ms` }}
      className={`relative overflow-hidden p-4 pl-5 animate-fade-in transition-all duration-200
        ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md' : ''}
        ${active ? 'ring-2 ring-offset-1 ring-offset-background' : ''}`}
    >
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: t.solid, opacity: active ? 1 : 0.85 }} />
      <div className="flex items-center justify-between mb-3">
        {Icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: t.soft, color: t.solid }}>
            <Icon className="h-[18px] w-[18px]" />
          </div>
        )}
        {trend !== undefined && (
          <span
            className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{
              background: trendGood ? 'rgba(13,148,136,0.12)' : 'rgba(220,38,38,0.12)',
              color: trendGood ? '#0d9488' : '#dc2626',
            }}
          >
            {trendPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold tracking-tight" style={valueColor ? { color: valueColor } : undefined}>
        {prefix}{display}{suffix}
      </p>
      {tooltip ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{labelNode}</TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">{tooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : labelNode}
      {sublabel && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sublabel}</p>}
      {progress !== undefined && (
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(0, Math.min(100, progress))}%`, background: valueColor || t.solid }} />
        </div>
      )}
    </Card>
  );
});

// Set chip icon color via currentColor on the tone — applied through a wrapper style.
