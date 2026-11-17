import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from './ThemeProvider';

/**
 * Botão único: clarear ou escurecer. O padrão é o tema do sistema; o clique
 * troca para o oposto do que está na tela e guarda a escolha.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const escuro = resolvedTheme === 'dark';
  const rotulo = escuro ? 'Clarear' : 'Escurecer';

  return (
    <button
      type="button"
      onClick={() => setTheme(escuro ? 'light' : 'dark')}
      title={rotulo}
      aria-label={rotulo}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-current opacity-70 transition hover:bg-white/10 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flag-gold/60',
        className,
      )}
    >
      {escuro ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
