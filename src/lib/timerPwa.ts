/**
 * Timer instalado pelo navegador (PWA), só nas rotas do Timer:
 *   • o manifest e o service worker entram quando a tela do Timer abre (o
 *     resto do FlagHub não vira app instalável);
 *   • o "Instalar app" do Chrome/Edge chega pelo evento beforeinstallprompt,
 *     guardado aqui para o botão do popup usar na hora.
 */

interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let pedidoInstalar: EventoInstalar | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

let preparado = false;

/** Liga o PWA (manifest, cor do tema e service worker). Idempotente. */
export function prepararPwaTimer(): void {
  if (preparado || typeof document === 'undefined') return;
  preparado = true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pedidoInstalar = e as EventoInstalar;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    pedidoInstalar = null;
    avisar();
  });

  if (!document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/timer/manifest.webmanifest';
    document.head.appendChild(link);
  }
  if (!document.querySelector('meta[name="theme-color"]')) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#0F172A';
    document.head.appendChild(meta);
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/timer-sw.js', { scope: '/timer' }).catch(() => {
      // sem service worker o Timer funciona igual; só não oferece instalar
    });
  }
}

export function podeInstalar(): boolean {
  return pedidoInstalar !== null;
}

/** Abre o "Instalar app" do navegador. true = a pessoa aceitou. */
export async function instalarPwa(): Promise<boolean> {
  if (!pedidoInstalar) return false;
  const p = pedidoInstalar;
  await p.prompt();
  const r = await p.userChoice;
  pedidoInstalar = null;
  avisar();
  return r.outcome === 'accepted';
}

export function aoMudarInstalacao(f: () => void): () => void {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

/** Já está rodando como app instalado (janela própria)? */
export function rodandoInstalado(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: window-controls-overlay)').matches;
}

/** Chrome/Edge com Document Picture-in-Picture (mini timer sempre por cima). */
export function temMiniTimer(): boolean {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
}

/** Chrome/Edge com detecção de ausência (Idle Detection). */
export function temDeteccaoAusencia(): boolean {
  return typeof window !== 'undefined' && 'IdleDetector' in window;
}
