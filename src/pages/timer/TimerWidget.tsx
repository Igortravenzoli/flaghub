import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pause, Play, Timer as TimerIcon } from 'lucide-react';
import { registrarEventoTimer } from '@/hooks/useTimerAcesso';
import { useMotorTimer } from '@/hooks/useTimerRelogio';
import { DialogoPresenca } from '@/components/timer/DialogoPresenca';
import { lerSelecao } from '@/lib/timerSelecao';
import { relogio } from '@/lib/timerRelogio';
import { cn } from '@/lib/utils';

/**
 * /timer/widget — a janela flutuante do app desktop (Electron) carrega esta
 * rota; no navegador também funciona. Mesmo motor e mesmas regras de /timer:
 * iniciar usa a tarefa escolhida em /timer.
 */
export default function TimerWidget() {
  const motor = useMotorTimer({ tituloDaAba: true });
  const { rodando, segundos, acoes, carregando } = motor;
  const [selecionada, setSelecionada] = useState(() => lerSelecao());

  useEffect(() => {
    void registrarEventoTimer('abriu');
    // a escolha é feita em /timer (outra aba/janela): acompanha
    const aoMudar = (e: StorageEvent) => {
      if (e.key === null || e.key === 'timer-flag:tarefa-selecionada') setSelecionada(lerSelecao());
    };
    window.addEventListener('storage', aoMudar);
    return () => window.removeEventListener('storage', aoMudar);
  }, []);

  const ocupado = acoes.iniciar.isPending || acoes.pausar.isPending;
  const alvo = rodando
    ? { id: rodando.work_item_id, titulo: rodando.titulo }
    : selecionada
      ? { id: selecionada.id, titulo: selecionada.title ?? `#${selecionada.id}` }
      : null;

  return (
    <div className="flex min-h-screen items-center bg-[hsl(var(--sidebar-background))] p-2 text-[hsl(var(--sidebar-foreground))]">
      <div
        className={cn(
          'flex w-full items-center gap-3 rounded-xl border px-3 py-2',
          rodando ? 'border-flag-gold/60' : 'border-[hsl(var(--sidebar-border))]',
        )}
      >
        <div className="rounded-lg bg-flag-gold p-1.5">
          <TimerIcon className="h-4 w-4 text-flag-navy" />
        </div>
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              'block font-mono text-lg font-semibold leading-tight tabular-nums',
              rodando ? 'text-sidebar-foreground' : 'text-sidebar-foreground/50',
            )}
          >
            {relogio(segundos)}
          </span>
          <span className="block truncate text-xs text-sidebar-foreground/70" title={alvo ? `#${alvo.id} ${alvo.titulo}` : undefined}>
            {alvo ? `#${alvo.id} ${alvo.titulo}` : 'Escolha uma tarefa no Timer'}
          </span>
        </div>
        {rodando ? (
          <button
            type="button"
            onClick={() => acoes.pausar.mutate({ motivo: 'manual' })}
            disabled={ocupado}
            className="rounded-lg bg-white/10 p-2 hover:bg-white/20 disabled:opacity-50"
            title="Pausar"
          >
            <Pause className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              selecionada &&
              acoes.iniciar.mutate({
                id: selecionada.id,
                titulo: selecionada.title ?? `#${selecionada.id}`,
                tipo: selecionada.work_item_type ?? 'Task',
                projeto: selecionada.projeto,
              })
            }
            disabled={!selecionada || ocupado || carregando}
            className="rounded-lg bg-flag-gold p-2 text-flag-navy hover:bg-flag-gold/90 disabled:opacity-50"
            title="Iniciar"
          >
            <Play className="h-4 w-4" />
          </button>
        )}
        <Link to="/timer" className="text-xs text-flag-gold hover:underline">
          Abrir
        </Link>
      </div>
      <DialogoPresenca motor={motor} />
    </div>
  );
}
