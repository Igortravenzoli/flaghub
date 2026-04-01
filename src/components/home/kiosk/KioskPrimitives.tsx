import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

// ── Animated Number ──
function AnimatedNumber({ value, suffix }: { value: number | string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current !== value && ref.current) {
      ref.current.classList.add('kiosk-flash');
      const t = setTimeout(() => ref.current?.classList.remove('kiosk-flash'), 300);
      prevValue.current = value;
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <span ref={ref} className="transition-colors duration-300">
      {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
      {suffix && <span className="text-[0.5em] ml-1 opacity-70">{suffix}</span>}
    </span>
  );
}

// ── Trend Arrow ──
function TrendArrow({ trend }: { trend?: 'up' | 'down' | 'flat' }) {
  if (!trend) return null;
  const icons = { up: TrendingUp, down: TrendingDown, flat: Minus };
  const colors = { up: 'text-emerald-400', down: 'text-red-400', flat: 'text-slate-400' };
  const Icon = icons[trend];
  return <Icon className={cn('h-5 w-5', colors[trend])} />;
}

// ── Hero KPI Card ──
export interface HeroCardProps {
  label: string;
  value: number | string;
  suffix?: string;
  trend?: 'up' | 'down' | 'flat';
  alert?: boolean;
  borderColor?: string;
  delay?: number;
}

export function KioskHeroCard({ label, value, suffix, trend, alert, borderColor = 'border-primary', delay = 0 }: HeroCardProps) {
  return (
    <div
      className={cn(
        'bg-slate-900/60 backdrop-blur-sm rounded-xl border-l-4 p-5 flex flex-col justify-between min-h-[140px] animate-fade-in',
        borderColor,
        alert && 'kiosk-pulse-border border-red-500'
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-[15px] font-semibold text-slate-300 uppercase tracking-wide leading-tight">{label}</p>
      <div className="flex items-end gap-3 mt-2">
        <span className="font-mono font-black text-[clamp(48px,7vw,72px)] leading-none text-white">
          <AnimatedNumber value={value} suffix={suffix} />
        </span>
        <TrendArrow trend={trend} />
      </div>
    </div>
  );
}

// ── Supporting KPI Card ──
export interface SupportCardProps {
  label: string;
  value: number | string;
  suffix?: string;
  alert?: boolean;
  borderColor?: string;
  badge?: ReactNode;
  delay?: number;
}

export function KioskSupportCard({ label, value, suffix, alert, borderColor = 'border-slate-700', badge, delay = 0 }: SupportCardProps) {
  return (
    <div
      className={cn(
        'bg-slate-900/40 backdrop-blur-sm rounded-lg border-l-4 p-4 flex flex-col gap-1 animate-fade-in',
        borderColor,
        alert && 'kiosk-pulse-border border-red-500'
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-slate-400 uppercase tracking-wide">{label}</p>
        {badge}
      </div>
      <span className="font-mono font-bold text-[clamp(28px,4vw,40px)] leading-none text-white">
        <AnimatedNumber value={value} suffix={suffix} />
      </span>
    </div>
  );
}

// ── Badge ──
export function KioskBadge({ children, variant = 'neutral' }: { children: ReactNode; variant?: 'critical' | 'warning' | 'healthy' | 'neutral' }) {
  const colors = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/40',
    warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
    healthy: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    neutral: 'bg-slate-500/20 text-slate-400 border-slate-500/40',
  };
  return (
    <span className={cn('text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full border', colors[variant])}>
      {children}
    </span>
  );
}

// ── Alert Banner ──
export function KioskAlertBanner({ message, type = 'critical' }: { message: string; type?: 'critical' | 'warning' }) {
  return (
    <div
      className={cn(
        'rounded-lg px-4 py-2 text-sm font-semibold animate-fade-in kiosk-pulse-border',
        type === 'critical'
          ? 'bg-red-500/15 text-red-400 border border-red-500/40'
          : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/40'
      )}
    >
      {message}
    </div>
  );
}

// ── Sparkline (SVG) ──
export function KioskSparkline({ data, color = '#10b981', height = 40, width = 160 }: { data: number[]; color?: string; height?: number; width?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const points = data.map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ');

  return (
    <svg width={width} height={height} className="opacity-80">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

// ── Horizontal Bar Chart ──
export function KioskBarChart({ items, maxBars = 5 }: { items: { label: string; value: number; color?: string }[]; maxBars?: number }) {
  const sorted = [...items].sort((a, b) => b.value - a.value).slice(0, maxBars);
  const max = sorted[0]?.value || 1;

  return (
    <div className="flex flex-col gap-1.5">
      {sorted.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 w-24 truncate text-right font-medium">{item.label}</span>
          <div className="flex-1 h-4 bg-slate-800/60 rounded overflow-hidden">
            <div
              className="h-full rounded transition-all duration-500"
              style={{ width: `${(item.value / max) * 100}%`, backgroundColor: item.color || '#3b82f6' }}
            />
          </div>
          <span className="text-[11px] font-mono text-slate-300 w-8 text-right">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Section Header ──
export function KioskSectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">{children}</h3>
  );
}

// ── Footer ──
export function KioskFooter({ lastSync, sectorName }: { lastSync?: string | null; sectorName?: string }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const freshness = lastSync
    ? (() => {
        const diff = Math.round((now.getTime() - new Date(lastSync).getTime()) / 60_000);
        return diff < 2 ? 'há instantes' : `há ${diff} min`;
      })()
    : null;

  return (
    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-slate-800/50">
      <span>{sectorName}</span>
      <div className="flex gap-4">
        {freshness && <span>Dados: {freshness}</span>}
        <span>{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
}
