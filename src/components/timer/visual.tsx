import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Peças visuais do Timer no padrão do Flag.DS (linguagem Untitled UI):
 * superfície branca com borda clara, raio xl e sombra xs; título semibold;
 * selos em pílula com anel da própria cor. Usa só os tokens do FlagHub.
 */

export const SOMBRA_XS = 'shadow-[0_1px_2px_0_rgb(16_24_40/0.05)]';

/** Coluna do cockpit: cabeçalho fixo e corpo que rola por dentro. */
export function Coluna({
  icone: Icone,
  titulo,
  contagem,
  acoes,
  children,
  className,
  corpoClassName,
  destaque = false,
}: {
  icone: ComponentType<{ className?: string }>;
  titulo: string;
  contagem?: number | string | null;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
  corpoClassName?: string;
  destaque?: boolean;
}) {
  return (
    <section
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card',
        SOMBRA_XS,
        destaque ? 'border-flag-gold/70' : 'border-border',
        className,
      )}
    >
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
          <Icone className="h-4 w-4 text-muted-foreground" />
        </span>
        <h2 className="truncate text-sm font-semibold text-foreground">{titulo}</h2>
        {contagem != null && <Pilula>{contagem}</Pilula>}
        {acoes && <div className="ml-auto flex shrink-0 items-center gap-1">{acoes}</div>}
      </header>
      <div className={cn('min-h-0 flex-1 overflow-y-auto p-4', corpoClassName)}>{children}</div>
    </section>
  );
}

export type TomPilula = 'neutro' | 'sucesso' | 'alerta' | 'marca' | 'erro';

const TONS: Record<TomPilula, string> = {
  neutro: 'bg-muted text-muted-foreground ring-border',
  sucesso: 'bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))] ring-[hsl(var(--success)/0.3)]',
  alerta: 'bg-[hsl(var(--warning)/0.12)] text-foreground ring-[hsl(var(--warning)/0.45)]',
  marca: 'bg-flag-gold/15 text-foreground ring-flag-gold/50',
  erro: 'bg-destructive/10 text-destructive ring-destructive/30',
};

export function Pilula({
  tom = 'neutro',
  children,
  className,
  title,
}: {
  tom?: TomPilula;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONS[tom],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Estado vazio curto, centralizado. */
export function Vazio({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[72px] items-center justify-center rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
