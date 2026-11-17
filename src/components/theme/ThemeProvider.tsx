import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';
type TemaAplicado = 'dark' | 'light';

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  /** O tema que está de fato na tela ('system' já resolvido). */
  resolvedTheme: TemaAplicado;
  setTheme: (theme: Theme) => void;
};

const temaDoSistema = (): TemaAplicado =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const initialState: ThemeProviderState = {
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

/**
 * Padrão = o tema do sistema (decisão do Igor, 16/11/2026: herda sem perguntar).
 * Enquanto a pessoa não escolher, acompanha a troca do sistema ao vivo; quando
 * ela usa o botão, a escolha fica salva.
 */
export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'flag-ui-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(storageKey) as Theme) || defaultTheme;
    } catch {
      return defaultTheme;
    }
  });
  const [sistema, setSistema] = useState<TemaAplicado>(temaDoSistema);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const aoMudar = () => setSistema(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);

  const resolvedTheme: TemaAplicado = theme === 'system' ? sistema : theme;

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
  }, [resolvedTheme]);

  const value = {
    theme,
    resolvedTheme,
    setTheme: (t: Theme) => {
      try {
        localStorage.setItem(storageKey, t);
      } catch {
        /* sem storage: vale só nesta visita */
      }
      setTheme(t);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};
