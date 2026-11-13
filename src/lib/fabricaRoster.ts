/**
 * Helpers do roster fixo (pessoa -> fábrica "de casa").
 *
 * Os NOMES não vivem aqui: este repositório é público, então o roster é
 * carregado do banco (tabela `fabrica_squad_membership`, sob RLS) via
 * `useFabricaRoster`. Aqui ficam só os rótulos e o casamento de nomes.
 *
 * A estrutura (grupo › fábrica) vem de `@/lib/fabricaOrganograma`.
 */
import { CODIGOS_FABRICA, ehFabricaDeEntrega, fabricaOrg } from '@/lib/fabricaOrganograma';

/**
 * Squads POR ÉPICO — o recorte dos KPIs de sprint (ranking, matriz de sprint,
 * qualidade por fábrica, progresso diário).
 *
 * A fábrica de um ITEM sai do título do Épico no DevOps, e as fotos de sprint
 * guardam esse título. Em 11/2026 o organograma mudou, mas os Épicos seguem os
 * do formato anterior; enquanto o DevOps não for reorganizado, é esta lista que
 * os indicadores de entrega enxergam. Não confundir com a fábrica de casa de
 * uma PESSOA, que já segue o organograma novo (`GRUPOS_HORAS`).
 */
export const SQUADS: string[] = ['K8', 'FLEXX', 'STAGING', 'APP'];

/**
 * Códigos que entram SÓ na contagem de horas (decisão de 12/08/2026): as áreas
 * de apoio e a Infra. Cadastrar alguém aqui faz as horas aparecerem com nome e
 * capacidade próprios, sem mover nenhum KPI de sprint.
 */
export const AREAS: string[] = CODIGOS_FABRICA.filter((c) => !ehFabricaDeEntrega(c));

/** Todas as casas possíveis de uma pessoa, na ordem do organograma. */
export const GRUPOS_HORAS: string[] = CODIGOS_FABRICA;

/** true quando o código conta só horas, não é fábrica de entrega. */
export function ehArea(grupo: string | null | undefined): boolean {
  return !!grupo && !!fabricaOrg(grupo) && !ehFabricaDeEntrega(grupo);
}

/**
 * Balde de quem apontou hora mas não está no roster. É uma linha de primeira
 * classe nas visões por squad — sem ela essas pessoas somem da tela ao serem
 * filtradas.
 */
export const SEM_SQUAD = 'Sem squad';

export type RosterEntry = {
  colaborador: string;
  squad: string;
  papel?: string | null;
  /** Se as horas contam como hora de fábrica (false = lead só gestor). */
  conta_horas?: boolean;
  /**
   * Quanto da pessoa está nesta fábrica (1–100). Quem divide o tempo entre duas
   * fábricas tem uma linha em cada, com o percentual de cada uma.
   */
  alocacao_pct?: number | null;
};

const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Normaliza nome p/ casamento tolerante a acento/caixa/espaços. */
export function normName(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Percentual de alocação de uma linha, saneado para (0, 100]. Ausente = 100. */
export function alocacaoPct(row: Pick<RosterEntry, 'alocacao_pct'>): number {
  const v = Number(row.alocacao_pct);
  return Number.isFinite(v) && v > 0 ? Math.min(v, 100) : 100;
}

/** Uma casa da pessoa: fábrica + fatia das HORAS dela que vai para lá (soma 1). */
export type CasaAlocada = { squad: string; pct: number; peso: number };

/**
 * Mapa nome-normalizado -> casas da pessoa.
 *
 * `peso` é o rateio das horas: cada casa recebe pct / Σ pct. Quem tem uma casa
 * só fica com peso 1 mesmo a 50% — o percentual reduz a CAPACIDADE dela, não
 * some com a outra metade das horas apontadas.
 *
 * O rateio é por percentual, não por Épico: o DevOps ainda não tem Épico para
 * as fábricas novas, então não há como dizer em qual das duas a hora caiu.
 */
export function buildAlocacaoMap(rows: RosterEntry[]): Map<string, CasaAlocada[]> {
  const bruto = new Map<string, { squad: string; pct: number }[]>();
  for (const r of rows) {
    if (!r?.colaborador || !r?.squad) continue;
    const k = normName(r.colaborador);
    const casas = bruto.get(k) ?? [];
    const repetida = casas.find((c) => c.squad === r.squad);
    if (repetida) repetida.pct = Math.max(repetida.pct, alocacaoPct(r));
    else casas.push({ squad: r.squad, pct: alocacaoPct(r) });
    bruto.set(k, casas);
  }
  const ordem = (s: string) => {
    const i = GRUPOS_HORAS.indexOf(s);
    return i === -1 ? 999 : i;
  };
  const out = new Map<string, CasaAlocada[]>();
  for (const [k, casas] of bruto) {
    const soma = casas.reduce((s, c) => s + c.pct, 0);
    out.set(k, casas
      .sort((a, b) => b.pct - a.pct || ordem(a.squad) - ordem(b.squad))
      .map((c) => ({ ...c, peso: c.pct / soma })));
  }
  return out;
}

/** Casas da pessoa (maior alocação primeiro); vazio se não estiver no roster. */
export function casasDe(map: Map<string, CasaAlocada[]>, name: string | null | undefined): CasaAlocada[] {
  if (!name) return [];
  return map.get(normName(name)) ?? [];
}

/**
 * Mapa nome-normalizado -> casa PRINCIPAL (a de maior alocação).
 * Para quem precisa de uma fábrica só por pessoa; rateio usa `buildAlocacaoMap`.
 */
export function buildHomeSquadMap(rows: RosterEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const [k, casas] of buildAlocacaoMap(rows)) map.set(k, casas[0].squad);
  return map;
}

/** Casa principal do colaborador; null se não estiver no roster. */
export function homeSquadOf(map: Map<string, string>, name: string | null | undefined): string | null {
  if (!name) return null;
  return map.get(normName(name)) ?? null;
}

/**
 * Nomes (normalizados) de quem NÃO conta como hora de fábrica — os leads só
 * gestores (conta_horas = false). Lead executor conta normalmente.
 * Usado para excluir do realizado das squads.
 *
 * Só sai da conta quem não conta em NENHUMA das casas: com alocação dividida,
 * a pessoa pode ser gestora numa fábrica e executora na outra.
 */
export function buildNaoContaSet(rows: RosterEntry[]): Set<string> {
  const conta = new Set<string>();
  const naoConta = new Set<string>();
  for (const r of rows) {
    if (!r?.colaborador) continue;
    (r.conta_horas === false ? naoConta : conta).add(normName(r.colaborador));
  }
  return new Set([...naoConta].filter((k) => !conta.has(k)));
}
