/**
 * Organograma Fábricas / Produto (11/2026): GRUPO › FÁBRICA › pessoa.
 *
 * Fonte única dos nomes. Antes havia quatro listas que precisavam concordar
 * (SQUADS/AREAS, o CHECK do banco, a paleta e o seed de `devops_lead_area_map`);
 * a partir daqui as outras derivam deste arquivo, e o CHECK da tabela
 * `fabrica_squad_membership` é conferido por teste contra `codigo`.
 *
 * Só rótulos de estrutura vivem aqui. Nome de pessoa continua no banco, sob
 * RLS — este repositório é público.
 */

export type GrupoId = 'SUSTENTACAO' | 'EVOLUCAO' | 'HIBRIDA' | 'APOIO' | 'ANTERIOR';

export interface GrupoFabrica {
  id: GrupoId;
  rotulo: string;
  /** Cor de identidade do grupo; as fábricas dele são tons dessa mesma cor. */
  cor: string;
  /** Uma linha sobre o que o grupo é — vai para tooltip e para o relatório. */
  descricao: string;
}

export interface FabricaOrg {
  /** Valor gravado em `fabrica_squad_membership.squad`. Nunca muda depois de carregado. */
  codigo: string;
  /** Nome curto, lido DENTRO do grupo ("ERP"). */
  rotulo: string;
  grupo: GrupoId;
  cor: string;
  /**
   * true = time de entrega: quem está aqui tem os PBIs contados nos KPIs de
   * sprint. false = só horas (áreas de apoio e Infra): cadastrar alguém não
   * move nenhum indicador de entrega (decisão de 12/08/2026, mantida).
   */
  entrega: boolean;
  /**
   * Nome LIMPO do Épico de squad desta fábrica no DevOps (`cleanFabricaName`),
   * quando existe um que ainda representa o time.
   *
   * É o que permite medir uso cruzado: hora da fábrica em item de outro Épico.
   * Em 11/2026 o DevOps segue com os Épicos do formato anterior ([K8], [FLEXX],
   * [STAGING], [APP]); só STAGING e APP sobreviveram com o mesmo time/escopo.
   * Para as demais não há como dizer "fora de casa", então a tela não inventa:
   * sem `epico`, toda hora é própria. Preencher aqui quando o Épico for criado.
   */
  epico?: string;
  /** Produtos atendidos (do organograma) — texto de apoio no drill e no relatório. */
  produtos?: string;
}

export const GRUPOS: GrupoFabrica[] = [
  { id: 'SUSTENTACAO', rotulo: 'Sustentação', cor: 'hsl(160,55%,38%)', descricao: 'Fábrica de Sustentação: mantém o que está em produção.' },
  { id: 'EVOLUCAO', rotulo: 'Evolução', cor: 'hsl(265,52%,56%)', descricao: 'Fábrica Evolução: produto novo, inovação e reescrita.' },
  { id: 'HIBRIDA', rotulo: 'Híbrida', cor: 'hsl(205,55%,47%)', descricao: 'Fábrica Híbrida: sustenta e evolui os portais e stagings.' },
  { id: 'APOIO', rotulo: 'Áreas de apoio', cor: 'hsl(215,16%,52%)', descricao: 'Áreas de apoio: entram nas horas, não nos KPIs de entrega.' },
  { id: 'ANTERIOR', rotulo: 'Formato anterior', cor: 'hsl(43,74%,49%)', descricao: 'Squads do organograma anterior que ainda têm gente cadastrada.' },
];

export const FABRICAS: FabricaOrg[] = [
  // ── Sustentação ──
  { codigo: 'GPS_GO', rotulo: 'GPS / GO', grupo: 'SUSTENTACAO', cor: 'hsl(160,58%,28%)', entrega: true, produtos: 'Mapa, Roteirizador, Planner, APP' },
  { codigo: 'APP', rotulo: 'APP', grupo: 'SUSTENTACAO', cor: 'hsl(160,55%,42%)', entrega: true, epico: 'APP', produtos: 'Connect Sales, Flexx Sales, Check Stock, Tracking' },
  { codigo: 'PROMO_SUITE', rotulo: 'PROMO / SUITE', grupo: 'SUSTENTACAO', cor: 'hsl(160,45%,54%)', entrega: true, produtos: 'Connect Promo, Flexx Promo, Suite Flexx, WEBPROMO, BI' },
  { codigo: 'ERP_SUST', rotulo: 'ERP', grupo: 'SUSTENTACAO', cor: 'hsl(176,50%,36%)', entrega: true, produtos: 'FlexX, Decision, QuickOne, SmartSales' },
  // ── Evolução ──
  { codigo: 'ERP_EVOL', rotulo: 'ERP', grupo: 'EVOLUCAO', cor: 'hsl(265,52%,44%)', entrega: true, produtos: 'FlexX, Decision' },
  { codigo: 'IR', rotulo: 'I & R', grupo: 'EVOLUCAO', cor: 'hsl(265,50%,60%)', entrega: true, produtos: 'Connect Sales, Connect Promo, Flexx Sales, Flexx Promo, Suite Flexx, WEBPromo, Novo Decision, Novo Flexx, Quick One' },
  { codigo: 'LAB', rotulo: 'LAB', grupo: 'EVOLUCAO', cor: 'hsl(265,55%,70%)', entrega: true, produtos: 'BI, GO, SmartSales' },
  { codigo: 'INFRA', rotulo: 'Infra', grupo: 'EVOLUCAO', cor: 'hsl(250,30%,62%)', entrega: false, produtos: 'Ambiente, Arquitetura, Administração, Data Center' },
  // ── Híbrida ──
  { codigo: 'STAGING', rotulo: 'STAGING', grupo: 'HIBRIDA', cor: 'hsl(205,55%,47%)', entrega: true, epico: 'STAGING', produtos: 'Hub API, Portal Broker 3.0, Portal Froneri, Stagings HNK e Nestlé' },
  // ── Áreas de apoio (só horas) ──
  { codigo: 'QUALIDADE', rotulo: 'Qualidade', grupo: 'APOIO', cor: 'hsl(215,18%,42%)', entrega: false },
  { codigo: 'DESIGN', rotulo: 'Design', grupo: 'APOIO', cor: 'hsl(215,16%,54%)', entrega: false },
  { codigo: 'PRODUTOS', rotulo: 'Produtos', grupo: 'APOIO', cor: 'hsl(215,16%,66%)', entrega: false },
  // ── Formato anterior: saem quando ninguém mais estiver cadastrado neles ──
  { codigo: 'K8', rotulo: 'K8', grupo: 'ANTERIOR', cor: 'hsl(43,74%,49%)', entrega: true, epico: 'K8' },
  { codigo: 'FLEXX', rotulo: 'FLEXX', grupo: 'ANTERIOR', cor: 'hsl(265,35%,52%)', entrega: true, epico: 'FLEXX' },
];

const POR_CODIGO = new Map(FABRICAS.map((f) => [f.codigo, f]));
const GRUPO_POR_ID = new Map(GRUPOS.map((g) => [g.id, g]));

/** Códigos na ordem de exibição (grupo a grupo). */
export const CODIGOS_FABRICA: string[] = FABRICAS.map((f) => f.codigo);

export function fabricaOrg(codigo: string | null | undefined): FabricaOrg | null {
  return codigo ? POR_CODIGO.get(codigo) ?? null : null;
}

export function grupoPorId(id: GrupoId): GrupoFabrica {
  return GRUPO_POR_ID.get(id)!;
}

/** Grupo de uma fábrica; null para código fora do organograma (ex.: "Sem squad"). */
export function grupoDaFabrica(codigo: string | null | undefined): GrupoFabrica | null {
  const f = fabricaOrg(codigo);
  return f ? grupoPorId(f.grupo) : null;
}

/** Fábricas de um grupo, na ordem do organograma. */
export function fabricasDoGrupo(id: GrupoId): FabricaOrg[] {
  return FABRICAS.filter((f) => f.grupo === id);
}

/** Nome curto, para ler dentro do grupo. Código desconhecido volta como veio. */
export function rotuloFabrica(codigo: string): string {
  return fabricaOrg(codigo)?.rotulo ?? codigo;
}

/**
 * Nome que se sustenta SOZINHO (matriz, chip, relatório). "ERP" existe nos dois
 * grupos; fora do contexto do grupo precisa dizer de qual está falando.
 */
export function rotuloFabricaLongo(codigo: string): string {
  const f = fabricaOrg(codigo);
  if (!f) return codigo;
  const repetido = FABRICAS.some((o) => o !== f && o.rotulo === f.rotulo);
  return repetido ? `${f.rotulo} · ${grupoPorId(f.grupo).rotulo}` : f.rotulo;
}

/** true quando a fábrica é time de entrega (move KPI de sprint). */
export function ehFabricaDeEntrega(codigo: string | null | undefined): boolean {
  return fabricaOrg(codigo)?.entrega === true;
}

/** Épico de squad que representa a fábrica, quando existe (ver `FabricaOrg.epico`). */
export function epicoDaFabrica(codigo: string | null | undefined): string | null {
  return fabricaOrg(codigo)?.epico ?? null;
}
