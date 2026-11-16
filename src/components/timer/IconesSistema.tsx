import { Apple } from 'lucide-react';
import type { Plataforma } from '@/lib/timerAcesso';

/**
 * Ícones dos sistemas na área de download. Desenhados à mão com formas
 * simples (o lucide não tem marcas): o de Windows são os quatro quadrados, o
 * de macOS é a maçã do lucide e o de Linux é um pinguim estilizado.
 */
export function IconeSistema({ plataforma, className }: { plataforma: Plataforma; className?: string }) {
  if (plataforma === 'windows') return <IconeWindows className={className} />;
  if (plataforma === 'macos') return <Apple className={className} aria-hidden />;
  if (plataforma === 'linux') return <IconeLinux className={className} />;
  return null;
}

function IconeWindows({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <rect x="2" y="2" width="9.5" height="9.5" rx="0.6" />
      <rect x="12.5" y="2" width="9.5" height="9.5" rx="0.6" />
      <rect x="2" y="12.5" width="9.5" height="9.5" rx="0.6" />
      <rect x="12.5" y="12.5" width="9.5" height="9.5" rx="0.6" />
    </svg>
  );
}

function IconeLinux({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {/* corpo */}
      <ellipse cx="12" cy="13.5" rx="6.5" ry="8.5" fill="currentColor" />
      {/* barriga */}
      <ellipse cx="12" cy="15.5" rx="4.2" ry="5.6" fill="hsl(var(--background))" />
      {/* olhos */}
      <circle cx="10.3" cy="8.2" r="1.25" fill="hsl(var(--background))" />
      <circle cx="13.7" cy="8.2" r="1.25" fill="hsl(var(--background))" />
      <circle cx="10.5" cy="8.4" r="0.55" fill="currentColor" />
      <circle cx="13.5" cy="8.4" r="0.55" fill="currentColor" />
      {/* bico e pés */}
      <path d="M10.4 10.2 L13.6 10.2 L12 12 Z" fill="#F5B301" />
      <ellipse cx="8.6" cy="21.6" rx="2.4" ry="1.1" fill="#F5B301" />
      <ellipse cx="15.4" cy="21.6" rx="2.4" ry="1.1" fill="#F5B301" />
    </svg>
  );
}
