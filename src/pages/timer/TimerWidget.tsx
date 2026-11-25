import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Maximize2, Pause, Play, Square } from 'lucide-react';
import { registrarEventoTimer } from '@/hooks/useTimerAcesso';
import { useMotorTimer } from '@/hooks/useTimerRelogio';
import { useTimerExibido } from '@/hooks/useTimerExibido';
import { DialogoPresenca } from '@/components/timer/DialogoPresenca';
import { dicaParalelos, rotuloRetomar, ultimaTrabalhada } from '@/lib/timerMini';
import { relogio } from '@/lib/timerRelogio';
import { pedirEncerrar, ponteDesktop } from '@/lib/timerDesktop';
import { PilulaMini, BotaoMini, useFundoTransparente } from '@/components/timer/PilulaMini';
import { cn } from '@/lib/utils';

/**
 * /timer/widget: o mini timer do app desktop (Electron), uma pílula escura e
 * translúcida sempre por cima. No navegador também funciona. Mesmo motor e
 * mesmas regras de /timer.
 *
 * Parado, diz sempre "Sem timer ativo", sem nome de tarefa nem relógio. O ▶
 * retoma a última tarefa trabalhada que segue com a demanda aberta, lida do
 * servidor; a dica do botão diz qual é. Sem demanda aberta, o ▶ some
 * (25/11/2026).
 *
 * Com timers em paralelo, mostra um por vez: o "1/2" passa ao próximo, e
 * Pausar/Encerrar valem para o que está à vista.
 *
 * Encerrar pausa aqui e pede à janela completa o diálogo de lançamento (o
 * pedido atravessa pelo localStorage, que as duas janelas compartilham).
 */
export default function TimerWidget() {
  useFundoTransparente();
  const motor = useMotorTimer({ tituloDaAba: true });
  const { rodandoTodos, acoes, carregando, somenteConsulta, estado } = motor;
  const { exibido, posicao, total, segundos, proximo } = useTimerExibido(motor);

  useEffect(() => {
    void registrarEventoTimer('abriu');
  }, []);

  const ocupado = acoes.iniciar.isPending || acoes.pausar.isPending;
  // Parado: o ▶ retoma a última tarefa trabalhada que segue aberta, pelo que o
  // servidor diz (não pela escolha guardada neste navegador, que só conhecia o
  // que foi iniciado pela janela completa e ficava para trás).
  const retomavel = exibido || !estado ? null : ultimaTrabalhada(estado.demandas, estado.trechos);

  const abrirCompleto = () => ponteDesktop()?.abrirCompleto();

  const encerrar = () => {
    if (!exibido) return;
    const item = { id: exibido.work_item_id, titulo: exibido.titulo, tipo: exibido.tipo };
    acoes.pausar.mutate(
      { motivo: 'manual', workItemId: item.id },
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
      <PilulaMini ativo={!!exibido}>
        <span
          // rodando: verde piscando leve, para mostrar que está em atividade
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            exibido ? 'animate-[pulse_2.4s_ease-in-out_infinite] bg-emerald-400' : 'bg-white/30',
          )}
          aria-hidden
        />
        {/* Pausou, a pílula fica em "Sem timer ativo": nome de tarefa só com o
            timer RODANDO (escolha do Igor, 25/11/2026; com o nome ali, mesmo
            precedido de "Retomar:", parecia que o título anterior tinha ficado).
            O que o ▶ retoma está na dica do botão. */}
        <span
          className={cn('min-w-0 flex-1 truncate text-[13px] font-medium', exibido ? 'text-white/85' : 'text-white/55')}
          title={exibido ? `#${exibido.work_item_id} ${exibido.titulo}` : undefined}
        >
          {carregando ? 'Timer Flag' : exibido ? exibido.titulo : 'Sem timer ativo'}
        </span>
        {exibido && total > 1 && (
          <button
            type="button"
            onClick={proximo}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className="shrink-0 rounded-full bg-white/15 px-1.5 text-[11px] font-semibold tabular-nums text-white/85 transition hover:bg-white/25"
            title={dicaParalelos(rodandoTodos)}
            aria-label={`Timer ${posicao + 1} de ${total} em paralelo: ver o próximo`}
          >
            {posicao + 1}/{total}
          </button>
        )}
        {exibido && <span className="font-mono text-[13px] font-semibold tabular-nums text-white">{relogio(segundos)}</span>}

        {exibido ? (
          <>
            <BotaoMini
              titulo="Pausar"
              onClick={() => acoes.pausar.mutate({ motivo: 'manual', workItemId: exibido.work_item_id })}
              disabled={ocupado}
            >
              <Pause className="h-3.5 w-3.5" />
            </BotaoMini>
            {ponteDesktop() && (
              <BotaoMini titulo="Encerrar e lançar" onClick={encerrar} disabled={ocupado}>
                <Square className="h-3.5 w-3.5" />
              </BotaoMini>
            )}
          </>
        ) : somenteConsulta || !retomavel ? null : (
          <BotaoMini
            titulo={rotuloRetomar({ id: retomavel.work_item_id, title: retomavel.titulo })}
            onClick={() =>
              acoes.iniciar.mutate({
                id: retomavel.work_item_id,
                titulo: retomavel.titulo || `#${retomavel.work_item_id}`,
                tipo: retomavel.tipo || 'Task',
                projeto: retomavel.projeto,
              })
            }
            disabled={ocupado || carregando}
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
      {/* No app desktop as perguntas abrem na janela completa (o motor a traz
          para a frente): na pílula de 320×52 não dá para ler. */}
      {!ponteDesktop() && <DialogoPresenca motor={motor} />}
    </>
  );
}
