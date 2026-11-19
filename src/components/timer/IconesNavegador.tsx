import type { InstrucaoNavegador } from '@/lib/timerAbaCongelada';

/**
 * Ícones dos navegadores no aviso da aba congelada. Formas simples desenhadas
 * à mão (o lucide não tem marcas), só para a pessoa reconhecer o seu.
 */
export function IconeNavegador({ id, className }: { id: InstrucaoNavegador['id']; className?: string }) {
  if (id === 'edge') return <IconeEdge className={className} />;
  if (id === 'firefox') return <IconeFirefox className={className} />;
  return (
    <span className="flex items-center -space-x-1.5">
      <IconeChrome className={className} />
      <IconeBrave className={className} />
    </span>
  );
}

function IconeChrome({ className }: { className?: string }) {
  // três fatias de 120° em volta do centro azul
  const fatia = (a: number) => {
    const r = (g: number) => (g * Math.PI) / 180;
    const x1 = 12 + 10 * Math.cos(r(a));
    const y1 = 12 + 10 * Math.sin(r(a));
    const x2 = 12 + 10 * Math.cos(r(a + 120));
    const y2 = 12 + 10 * Math.sin(r(a + 120));
    return `M12 12 L${x1.toFixed(2)} ${y1.toFixed(2)} A10 10 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
  };
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d={fatia(-150)} fill="#DB4437" />
      <path d={fatia(-30)} fill="#F4B400" />
      <path d={fatia(90)} fill="#0F9D58" />
      <circle cx="12" cy="12" r="4.6" fill="#fff" />
      <circle cx="12" cy="12" r="3.6" fill="#4285F4" />
    </svg>
  );
}

function IconeBrave({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 2.2 19.4 5l-.9 9.6c-.2 1.9-1.3 3.6-3 4.6L12 21.8l-3.5-2.6c-1.7-1-2.8-2.7-3-4.6L4.6 5Z" fill="#FB542B" />
      <path d="M9 9.2h6l-1 4.4L12 15.6l-2-2Z" fill="#fff" />
    </svg>
  );
}

function IconeEdge({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id="edge-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#35C1F1" />
          <stop offset="0.55" stopColor="#1C8FD9" />
          <stop offset="1" stopColor="#2FB45A" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#edge-g)" />
      <path d="M6.5 13.5c0-3.4 2.6-5.6 5.8-5.6 2.7 0 4.7 1.6 4.7 3.6 0 1.2-.9 1.9-2.4 1.9H9.9c.2 2 1.9 3.3 4.3 3.3 1.3 0 2.5-.3 3.6-.9-1.3 1.9-3.4 3-5.7 3-3.2 0-5.6-2.2-5.6-5.3Z" fill="#fff" opacity="0.92" />
    </svg>
  );
}

function IconeFirefox({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#7542E5" />
      <path d="M12 2a10 10 0 1 0 9.6 7.2c-.5 1.6-1.6 2.4-2.6 2.4.4-2.8-1.4-5.3-4-6.2.8 1.2.9 2.6.2 3.6-1-1.4-2.6-1.8-4-1.2 1.6.3 2.6 1.6 2.6 3.1 0 1.8-1.6 3.2-3.5 3.2-2.2 0-3.9-1.8-3.6-4.2C5.2 15 7.9 19.5 12.6 19.5 16.9 19.5 20 16 20 12" fill="#FF7139" />
    </svg>
  );
}
