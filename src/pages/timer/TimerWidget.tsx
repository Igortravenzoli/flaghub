import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Maximize2, Pause, Play, Square } from 'lucide-react';
import { registrarEventoTimer } from '@/hooks/useTimerAcesso';
import { useMotorTimer } from '@/hooks/useTimerRelogio';
import { DialogoPresenca } from '@/components/timer/DialogoPresenca';
import { lerSelecao } from '@/lib/timerSelecao';
import { relogio } from '@/lib/timerRelogio';
import { pedirEncerrar, ponteDesktop } from '@/lib/timerDesktop';
import { PilulaMini, BotaoMini, useFundoTransparente } from '@/components/timer/PilulaMini';
import { cn } from '@/lib/utils';

/**
 * /timer/widget: o mini timer do app desktop (Electron), uma pílula escura e
 * translúcida sempre por cima. No navegador também funciona. Mesmo motor e
 * mesmas regras de /timer: iniciar usa a tarefa escolhida em /timer.
 *
 * Encerrar pausa aqui e pede à janela completa o diálogo de lançamento (o
 * pedido atravessa pelo localStorage, que as duas janelas compartilham).
 */
export default function TimerWidget() {
  useFundoTransparente();
  const motor = useMotorTimer({ tituloDaAba: true });
  const { rodando, segundos, acoes, carregando, somenteConsulta } = motor;
  const [selecionada, setSelecionada] = useState(() => lerSelecao());

  useEffect(() => {
    void registrarEventoTimer('abriu');
    // a escolha é feita em /timer (outra janela): acompanha
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

  const abrirCompleto = () => ponteDesktop()?.abrirCompleto();

  const encerrar = () => {
    if (!rodando) return;
    const item = { id: rodando.work_item_id, titulo: rodando.titulo };
    acoes.pausar.mutate(
      { motivo: 'manual' },
      {
        onSuccess: () => {
          pedirEncerrar(item);
          abrirCompleto();
        },
      },
    );
  };

  return (
    <>
      <PilulaMini ativo={!!rodando}>
        <span
          className={cn('h-2 w-2 shrink-0 rounded-full', rodando ? 'bg-emerald-400' : 'bg-white/30')}
          aria-hidden
        />
        <span
          className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/85"
          title={alvo ? `#${alvo.id} ${alvo.titulo}` : undefined}
        >
          {carregando ? 'Timer Flag' : alvo ? alvo.titulo : 'Escolha uma tarefa'}
        </span>
        <span className={cn('font-mono text-[13px] font-semibold tabular-nums', rodando ? 'text-white' : 'text-white/45')}>
          {relogio(segundos)}
        </span>

        {rodando ? (
          <>
            <BotaoMini titulo="Pausar" onClick={() => acoes.pausar.mutate({ motivo: 'manual' })} disabled={ocupado}>
              <Pause className="h-3.5 w-3.5" />
            </BotaoMini>
            {ponteDesktop() && (
              <BotaoMini titulo="Encerrar e lançar" onClick={encerrar} disabled={ocupado}>
                <Square className="h-3.5 w-3.5" />
              </BotaoMini>
            )}
          </>
        ) : somenteConsulta ? null : (
          <BotaoMini
            titulo="Iniciar"
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
          >
            <Play className="h-3.5 w-3.5" />
          </BotaoMini>
        )}

        {ponteDesktop() ? (
          <BotaoMini titulo="Abrir o Timer" onClick={abrirCompleto}>
            <Maximize2 className="h-3.5 w-3.5" />
          </BotaoMini>
        ) : (
          <Link
            to="/timer"
            title="Abrir o Timer"
            className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Link>
        )}
      </PilulaMini>
      <DialogoPresenca motor={motor} />
    </>
  );
}
