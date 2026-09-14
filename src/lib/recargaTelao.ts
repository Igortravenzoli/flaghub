import { useEffect } from 'react';
import { foraDoExpediente } from '@/lib/politicaCacheTelao';

/**
 * Recarga automática do telão quando sai build nova — egress, 14/09/2026.
 *
 * O telão nunca recarregava: o kiosk sobe uma vez por carga de página e fica no
 * ar por semanas. Em 14/09/2026 ele ainda rodava um bundle anterior ao PR #72,
 * publicado três dias antes — a correção do SGSI existia em produção e não
 * existia na TV, que seguia baixando o espelho em dobro.
 *
 * Como funciona: fora do expediente, a cada 15 min, busca o `index.html` no host
 * estático (Vercel — nada passa pela Supabase) e compara o script de entrada com
 * hash (`/assets/index-XXXX.js`) com o que está carregado. Mudou, recarrega. A
 * config da rotação está no localStorage e o login também persiste, então a TV
 * volta exibindo o mesmo que antes.
 *
 * Travas:
 *   • só fora do expediente: ninguém vê a tela piscar e a carga fria de todos os
 *     setores (~3 MB) não cai em horário de uso;
 *   • o mesmo alvo não é tentado de novo por 6 h: se o CDN entregar o HTML novo
 *     à checagem e o velho à navegação, a TV não entra em laço de recarga (cada
 *     volta seria uma carga fria inteira);
 *   • sem localStorage não há como registrar a tentativa, então não recarrega;
 *   • sem rede, não tenta;
 *   • com a página em tela cheia de ELEMENTO (botão de tela cheia do app), não
 *     recarrega: essa tela cheia não volta sem um clique e a TV ficaria com a
 *     barra do navegador à mostra. Com o Chrome em `--kiosk` (ou F11) a tela
 *     cheia é do navegador, sobrevive à recarga e a atualização segue;
 *   • em desenvolvimento o script de entrada não está em `/assets/`: nada acontece.
 *
 * Risco aceito: uma build que passa nos testes mas quebra em tempo de execução é
 * pega à noite; o React desmonta, a checagem para junto e a TV fica em branco
 * até alguém dar F5. Antes desta mudança ela seguia na última build que
 * funcionava.
 */

export const INTERVALO_CHECAGEM_MS = 15 * 60_000;
export const JANELA_NOVA_TENTATIVA_MS = 6 * 60 * 60_000;
export const CHAVE_TENTATIVA_RECARGA = 'flaghub:telao-recarga';

const ENTRADA_DE_BUILD = /^\/assets\/[^/]+\.js$/;

/** Script de entrada com hash no HTML publicado, ou null (dev ou HTML inesperado). */
export function extrairEntrada(html: string): string | null {
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    if (!/\btype=["']module["']/i.test(tag)) continue;
    const src = /\bsrc=["']([^"']+)["']/i.exec(tag)?.[1];
    if (src && ENTRADA_DE_BUILD.test(src)) return src;
  }
  return null;
}

/** Script de entrada com hash desta página, ou null em desenvolvimento. */
export function entradaCarregada(doc: Document = document): string | null {
  for (const script of Array.from(doc.querySelectorAll('script[type="module"][src]'))) {
    const src = script.getAttribute('src');
    if (src && ENTRADA_DE_BUILD.test(src)) return src;
  }
  return null;
}

interface TentativaRecarga {
  alvo: string;
  em: number;
}

function lerTentativa(armazenamento: Storage): TentativaRecarga | null {
  try {
    const bruto = armazenamento.getItem(CHAVE_TENTATIVA_RECARGA);
    if (!bruto) return null;
    const t = JSON.parse(bruto) as Partial<TentativaRecarga>;
    return typeof t.alvo === 'string' && typeof t.em === 'number' ? { alvo: t.alvo, em: t.em } : null;
  } catch {
    return null;
  }
}

function gravarTentativa(armazenamento: Storage, tentativa: TentativaRecarga): boolean {
  try {
    armazenamento.setItem(CHAVE_TENTATIVA_RECARGA, JSON.stringify(tentativa));
    return true;
  } catch {
    return false;
  }
}

export function deveRecarregar(p: {
  atual: string | null;
  publicada: string | null;
  ultimaTentativa: TentativaRecarga | null;
  agora: number;
}): boolean {
  if (!p.atual || !p.publicada || p.atual === p.publicada) return false;
  const t = p.ultimaTentativa;
  if (t && t.alvo === p.publicada && p.agora - t.em < JANELA_NOVA_TENTATIVA_MS) return false;
  return true;
}

function localStorageDisponivel(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function navegadorOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export interface DependenciasChecagem {
  agora?: () => Date;
  buscar?: (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'text'>>;
  recarregar?: () => void;
  doc?: Document;
  armazenamento?: Storage | null;
  online?: () => boolean;
}

let avisouTelaCheia = false;

/** Uma checagem. Devolve true quando mandou recarregar. Nunca lança. */
export async function checarNovaVersao(dep: DependenciasChecagem = {}): Promise<boolean> {
  const agora = dep.agora?.() ?? new Date();
  if (!foraDoExpediente(agora)) return false;

  const doc = dep.doc ?? document;
  const atual = entradaCarregada(doc);
  if (!atual) return false;

  if (doc.fullscreenElement) {
    if (!avisouTelaCheia) {
      avisouTelaCheia = true;
      console.warn(
        '[telão] Página em tela cheia de elemento: a atualização automática fica desligada, porque a tela ' +
          'cheia não volta sem um clique. Suba o Chrome com --kiosk para a TV se atualizar sozinha.',
      );
    }
    return false;
  }

  if (!(dep.online ?? navegadorOnline)()) return false;

  const armazenamento = dep.armazenamento !== undefined ? dep.armazenamento : localStorageDisponivel();
  if (!armazenamento) return false;

  try {
    const buscar = dep.buscar ?? ((url: string, init: RequestInit) => fetch(url, init));
    const resposta = await buscar(`/index.html?telao=${agora.getTime()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!resposta.ok) return false;

    const publicada = extrairEntrada(await resposta.text());
    const recarrega = deveRecarregar({
      atual,
      publicada,
      ultimaTentativa: lerTentativa(armazenamento),
      agora: agora.getTime(),
    });
    if (!recarrega || !publicada) return false;
    if (!gravarTentativa(armazenamento, { alvo: publicada, em: agora.getTime() })) return false;

    (dep.recarregar ?? (() => window.location.reload()))();
    return true;
  } catch {
    return false;
  }
}

/** Liga a checagem periódica enquanto `ativo` (monitor com o kiosk no ar). */
export function useRecargaAutomaticaTelao(ativo: boolean): void {
  useEffect(() => {
    if (!ativo) return;
    const id = window.setInterval(() => {
      void checarNovaVersao();
    }, INTERVALO_CHECAGEM_MS);
    return () => window.clearInterval(id);
  }, [ativo]);
}
