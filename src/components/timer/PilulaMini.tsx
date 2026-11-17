import { ReactNode, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ponteDesktop } from '@/lib/timerDesktop';

/**
 * A pílula do mini timer (/timer/widget): escura, translúcida, esmaecida em
 * repouso e nítida com o mouse em cima. No app desktop a janela é
 * transparente; a pílula inteira arrasta a janela, menos os botões.
 */
export function PilulaMini({ ativo = false, children }: { ativo?: boolean; children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center p-1.5">
      <div
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        className={cn(
          'flex h-10 w-full select-none items-center gap-2 rounded-full border px-3 shadow-lg backdrop-blur',
          'bg-slate-900/75 opacity-80 transition-opacity duration-200 hover:opacity-100',
          ativo ? 'border-white/15' : 'border-white/10',
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function BotaoMini({
  titulo,
  onClick,
  disabled,
  children,
}: {
  titulo: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      aria-label={titulo}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className="rounded-md p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * No app desktop a janela do mini é transparente: o fundo da página também
 * precisa ser, senão aparece um retângulo atrás da pílula.
 */
export function useFundoTransparente() {
  useEffect(() => {
    if (!ponteDesktop()) return;
    const html = document.documentElement;
    const body = document.body;
    const antes = [html.style.background, body.style.background];
    html.style.background = 'transparent';
    body.style.background = 'transparent';
    return () => {
      html.style.background = antes[0];
      body.style.background = antes[1];
    };
  }, []);
}
