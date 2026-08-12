/**
 * Helpers do roster fixo das squads (dev -> squad "de casa").
 *
 * Os NOMES não vivem aqui: este repositório é público, então o roster é
 * carregado do banco (tabela `fabrica_squad_membership`, sob RLS) via
 * `useFabricaRoster`. Aqui ficam só os rótulos de squad e o casamento de nomes.
 */

/** Ordem canônica das squads para exibição (rótulos, não são dado pessoal). */
export const SQUADS: string[] = ['K8', 'FLEXX', 'STAGING', 'APP'];

/**
 * Balde de quem apontou hora mas não está no roster. É uma linha de primeira
 * classe nas visões por squad — sem ela essas pessoas some da tela ao serem
 * filtradas (Igor, Ana, Leonardo, Mauricio, Rodolfo…).
 */
export const SEM_SQUAD = 'Sem squad';

export type RosterEntry = {
  colaborador: string;
  squad: string;
  papel?: string | null;
  /** Se as horas contam como hora de fábrica (false = lead só gestor). */
  conta_horas?: boolean;
};

const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Normaliza nome p/ casamento tolerante a acento/caixa/espaços. */
export function normName(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Mapa nome-normalizado -> squad, a partir das linhas do roster. */
export function buildHomeSquadMap(rows: RosterEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of rows) {
    if (!r?.colaborador || !r?.squad) continue;
    map.set(normName(r.colaborador), r.squad);
  }
  return map;
}

/** Squad "de casa" do colaborador; null se não estiver no roster. */
export function homeSquadOf(map: Map<string, string>, name: string | null | undefined): string | null {
  if (!name) return null;
  return map.get(normName(name)) ?? null;
}

/**
 * Nomes (normalizados) de quem NÃO conta como hora de fábrica — os leads só
 * gestores (conta_horas = false). Lead executor conta normalmente.
 * Usado para excluir do realizado das squads.
 */
export function buildNaoContaSet(rows: RosterEntry[]): Set<string> {
  const s = new Set<string>();
  for (const r of rows) {
    if (r?.conta_horas === false && r.colaborador) s.add(normName(r.colaborador));
  }
  return s;
}
