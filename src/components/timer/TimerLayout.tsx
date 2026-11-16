import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, Timer as TimerIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';

/**
 * Casca do Timer Flag: barra no azul do hub, sem a sidebar dos KPIs. Quem
 * tem só o Timer não vê caminho nenhum para o resto do hub; quem também tem
 * KPI ganha o atalho "Hub de KPIs".
 */
export function TimerLayout({ children }: { children: ReactNode }) {
  const { profile, user, pendingApproval, signOut } = useAuth();
  const navigate = useNavigate();
  const nome = profile?.full_name || user?.email || '';

  const sair = async () => {
    await signOut();
    navigate('/login', { replace: true, state: { from: '/timer' } });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))] border-b border-[hsl(var(--sidebar-border))]">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-flag-gold p-1.5">
              <TimerIcon className="h-5 w-5 text-flag-navy" />
            </div>
            <div className="leading-tight">
              <p className="text-base font-bold tracking-tight text-flag-gold">Timer Flag</p>
              <p className="text-[11px] text-sidebar-foreground/60">Horas direto no DevOps</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {nome && (
              <span className="hidden max-w-[220px] truncate text-xs text-sidebar-foreground/70 sm:inline">{nome}</span>
            )}
            {!pendingApproval && (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <Link to="/home" className="gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  <span className="hidden sm:inline">Hub de KPIs</span>
                </Link>
              </Button>
            )}
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

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 sm:p-6">{children}</main>
    </div>
  );
}
