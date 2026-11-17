import { Loader2, Timer as TimerIcon } from 'lucide-react';

/**
 * Login do Timer Flag (rota /timer e app desktop): discreto, só o SSO
 * Microsoft, sem cartão e sem nenhuma marca do hub. Segue o tema do sistema.
 */
export function LoginTimer({ carregando, onEntrar }: { carregando: boolean; onEntrar: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-[300px]">
        <div className="flex flex-col items-center text-center">
          <div className="rounded-lg bg-flag-gold/90 p-2">
            <TimerIcon className="h-5 w-5 text-flag-navy" strokeWidth={2.25} />
          </div>
          <h1 className="mt-4 text-[15px] font-semibold tracking-tight text-foreground">Timer Flag</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Use a sua conta da Flag</p>
        </div>

        <button
          type="button"
          onClick={onEntrar}
          disabled={carregando}
          className="mt-7 flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-card text-[13px] font-medium text-foreground shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flag-gold/50 disabled:opacity-60"
        >
          {carregando ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 21 21" aria-hidden>
              <rect x="1" y="1" width="9" height="9" fill="#F25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
              <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
            </svg>
          )}
          Continuar com Microsoft
        </button>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground/70">
          Ao continuar, você concorda com os termos de uso.
        </p>
      </div>
    </div>
  );
}
