import { ReactNode, useEffect } from 'react';
import { prepararPwaTimer } from '@/lib/timerPwa';
import { useNavigate } from 'react-router-dom';
import { LogOut, Timer as TimerIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { BaixarApp } from '@/components/timer/BaixarApp';
import { AvisoAbaCongelada } from '@/components/timer/AvisoAbaCongelada';
import { versaoDesktop } from '@/lib/timerAcesso';

/**
 * Casca do Timer Flag: barra azul, sem a sidebar do hub e SEM nenhum caminho
 * ou menção ao hub de KPIs (decisão do Igor, 16/11/2026: quem usa o Timer não
 * deve saber que o hub existe). Quem também tem KPI entra no hub pelo
 * endereço dele.
 */
export function TimerLayout({ children }: { children: ReactNode }) {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const nome = profile?.full_name || user?.email || '';
  const versaoApp = typeof navigator !== 'undefined' ? versaoDesktop(navigator.userAgent) : null;

  // Só nas rotas do Timer: manifest + service worker (o Timer instalável).
  useEffect(() => {
    prepararPwaTimer();
  }, []);

  const sair = async () => {
    await signOut();
    navigate('/login', { replace: true, state: { from: '/timer' } });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))] border-b border-[hsl(var(--sidebar-border))]">
        <div className="flex h-14 w-full items-center gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-flag-gold p-1.5">
              <TimerIcon className="h-5 w-5 text-flag-navy" />
            </div>
            <div className="leading-tight">
              <p className="text-base font-bold tracking-tight text-flag-gold">Timer Flag</p>
              <p className="text-[11px] text-sidebar-foreground/60">
                Horas direto no DevOps
                {/* No app desktop, a versão instalada, discreta (para saber se precisa reinstalar). */}
                {versaoApp && <span className="ml-1.5 text-sidebar-foreground/40">· app {versaoApp}</span>}
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {nome && (
              <span className="hidden max-w-[220px] truncate text-xs text-sidebar-foreground/70 sm:inline">{nome}</span>
            )}
            <AvisoAbaCongelada className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
            <BaixarApp className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void sair()}
              className="gap-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="w-full flex-1 space-y-4 p-4 sm:px-6">{children}</main>
    </div>
  );
}
