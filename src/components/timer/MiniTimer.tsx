import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pause, PictureInPicture2 } from 'lucide-react';
import type { MotorTimer } from '@/hooks/useTimerRelogio';
import { useTimerExibido } from '@/hooks/useTimerExibido';
import { dicaParalelos } from '@/lib/timerMini';
import { relogio } from '@/lib/timerRelogio';
import { temMiniTimer } from '@/lib/timerPwa';
import { ponteDesktop } from '@/lib/timerDesktop';
import { BotaoIcone } from '@/components/timer/visual';

interface DocumentPip {
  requestWindow: (o: { width: number; height: number }) => Promise<Window>;
}

/** Copia o CSS da página para a janela flutuante (mesmas classes do Tailwind). */
function copiarEstilos(destino: Window) {
  for (const folha of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(folha.cssRules).map((r) => r.cssText).join('\n');
      const style = destino.document.createElement('style');
      style.textContent = css;
      destino.document.head.appendChild(style);
    } catch {
      if (folha.href) {
        const link = destino.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = folha.href;
        destino.document.head.appendChild(link);
      }
    }
  }
  destino.document.documentElement.className = document.documentElement.className;
}

/**
 * Mini timer sempre por cima das outras janelas (Chrome/Edge, Document
 * Picture-in-Picture). No app desktop, o botão abre o widget do próprio app.
 * O conteúdo é um portal da mesma árvore: mesmo motor, mesmo estado.
 */
export function MiniTimer({ motor }: { motor: MotorTimer }) {
  const [janela, setJanela] = useState<Window | null>(null);
  const ponte = ponteDesktop();

  useEffect(() => () => janela?.close(), [janela]);

  if (!ponte && !temMiniTimer()) return null;

  const abrir = async () => {
    if (ponte) {
      ponte.abrirMini();
      return;
    }
    if (janela) {
      janela.focus();
      return;
    }
    const pip = (window as unknown as { documentPictureInPicture: DocumentPip }).documentPictureInPicture;
    const w = await pip.requestWindow({ width: 340, height: 92 });
    copiarEstilos(w);
    w.document.title = 'Timer Flag';
    w.document.body.className = 'm-0 bg-background text-foreground';
    w.addEventListener('pagehide', () => setJanela(null));
    setJanela(w);
  };

  return (
    <>
      <BotaoIcone icone={PictureInPicture2} rotulo="Mini timer flutuante" variante="ghost" onClick={() => void abrir()} />
      {janela && createPortal(<ConteudoMini motor={motor} />, janela.document.body)}
    </>
  );
}

/**
 * O que aparece na janela flutuante. Com timers em paralelo mostra um por vez:
 * o "1/2" passa ao próximo e o Pausar vale para o que está à vista (25/11/2026).
 */
function ConteudoMini({ motor }: { motor: MotorTimer }) {
  const { rodandoTodos, acoes } = motor;
  const { exibido, posicao, total, segundos, proximo } = useTimerExibido(motor);
  return (
    <div className="flex h-screen items-center gap-3 bg-[hsl(var(--sidebar-background))] px-3 text-[hsl(var(--sidebar-foreground))]">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${exibido ? 'bg-flag-gold' : 'bg-white/30'}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-xl font-semibold leading-tight tabular-nums">{relogio(segundos)}</p>
        <p className="truncate text-xs opacity-75" title={exibido ? `#${exibido.work_item_id} ${exibido.titulo}` : undefined}>
          {exibido ? `#${exibido.work_item_id} ${exibido.titulo}` : 'Sem timer ativo'}
        </p>
      </div>
      {exibido && total > 1 && (
        <button
          type="button"
          className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold tabular-nums hover:bg-white/20"
          onClick={proximo}
          title={dicaParalelos(rodandoTodos)}
          aria-label={`Timer ${posicao + 1} de ${total} em paralelo: ver o próximo`}
        >
          {posicao + 1}/{total}
        </button>
      )}
      {exibido && (
        <button
          type="button"
          className="rounded-lg bg-white/10 p-2 hover:bg-white/20 disabled:opacity-50"
          disabled={acoes.pausar.isPending}
          onClick={() => acoes.pausar.mutate({ motivo: 'manual', workItemId: exibido.work_item_id })}
          aria-label="Pausar"
          title="Pausar"
        >
          <Pause className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
