import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCountUp } from '@/hooks/useCountUp';
import { toneStyle, type QaTone } from '@/lib/qaTheme';

export interface QaPillarStat {
  label: string;
  value: string | number;
  color?: string;
}

interface QaPillarCardProps {
  title: string;
  subtitle?: string;
  /** Valor de destaque (animado se numérico). */
  value: number | string;
  valueSuffix?: string;
  decimals?: number;
  valueColor?: string;
  /** Legenda curta à esquerda do número (ex.: período/sprint). */
  caption?: string;
  /** 0–100 para a barra de progresso. */
  progress?: number;
  progressColor?: string;
  tone?: QaTone;
  stats?: QaPillarStat[];
  className?: string;
}

export function QaPillarCard({
  title, subtitle, value, valueSuffix = '', decimals = 0, valueColor, caption,
  progress, progressColor, tone = 'primary', stats = [], className = '',
}: QaPillarCardProps) {
  const isNumeric = typeof value === 'number';
  const factor = Math.pow(10, decimals);
  const animatedScaled = useCountUp(isNumeric ? Math.round((value as number) * factor) : 0);
  const display = isNumeric ? (animatedScaled / factor).toFixed(decimals) : value;
  const t = toneStyle(tone);
  const barColor = progressColor || valueColor || t.solid;

  return (
    <Card className={`animate-fade-in ${className}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{caption ?? ' '}</span>
          <span className="text-3xl font-bold font-mono tracking-tight" style={valueColor ? { color: valueColor } : undefined}>
            {display}{valueSuffix}
          </span>
        </div>
        {progress !== undefined && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(0, Math.min(100, progress))}%`, background: barColor }} />
          </div>
        )}
        {stats.length > 0 && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            {stats.map((s, i) => (
              <div key={i} className="rounded-lg border bg-muted/30 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-xl font-bold" style={s.color ? { color: s.color } : undefined}>{s.value}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
