import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Plane } from 'lucide-react';

// ── Animated Number ──
function AnimatedNumber({ value, suffix }: { value: number | string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current !== value && ref.current) {
      ref.current.classList.add('kiosk-flash');
      const t = setTimeout(() => ref.current?.classList.remove('kiosk-flash'), 400);
      prevValue.current = value;
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <span ref={ref} className="transition-colors duration-300">
      {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
      {suffix && <span className="text-[0.45em] ml-1 opacity-60">{suffix}</span>}
    </span>
  );
}

// ── Trend Arrow ──
function TrendArrow({ trend }: { trend?: 'up' | 'down' | 'flat' }) {
  if (!trend) return null;
  const icons = { up: TrendingUp, down: TrendingDown, flat: Minus };
  const colors = { up: 'text-emerald-400', down: 'text-red-400', flat: 'text-slate-500' };
  const Icon = icons[trend];
  return (
    <div className={cn('flex items-center justify-center rounded-full p-1.5', trend === 'up' ? 'bg-emerald-500/10' : trend === 'down' ? 'bg-red-500/10' : 'bg-slate-500/10')}>
      <Icon className={cn('h-4 w-4', colors[trend])} />
    </div>
  );
}

// ── Glow Ring (decorative) ──
function GlowRing({ color }: { color: string }) {
  return (
    <div
      className="absolute -top-8 -right-8 w-28 h-28 rounded-full blur-2xl opacity-15 pointer-events-none"
      style={{ background: color }}
    />
  );
}

// ── Hero KPI Card ──
export interface HeroCardProps {
  label: string;
  value: number | string;
  suffix?: string;
  trend?: 'up' | 'down' | 'flat';
  alert?: boolean;
  borderColor?: string;
  glowColor?: string;
  delay?: number;
}

export function KioskHeroCard({ label, value, suffix, trend, alert, borderColor = 'border-blue-500/40', glowColor, delay = 0 }: HeroCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-gradient-to-br from-slate-900/80 to-slate-800/40 backdrop-blur-xl rounded-2xl border p-6 flex flex-col justify-between min-h-[150px] kiosk-card-enter',
        borderColor,
        alert && 'kiosk-pulse-border ring-1 ring-red-500/30'
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {glowColor && <GlowRing color={glowColor} />}
      <div className="flex items-center justify-between relative z-10">
        <p className="text-[14px] font-semibold text-slate-400 uppercase tracking-widest leading-tight">{label}</p>
        <TrendArrow trend={trend} />
      </div>
      <div className="relative z-10 mt-auto">
        <span className="font-mono font-black text-[clamp(48px,7vw,76px)] leading-none text-white drop-shadow-lg">
          <AnimatedNumber value={value} suffix={suffix} />
        </span>
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

export function KioskSupportCard({ label, value, suffix, alert, borderColor = 'border-slate-700/50', badge, delay = 0 }: SupportCardProps) {
  return (
    <div
      className={cn(
        'bg-slate-900/50 backdrop-blur-sm rounded-xl border p-4 flex flex-col gap-1.5 kiosk-card-enter',
        borderColor,
        alert && 'kiosk-pulse-border ring-1 ring-red-500/20'
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium text-slate-500 uppercase tracking-wider">{label}</p>
        {badge}
      </div>
      <span className="font-mono font-bold text-[clamp(28px,4vw,42px)] leading-none text-white">
        <AnimatedNumber value={value} suffix={suffix} />
      </span>
    </div>
  );
}

// ── Badge ──
export function KioskBadge({ children, variant = 'neutral' }: { children: ReactNode; variant?: 'critical' | 'warning' | 'healthy' | 'neutral' }) {
  const colors = {
    critical: 'bg-red-500/15 text-red-400 border-red-500/30 shadow-red-500/10 shadow-sm',
    warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30 shadow-amber-500/10 shadow-sm',
    healthy: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-emerald-500/10 shadow-sm',
    neutral: 'bg-slate-500/15 text-slate-400 border-slate-600/30',
  };
  return (
    <span className={cn('text-[10px] font-mono font-bold px-2.5 py-1 rounded-full border', colors[variant])}>
      {children}
    </span>
  );
}

// ── Alert Banner ──
export function KioskAlertBanner({ message, type = 'critical' }: { message: string; type?: 'critical' | 'warning' }) {
  return (
    <div
      className={cn(
        'rounded-xl px-5 py-3 text-sm font-semibold kiosk-card-enter flex items-center gap-3',
        type === 'critical'
          ? 'bg-red-500/10 text-red-400 border border-red-500/30 kiosk-pulse-border'
          : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
      )}
    >
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      {message}
    </div>
  );
}

// ── Item List (new: shows individual items in alert) ──
export function KioskItemList({ items, maxItems = 5, emptyText = 'Nenhum item' }: {
  items: { label: string; sublabel?: string; icon?: ReactNode }[];
  maxItems?: number;
  emptyText?: string;
}) {
  if (items.length === 0) return (
    <div className="text-slate-600 text-xs text-center py-3">{emptyText}</div>
  );
  const shown = items.slice(0, maxItems);
  const remaining = items.length - maxItems;
  return (
    <div className="flex flex-col gap-1">
      {shown.map((item, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/40 border border-slate-700/30 kiosk-card-enter" style={{ animationDelay: `${i * 60}ms` }}>
          {item.icon || <div className="w-1.5 h-1.5 rounded-full bg-slate-500 flex-shrink-0" />}
          <span className="text-[12px] text-slate-300 font-medium truncate flex-1">{item.label}</span>
          {item.sublabel && <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">{item.sublabel}</span>}
        </div>
      ))}
      {remaining > 0 && (
        <div className="text-[10px] text-slate-600 text-center pt-1">+{remaining} mais</div>
      )}
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
  const areaPath = `M0,${height} L${points.split(' ').map(p => p).join(' L')} L${width},${height} Z`;

  return (
    <svg width={width} height={height} className="opacity-90">
      <defs>
        <linearGradient id={`spark-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

// ── Horizontal Bar Chart ──
export function KioskBarChart({ items, maxBars = 5 }: { items: { label: string; value: number; color?: string }[]; maxBars?: number }) {
  const sorted = [...items].sort((a, b) => b.value - a.value).slice(0, maxBars);
  const max = sorted[0]?.value || 1;

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((item, i) => (
        <div key={item.label} className="flex items-center gap-3 kiosk-card-enter" style={{ animationDelay: `${i * 40}ms` }}>
          <span className="text-[11px] text-slate-400 w-28 truncate text-right font-medium">{item.label}</span>
          <div className="flex-1 h-5 bg-slate-800/60 rounded-lg overflow-hidden">
            <div
              className="h-full rounded-lg transition-all duration-700 ease-out"
              style={{ width: `${(item.value / max) * 100}%`, background: `linear-gradient(90deg, ${item.color || '#3b82f6'}, ${item.color || '#3b82f6'}88)` }}
            />
          </div>
          <span className="text-[12px] font-mono text-slate-300 w-10 text-right font-bold">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Donut/Ring Chart (mini) ──
export function KioskDonut({ segments, size = 80 }: { segments: { value: number; color: string; label?: string }[]; size?: number }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;
  const r = (size - 8) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} className="drop-shadow-lg">
        {segments.map((seg, i) => {
          const pct = seg.value / total;
          const dash = circumference * pct;
          const gap = circumference - dash;
          const currentOffset = offset;
          offset += dash;
          return (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth="6"
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-currentOffset}
              strokeLinecap="round"
              className="transition-all duration-700"
              style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
            />
          );
        })}
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="fill-white font-mono font-bold text-[14px]">{total}</text>
      </svg>
      <div className="flex flex-col gap-1">
        {segments.filter(s => s.label).map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: seg.color }} />
            <span className="text-[10px] text-slate-400">{seg.label}: {seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section Header ──
export function KioskSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-gradient-to-r from-slate-700/50 to-transparent" />
      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">{children}</h3>
      <div className="h-px flex-1 bg-gradient-to-l from-slate-700/50 to-transparent" />
    </div>
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
        return diff < 2 ? 'agora' : `${diff}min`;
      })()
    : null;

  return (
    <div className="flex items-center justify-between text-[10px] text-slate-600 mt-auto pt-3 border-t border-slate-800/30">
      <span className="font-medium">{sectorName}</span>
      <div className="flex gap-4 font-mono">
        {freshness && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {freshness}</span>}
        <span>{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
}
