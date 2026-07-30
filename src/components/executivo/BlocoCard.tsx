import { CalendarClock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Card padrão das Visões Executivas dos setores (ícone + título + conteúdo).
 * Compartilhado entre setores para manter consistência visual.
 * Se `onClick` for passado, o card vira clicável (drill-down para a visão analítica).
 */
export function BlocoCard({
  icon: Icon,
  titulo,
  children,
  className,
  onClick,
  headerRight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  titulo: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  headerRight?: React.ReactNode;
}) {
  const clickable = !!onClick;
  return (
    <Card
      className={`p-4 flex flex-col gap-3 ${clickable ? 'cursor-pointer transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary' : ''} ${className ?? ''}`}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick!(); } } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border bg-muted/40">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{titulo}</p>
        </div>
        {headerRight}
      </div>
      {children}
    </Card>
  );
}

/**
 * Selo de "resultado calculado" (SLA-8) — para o `headerRight` de cards cujo
 * número vem de uma janela de CALENDÁRIO fixa e portanto **não responde ao
 * filtro de período da tela**.
 *
 * Regra do modo TV respeitada porque o `texto` é sempre visível e a janela
 * detalhada também aparece em texto no rodapé do card: o `title` é redundância,
 * nunca a única fonte.
 */
export function SeloCalculado({ texto = 'resultado calculado', janela }: {
  texto?: string;
  /** Detalhe da janela (multilinha ok) — vai para o `title`, como redundância. */
  janela: string;
}) {
  return (
    <Badge
      variant="outline"
      className="gap-1 shrink-0 text-[10px] font-medium text-muted-foreground"
      title={janela}
    >
      <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
      {texto}
    </Badge>
  );
}

/** Semáforo "quanto maior melhor" (ex.: % cobertura, % conclusão). */
export function corMetaHigh(pct: number): string {
  if (pct >= 80) return '#16a34a';
  if (pct >= 60) return '#f59e0b';
  return '#ef4444';
}

/**
 * Divisor de seção das Visões Executivas (framework Thales):
 * "Onde estamos · AS IS" / "O que queremos · TO BE" / "De onde viemos · Histórico".
 */
export function SecHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">{title}</h3>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * Card de META (TO BE) com barra de atingimento (realizado × meta).
 * - menorMelhor=false (padrão): "quanto maior melhor" — atingimento = realizado/meta.
 * - menorMelhor=true: meta vira teto — atingimento = 100% se realizado ≤ meta, senão meta/realizado.
 */
export function MetaCard({
  icon, titulo, realizado, meta, unidade = '%', menorMelhor = false, detalhe,
}: {
  icon: React.ComponentType<{ className?: string }>;
  titulo: string;
  realizado: number;
  meta: number;
  unidade?: string;
  menorMelhor?: boolean;
  detalhe?: React.ReactNode;
}) {
  const atingimento = menorMelhor
    ? (realizado <= meta ? 100 : Math.round((meta / Math.max(realizado, 0.0001)) * 100))
    : (meta > 0 ? Math.round((realizado / meta) * 100) : 0);
  const cor = atingimento >= 100 ? '#16a34a' : atingimento >= 80 ? '#f59e0b' : '#ef4444';
  const fmt = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}${unidade}`;
  return (
    <BlocoCard icon={icon} titulo={titulo}>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-3xl font-bold font-mono" style={{ color: cor }}>{fmt(realizado)}</p>
          <p className="text-[11px] text-muted-foreground">{menorMelhor ? 'teto' : 'meta'} {menorMelhor ? '≤' : '≥'} {fmt(meta)}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold font-mono" style={{ color: cor }}>{atingimento}%</p>
          <p className="text-[11px] text-muted-foreground">atingimento</p>
        </div>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(atingimento, 100)}%`, backgroundColor: cor }} />
      </div>
      {detalhe && <p className="text-[11px] text-muted-foreground border-t pt-2">{detalhe}</p>}
    </BlocoCard>
  );
}
