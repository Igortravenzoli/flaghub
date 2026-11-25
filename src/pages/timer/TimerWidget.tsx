import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Maximize2, Pause, Play, Square } from 'lucide-react';
import { registrarEventoTimer } from '@/hooks/useTimerAcesso';
import { useMotorTimer } from '@/hooks/useTimerRelogio';
import { useTimerExibido } from '@/hooks/useTimerExibido';
import { DialogoPresenca } from '@/components/timer/DialogoPresenca';
import { lerSelecao } from '@/lib/timerSelecao';
import { dicaParalelos, rotuloRetomar, selecaoAberta, textoDoMiniParado } from '@/lib/timerMini';
import { relogio } from '@/lib/timerRelogio';
import { pedirEncerrar, ponteDesktop } from '@/lib/timerDesktop';
import { PilulaMini, BotaoMini, useFundoTransparente } from '@/components/timer/PilulaMini';
import { cn } from '@/lib/utils';

/**
 * /timer/widget: o mini timer do app desktop (Electron), uma pílula escura e
 * translúcida sempre por cima. No navegador também funciona. Mesmo motor e
 * mesmas regras de /timer.
 *
 * Parado, com a demanda da última tarefa iniciada em /timer ainda aberta, diz
 * "Retomar: <tarefa>" e o ▶ a retoma; encerrada a demanda, diz "Sem timer
 * ativo" e o ▶ some (25/11/2026). Parado, não há relógio.
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
  // parado: só retoma demanda que segue aberta no servidor
  const retomavel = exibido ? null : selecaoAberta(selecionada, estado?.demandas ?? null);

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
        {/* Parado, a pílula nunca mostra o nome da tarefa sozinho com 00:00:00 ao
            lado: parecia um timer aberto nela. Havendo o que retomar, diz
            "Retomar: <tarefa>", para a pessoa saber o que o ▶ inicia antes de
            clicar; sem nada a retomar, "Sem timer ativo" (escolha do Igor,
            25/11/2026). */}
        <span
          className={cn('min-w-0 flex-1 truncate text-[13px] font-medium', exibido ? 'text-white/85' : 'text-white/55')}
          title={exibido ? `#${exibido.work_item_id} ${exibido.titulo}` : retomavel ? rotuloRetomar(retomavel) : undefined}
        >
          {carregando ? 'Timer Flag' : exibido ? exibido.titulo : textoDoMiniParado(retomavel)}
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
            titulo={rotuloRetomar(retomavel)}
            onClick={() =>
              acoes.iniciar.mutate({
                id: retomavel.id,
                titulo: retomavel.title ?? `#${retomavel.id}`,
                tipo: retomavel.work_item_type ?? 'Task',
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
