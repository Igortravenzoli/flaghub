import { Card } from '@/components/ui/card';

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

/** Semáforo "quanto maior melhor" (ex.: % cobertura, % conclusão). */
export function corMetaHigh(pct: number): string {
  if (pct >= 80) return '#16a34a';
  if (pct >= 60) return '#f59e0b';
  return '#ef4444';
}
