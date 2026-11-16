import type { Plataforma } from '@/lib/timerAcesso';

/**
 * Onde baixar o app desktop do Timer Flag.
 *
 * Os instaladores NÃO ficam no Supabase Storage: cada download de ~100 MB é
 * egress da Supabase, que já estourou a cota em 31/08/2026. A URL vem de
 * VITE_TIMER_DOWNLOAD_BASE_URL (hospedagem definida na fase do desktop); sem
 * ela, os botões aparecem como "em breve".
 *
 * Nomes dos arquivos: fixos por plataforma, publicados a cada versão por cima
 * dos anteriores, para o link da tela nunca envelhecer.
 */
export interface DownloadTimer {
  plataforma: Exclude<Plataforma, 'outra'>;
  rotulo: string;
  formato: string;
  arquivo: string;
}

export const DOWNLOADS_TIMER: DownloadTimer[] = [
  { plataforma: 'windows', rotulo: 'Windows', formato: 'Instalador .exe', arquivo: 'TimerFlag-Setup.exe' },
  { plataforma: 'macos', rotulo: 'macOS', formato: 'Imagem .dmg', arquivo: 'TimerFlag.dmg' },
  { plataforma: 'linux', rotulo: 'Linux', formato: 'AppImage', arquivo: 'TimerFlag.AppImage' },
];

export function urlDownload(item: DownloadTimer, base: string | undefined | null): string | null {
  const limpa = (base ?? '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(limpa)) return null;
  return `${limpa}/${item.arquivo}`;
}

/** A plataforma de quem está vendo vem primeiro. */
export function ordenarDownloads(itens: DownloadTimer[], atual: Plataforma): DownloadTimer[] {
  return [...itens].sort((a, b) => Number(b.plataforma === atual) - Number(a.plataforma === atual));
}
