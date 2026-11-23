/**
 * Fábricas de uma FOTO de sprint (selada ou da série diária) — fonte única dos
 * cards de entrega (ranking, qualidade, evolução diária, linha por fábrica,
 * aba Gerencial e relatório).
 *
 * A fábrica do item é a do organograma, pela PESSOA (regra de 22/11/2026): a
 * fábrica de entrega que mais lançou hora nele; sem hora, a da área/Épico do
 * item; sem destino, a casa do responsável (migration
 * 20261123120000_fabrica_org_na_foto.sql). Ela mora em `fabricas_org`.
 *
 * Desde a F4 (23/11/2026) os cards leem SÓ essa chave. A chave antiga
 * `fabricas` (título do Épico raiz: [K8], [FLEXX]…) continua gravada em toda
 * foto — é o histórico por Épico, e fica disponível se a régua mudar —, mas não
 * entra mais em conta nenhuma: K8 e FLEXX não são fábricas do organograma.
 * Foto sem `fabricas_org` (até a S13, sem ids para reconstruir) fica FORA da
 * conta e é declarada no rodapé (`recorteOrganograma`), nunca some em silêncio.
 */
import type { SnapshotScopeBreakdown } from '@/hooks/useSprintSnapshots';
import { fabricaColor } from '@/lib/chartColors';
import {
  CODIGOS_FABRICA, FABRICAS, fabricaOrg, GRUPOS, type GrupoFabrica, type GrupoId, rotuloFabricaLongo,
} from '@/lib/fabricaOrganograma';

/** O que os cards leem do `category_breakdown` de uma foto. */
export type BreakdownFoto = {
  fabricas_org?: Record<string, SnapshotScopeBreakdown> | null;
} | null | undefined;

/** Fábricas que podem receber item: as de entrega do organograma. */
export const FABRICAS_DE_ENTREGA: string[] = FABRICAS.filter((f) => f.entrega).map((f) => f.codigo);

/** Teto de fábricas numa coluna de gráfico. */
export const MAX_FABRICAS_FOTO = FABRICAS_DE_ENTREGA.length;

/** Grupos que têm fábrica de entrega (Sustentação, Evolução, Híbrida), na ordem do organograma. */
export const GRUPOS_DE_ENTREGA: GrupoFabrica[] = GRUPOS.filter((g) =>
  FABRICAS.some((f) => f.grupo === g.id && FABRICAS_DE_ENTREGA.includes(f.codigo)));

/** Grupo de uma fábrica de entrega; null para o resto ("Sem fábrica", área de apoio). */
export function grupoDeEntrega(codigo: string): GrupoFabrica | null {
  const f = fabricaOrg(codigo);
  if (!f || !FABRICAS_DE_ENTREGA.includes(codigo)) return null;
  return GRUPOS_DE_ENTREGA.find((g) => g.id === f.grupo) ?? null;
}

/**
 * Soma de escopos: o grupo é a SOMA das fábricas (contagens e ids), nunca média
 * de percentuais — fábrica de 4 itens pesaria igual à de 21. Os ids só existem
 * se todas as partes têm (fotos anteriores à SN-7 não guardam ids).
 */
export function somarEscopos(partes: SnapshotScopeBreakdown[]): SnapshotScopeBreakdown | null {
  if (partes.length === 0) return null;
  const soma = <T extends Record<string, number>>(sel: (s: SnapshotScopeBreakdown) => T): T => {
    const out = {} as Record<string, number>;
    for (const p of partes) for (const [k, v] of Object.entries(sel(p))) out[k] = (out[k] ?? 0) + (Number(v) || 0);
    return out as T;
  };
  const comIds = partes.every((p) => p.ids);
  return {
    total: partes.reduce((s, p) => s + p.total, 0),
    cats: soma((p) => p.cats),
    entregue: soma((p) => p.entregue),
    done: soma((p) => p.done),
    ...(comIds ? {
      ids: {
        entregue: partes.flatMap((p) => p.ids!.entregue),
        done: partes.flatMap((p) => p.ids!.done),
        bug: partes.flatMap((p) => p.ids!.bug),
        retorno_qa: partes.flatMap((p) => p.ids!.retorno_qa),
      },
    } : {}),
    priorizado_done: partes.reduce((s, p) => s + (p.priorizado_done ?? 0), 0),
    priorizado_em_dev: partes.reduce((s, p) => s + (p.priorizado_em_dev ?? 0), 0),
  };
}

/** Escopos de uma foto (já lidos com `fabricasDaFoto`) somados por grupo do organograma. */
export function escoposPorGrupo(fabricas: Record<string, SnapshotScopeBreakdown>): Partial<Record<GrupoId, SnapshotScopeBreakdown>> {
  const out: Partial<Record<GrupoId, SnapshotScopeBreakdown>> = {};
  for (const g of GRUPOS_DE_ENTREGA) {
    const partes = Object.entries(fabricas).filter(([c]) => grupoDeEntrega(c)?.id === g.id).map(([, s]) => s);
    const total = somarEscopos(partes);
    if (total) out[g.id] = total;
  }
  return out;
}

/** A foto tem a fábrica do organograma? (até a S13, não.) */
export function temOrganograma(cb: BreakdownFoto): boolean {
  return !!cb?.fabricas_org;
}

/**
 * Fábricas da foto no organograma. Só fábrica de entrega: "Sem fábrica" e áreas
 * de apoio ficam de fora — com score 0 passariam NA FRENTE no pódio e virariam
 * séries extras. Foto sem `fabricas_org` devolve vazio.
 */
export function fabricasDaFoto(cb: BreakdownFoto): Record<string, SnapshotScopeBreakdown> {
  const out: Record<string, SnapshotScopeBreakdown> = {};
  for (const [codigo, scope] of Object.entries(cb?.fabricas_org ?? {})) {
    if (FABRICAS_DE_ENTREGA.includes(codigo)) out[codigo] = scope;
  }
  return out;
}

/**
 * Nome para a tela: código do organograma vira rótulo ("ERP · Sustentação"),
 * id de grupo vira o nome do grupo ("Sustentação"); o resto volta como veio.
 */
export function rotuloFabricaFoto(nome: string): string {
  const grupo = GRUPOS.find((g) => g.id === nome);
  if (grupo) return grupo.rotulo;
  return fabricaOrg(nome) ? rotuloFabricaLongo(nome) : nome;
}

/** Cor na tela: a do grupo para um id de grupo; a da fábrica para o resto. */
export function corFabricaFoto(nome: string, idx = 0): string {
  return GRUPOS.find((g) => g.id === nome)?.cor ?? fabricaColor(nome, idx);
}

/** Ordem de leitura: a do organograma; o que não é fábrica vai para o fim. */
export function ordemFabricaFoto(nome: string): number {
  const i = CODIGOS_FABRICA.indexOf(nome);
  return i >= 0 ? i : 999;
}

/**
 * Recorta uma janela de fotos às que têm a fábrica do organograma. `fora` =
 * quantas ficaram de fora (anteriores ao organograma) — os cards declaram isso
 * no rodapé, nunca somem em silêncio.
 */
export function recorteOrganograma<T extends { category_breakdown?: BreakdownFoto }>(
  fotos: T[],
): { fotos: T[]; fora: number } {
  const dentro = fotos.filter((f) => temOrganograma(f.category_breakdown));
  return { fotos: dentro, fora: fotos.length - dentro.length };
}

/** Frase do rodapé para o que ficou de fora da janela (vazio quando nada ficou). */
export function avisoForaDoOrganograma(fora: number): string {
  if (fora <= 0) return '';
  return fora === 1
    ? '1 sprint anterior ao organograma ficou fora da conta.'
    : `${fora} sprints anteriores ao organograma ficaram fora da conta.`;
}
