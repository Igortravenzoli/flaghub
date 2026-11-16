import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Timer as TimerIcon } from 'lucide-react';
import { registrarEventoTimer } from '@/hooks/useTimerAcesso';

/**
 * /timer/widget — a janela flutuante do app desktop (Electron) carrega esta
 * rota. Por ora só a casca compacta: o cronômetro entra com a fase do timer e
 * o modo mini/reduzido com a fase do desktop. Mesmo guard de /timer.
 */
export default function TimerWidget() {
  useEffect(() => {
    void registrarEventoTimer('abriu');
  }, []);

  return (
    <div className="flex min-h-screen items-center bg-[hsl(var(--sidebar-background))] p-2 text-[hsl(var(--sidebar-foreground))]">
      <div className="flex w-full items-center gap-3 rounded-xl border border-[hsl(var(--sidebar-border))] px-3 py-2">
        <div className="rounded-lg bg-flag-gold p-1.5">
          <TimerIcon className="h-4 w-4 text-flag-navy" />
        </div>
        <span className="font-mono text-lg font-semibold tabular-nums text-sidebar-foreground/50">00:00:00</span>
        <Link to="/timer" className="ml-auto text-xs text-flag-gold hover:underline">
          Abrir
        </Link>
      </div>
    </div>
  );
}
