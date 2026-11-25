/**
 * Helpers do roster fixo (pessoa -> fábrica "de casa").
 *
 * Os NOMES não vivem aqui: este repositório é público, então o roster é
 * carregado do banco (tabela `fabrica_squad_membership`, sob RLS) via
 * `useFabricaRoster`. Aqui ficam só os rótulos e o casamento de nomes.
 *
 * A estrutura (grupo › fábrica) vem de `@/lib/fabricaOrganograma`.
 */
import { CODIGOS_FABRICA, ehFabricaDeEntrega, FABRICAS, fabricaOrg } from '@/lib/fabricaOrganograma';
import { cleanFabricaName } from '@/lib/fabricaNames';

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
 * Esse peso é o rateio de quando o destino da hora não diz qual das casas é:
 * ver `repartirHoraPorPessoa`.
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
 * Jornada da pessoa DENTRO de uma fábrica: h/dia × alocação.
 * Com a jornada cheia de 7 h, 50% são 3,5 h/dia em cada fábrica.
 */
export function horasDiaNaCasa(row: { capacidade_h_dia?: number | null; alocacao_pct?: number | null }): number {
  return (Number(row.capacidade_h_dia) || 0) * alocacaoPct(row) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Destino da hora: onde ela foi LANÇADA no DevOps (área do time ou Épico raiz).
//
// Regra de 22/11/2026 (Igor): a hora é da fábrica da PESSOA, que é o que o
// organograma e o relatório do TimeLog dizem. Lançar no Épico/área de outra
// fábrica é questão de orientação — a hora não sai da pessoa, ganha uma MARCA
// dizendo onde foi lançada. Antes, hora sem Épico de squad era descartada de
// quem é de fábrica de entrega: em 22/11 o IR tinha 93 h lançadas e 0,3 h na tela.
// ─────────────────────────────────────────────────────────────────────────────

/** Destino de lançamento sem área de time nem Épico. */
export const DESTINO_NENHUM = 'nenhum';

/** Onde uma hora foi lançada, já traduzido para as fábricas que moram lá. */
export type DestinoHora = {
  /** `area:IR`, `epico:STAGING`, `outro:<Épico>` ou `nenhum` — chave das linhas de horas. */
  id: string;
  /** Fábricas cuja casa no DevOps é esse destino (vazio = de ninguém). */
  codigos: string[];
  /** Texto curto para chip e coluna: "área IR", "Épico STAGING", "sem área/Épico". */
  rotulo: string;
  /** Destino só de squads do formato anterior (K8, FLEXX). */
  anterior: boolean;
};

/** Último segmento do Area Path (`Flag.Planejamento\IR` → 'IR'); null na raiz do projeto. */
export function segmentoArea(areaPath: string | null | undefined): string | null {
  if (!areaPath) return null;
  const partes = areaPath.split('\\').map((p) => p.trim()).filter(Boolean);
  return partes.length >= 2 ? partes[partes.length - 1] : null;
}

/**
 * Épicos de squad do organograma ANTERIOR ([K8], [FLEXX]). Não são mais fábrica
 * (F4, 23/11/2026), mas ainda há gente lançando neles: a hora segue com a
 * fábrica da pessoa e ganha a marca "formato anterior", para orientação.
 */
export const EPICOS_FORMATO_ANTERIOR: readonly string[] = ['K8', 'FLEXX'];

/**
 * DE → PARA das Features do formato anterior (24/11/2026, decisões do Igor).
 * Espelho de `fn_fabrica_de_para()` (migration 20261124130000) — o teste
 * `fabricaDePara.test.ts` reprova se divergir. Hora lançada numa dessas Features
 * tem destino nas fábricas do PARA: marca "na casa"/"cruzado"/"atendimento",
 * não "formato anterior".
 */
export const DE_PARA_FORMATO_ANTERIOR: Readonly<Record<number, { de: string; para: readonly string[] }>> = {
  10012: { de: 'WMAN', para: ['ERP_SUST', 'ERP_EVOL'] },
  10015: { de: 'NFEE', para: ['ERP_SUST', 'ERP_EVOL'] },
  10011: { de: 'WDCS', para: ['ERP_SUST', 'ERP_EVOL'] },
  15635: { de: 'WDES', para: ['ERP_SUST', 'ERP_EVOL'] },
  10014: { de: 'QUCK', para: ['ERP_SUST'] },
  9993: { de: 'WFES', para: ['ERP_SUST'] },
  10016: { de: 'SMSL', para: ['ERP_SUST'] },
  10013: { de: 'QUCT', para: ['ERP_SUST'] },
  10001: { de: 'MRCH', para: ['PROMO_SUITE'] },
  10004: { de: 'SWFX', para: ['PROMO_SUITE'] },
  10003: { de: 'FLXP', para: ['PROMO_SUITE'] },
  10005: { de: 'PBII', para: ['PROMO_SUITE'] },
  10000: { de: 'PFWE', para: ['PROMO_SUITE'] },
  13509: { de: 'NOVODECISION', para: ['IR'] },
};

const fabricasDaArea = (seg: string) => FABRICAS.filter((f) => f.devops?.area === seg).map((f) => f.codigo);
const fabricasDoEpico = (ep: string) => FABRICAS.filter((f) => f.devops?.epicos?.includes(ep)).map((f) => f.codigo);

/**
 * Id do destino de um item: área de time conhecida › Feature do DE-PARA (só
 * debaixo de Épico do formato anterior) › Épico conhecido › área desconhecida ›
 * outro Épico › nenhum. A área vem antes porque é assim que os times novos
 * lançam (o item da área IR não tem Épico).
 */
export function destinoIdDoItem(
  areaPath: string | null | undefined,
  epicoTitulo: string | null | undefined,
  featureDePara?: number | null,
): string {
  const seg = segmentoArea(areaPath);
  if (seg && fabricasDaArea(seg).length > 0) return `area:${seg}`;
  const ep = epicoTitulo ? cleanFabricaName(epicoTitulo) : null;
  if (ep && EPICOS_FORMATO_ANTERIOR.includes(ep) && featureDePara != null && DE_PARA_FORMATO_ANTERIOR[featureDePara]) {
    return `depara:${featureDePara}`;
  }
  if (ep && (fabricasDoEpico(ep).length > 0 || EPICOS_FORMATO_ANTERIOR.includes(ep))) return `epico:${ep}`;
  if (seg) return `area:${seg}`;
  if (ep) return `outro:${ep}`;
  return DESTINO_NENHUM;
}

const cacheDestino = new Map<string, DestinoHora>();

/** Lê um id de destino. Id desconhecido vira destino sem fábrica (nunca some). */
export function lerDestino(id: string): DestinoHora {
  const cache = cacheDestino.get(id);
  if (cache) return cache;
  const [tipo, ...resto] = id.split(':');
  const nome = resto.join(':');
  let d: DestinoHora;
  if (tipo === 'area' && nome) {
    d = { id, codigos: fabricasDaArea(nome), rotulo: `área ${nome}`, anterior: false };
  } else if (tipo === 'epico' && nome) {
    d = { id, codigos: fabricasDoEpico(nome), rotulo: `Épico ${nome}`, anterior: EPICOS_FORMATO_ANTERIOR.includes(nome) };
  } else if (tipo === 'depara' && DE_PARA_FORMATO_ANTERIOR[Number(nome)]) {
    const dp = DE_PARA_FORMATO_ANTERIOR[Number(nome)];
    d = { id, codigos: [...dp.para], rotulo: `Feature ${dp.de} (DE-PARA)`, anterior: false };
  } else if (tipo === 'outro' && nome) {
    d = { id, codigos: [], rotulo: `Épico ${nome}`, anterior: false };
  } else {
    d = { id, codigos: [], rotulo: 'sem área/Épico', anterior: false };
  }
  cacheDestino.set(id, d);
  return d;
}

/**
 * Marca da hora na casa que a recebeu:
 * - `casa`: lançada na área/Épico da própria fábrica;
 * - `cruzado`: lançada na área/Épico de OUTRA fábrica;
 * - `atendimento`: área de apoio (Qualidade, Infra…) trabalhando no item de uma
 *   fábrica — é o trabalho dela, não lançamento errado;
 * - `anterior`: Épico de squad do formato anterior (K8, FLEXX);
 * - `sem_destino`: item sem área de time nem Épico de fábrica.
 */
export type MarcaHora = 'casa' | 'cruzado' | 'atendimento' | 'anterior' | 'sem_destino';

export const ROTULO_MARCA: Record<MarcaHora, string> = {
  casa: 'na casa',
  cruzado: 'cruzado',
  atendimento: 'atendimento',
  anterior: 'formato anterior',
  sem_destino: 'sem área/Épico',
};

export function marcaDaHora(casa: string, destino: DestinoHora): MarcaHora {
  if (destino.codigos.includes(casa)) return 'casa';
  if (destino.anterior) return 'anterior';
  if (destino.codigos.length === 0) return 'sem_destino';
  return ehArea(casa) ? 'atendimento' : 'cruzado';
}

/**
 * Para qual casa da pessoa vai uma hora (os pesos somam 1 — nada se perde):
 * - o destino é uma das casas dela → vai inteira para essa casa (ou rateada
 *   entre as casas que moram lá, como os dois ERP na área ERP);
 * - senão → rateio pelo % de alocação entre todas as casas dela.
 * Pessoa sem casa devolve vazio: quem chama põe a hora em "Sem squad".
 *
 * Exemplo: 50% LAB + 50% Infra → hora do Épico [INFRA] vai toda para Infra,
 * hora da área LAB toda para LAB, hora sem área/Épico 50/50.
 */
export function repartirHoraPorPessoa(
  casas: CasaAlocada[],
  destino: DestinoHora,
): Array<{ squad: string; peso: number; marca: MarcaHora }> {
  const daqui = casas.filter((c) => destino.codigos.includes(c.squad));
  const alvo = daqui.length > 0 ? daqui : casas;
  const soma = alvo.reduce((s, c) => s + c.pct, 0);
  if (soma <= 0) return [];
  return alvo.map((c) => ({ squad: c.squad, peso: c.pct / soma, marca: marcaDaHora(c.squad, destino) }));
}

/** Ordem de exibição dos destinos: casas do organograma, depois o resto. */
export function ordemDestino(id: string): number {
  const d = lerDestino(id);
  if (d.codigos.length > 0) {
    const i = Math.min(...d.codigos.map((c) => GRUPOS_HORAS.indexOf(c)).filter((x) => x >= 0));
    return Number.isFinite(i) ? i : 900;
  }
  return id === DESTINO_NENHUM ? 999 : 950;
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
