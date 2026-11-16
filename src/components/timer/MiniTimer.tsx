import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pause, PictureInPicture2 } from 'lucide-react';
import type { MotorTimer } from '@/hooks/useTimerRelogio';
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

  const { rodando, segundos, acoes } = motor;

  return (
    <>
      <BotaoIcone icone={PictureInPicture2} rotulo="Mini timer flutuante" variante="ghost" onClick={() => void abrir()} />
      {janela &&
        createPortal(
          <div className="flex h-screen items-center gap-3 bg-[hsl(var(--sidebar-background))] px-3 text-[hsl(var(--sidebar-foreground))]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-flag-gold" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xl font-semibold leading-tight tabular-nums">{relogio(segundos)}</p>
              <p className="truncate text-xs opacity-75">{rodando ? `#${rodando.work_item_id} ${rodando.titulo}` : 'Nada rodando'}</p>
            </div>
            {rodando && (
              <button
                type="button"
                className="rounded-lg bg-white/10 p-2 hover:bg-white/20 disabled:opacity-50"
                disabled={acoes.pausar.isPending}
                onClick={() => acoes.pausar.mutate({ motivo: 'manual' })}
                aria-label="Pausar"
                title="Pausar"
              >
                <Pause className="h-4 w-4" />
              </button>
            )}
          </div>,
          janela.document.body,
        )}
    </>
  );
}
