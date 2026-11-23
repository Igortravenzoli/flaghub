/**
 * Fábricas de uma FOTO de sprint (selada ou da série diária) — fonte única dos
 * cards de entrega (ranking, qualidade, evolução diária, linha por fábrica).
 *
 * Desde 23/11/2026 a foto traz duas chaves:
 * - `fabricas`: o formato ANTERIOR, pelo título do Épico raiz ([K8], [FLEXX]…).
 *   Foto é imutável, então as sprints antigas só têm esta.
 * - `fabricas_org`: o organograma, pela PESSOA (regra de 22/11/2026): o item é
 *   da fábrica de entrega que mais lançou hora nele; sem hora, da área/Épico do
 *   item; sem destino, da casa do responsável (ver a migration
 *   20261123120000_fabrica_org_na_foto.sql).
 *
 * Os dois formatos não se misturam numa conta: K8 de uma sprint e GPS/GO da
 * seguinte não são a mesma fábrica. A janela segue o formato da sprint mais
 * recente e declara quantas ficaram de fora (`recortePorFormato`).
 */
import type { SnapshotScopeBreakdown } from '@/hooks/useSprintSnapshots';
import { cleanFabricaName } from '@/lib/fabricaNames';
import { SQUADS } from '@/lib/fabricaRoster';
import { CODIGOS_FABRICA, FABRICAS, fabricaOrg, rotuloFabricaLongo } from '@/lib/fabricaOrganograma';

export type FormatoFoto = 'organograma' | 'anterior';

/** O que os cards leem do `category_breakdown` de uma foto. */
export type BreakdownFoto = {
  fabricas?: Record<string, SnapshotScopeBreakdown> | null;
  fabricas_org?: Record<string, SnapshotScopeBreakdown> | null;
} | null | undefined;

/** Fábricas que podem receber item no organograma: de entrega e do formato atual. */
export const FABRICAS_DE_ENTREGA: string[] = FABRICAS
  .filter((f) => f.entrega && f.grupo !== 'ANTERIOR')
  .map((f) => f.codigo);

/** Teto de fábricas numa coluna de gráfico, nos dois formatos. */
export const MAX_FABRICAS_FOTO = Math.max(SQUADS.length, FABRICAS_DE_ENTREGA.length);

export function formatoDaFoto(cb: BreakdownFoto): FormatoFoto {
  return cb?.fabricas_org ? 'organograma' : 'anterior';
}

/**
 * Fábricas da foto no formato pedido (padrão: o da própria foto). Só fábrica de
 * verdade: "Sem fábrica", áreas de apoio e Épicos soltos ficam de fora — com
 * score 0 eles passariam NA FRENTE no pódio e virariam séries extras.
 */
export function fabricasDaFoto(cb: BreakdownFoto, formato: FormatoFoto = formatoDaFoto(cb)): Record<string, SnapshotScopeBreakdown> {
  const out: Record<string, SnapshotScopeBreakdown> = {};
  if (formato === 'organograma') {
    for (const [codigo, scope] of Object.entries(cb?.fabricas_org ?? {})) {
      if (FABRICAS_DE_ENTREGA.includes(codigo)) out[codigo] = scope;
    }
    return out;
  }
  for (const [raw, scope] of Object.entries(cb?.fabricas ?? {})) {
    const nome = cleanFabricaName(raw);
    if (SQUADS.includes(nome)) out[nome] = scope;
  }
  return out;
}

/** Nome para a tela: código do organograma vira rótulo ("ERP · Sustentação"); o resto volta como veio. */
export function rotuloFabricaFoto(nome: string): string {
  return fabricaOrg(nome) ? rotuloFabricaLongo(nome) : nome;
}

/** Ordem de leitura: a do organograma, depois a das squads antigas. */
export function ordemFabricaFoto(nome: string): number {
  const i = CODIGOS_FABRICA.indexOf(nome);
  if (i >= 0) return i;
  const j = SQUADS.indexOf(nome);
  return j >= 0 ? 100 + j : 999;
}

/**
 * Recorta uma janela de fotos (em ordem cronológica) para o formato da MAIS
 * RECENTE. `fora` = quantas fotos da janela ficaram de fora por estarem no
 * outro formato — os cards declaram isso no rodapé, nunca somem em silêncio.
 */
export function recortePorFormato<T extends { category_breakdown?: BreakdownFoto }>(
  fotos: T[],
): { fotos: T[]; formato: FormatoFoto; fora: number } {
  if (fotos.length === 0) return { fotos, formato: 'anterior', fora: 0 };
  const formato = formatoDaFoto(fotos[fotos.length - 1].category_breakdown);
  const dentro = fotos.filter((f) => formatoDaFoto(f.category_breakdown) === formato);
  return { fotos: dentro, formato, fora: fotos.length - dentro.length };
}

/** Frase do rodapé para o que ficou de fora da janela (vazio quando nada ficou). */
export function avisoForaDoFormato(fora: number, formato: FormatoFoto): string {
  if (fora <= 0) return '';
  const quem = fora === 1 ? '1 sprint' : `${fora} sprints`;
  const ficou = fora === 1 ? 'ficou' : 'ficaram';
  return formato === 'organograma'
    ? `${quem} anterior${fora === 1 ? '' : 'es'} ao organograma (foto por Épico) ${ficou} fora da conta.`
    : `${quem} já no organograma ${ficou} fora da conta.`;
}
