import { KNOWN_MARKERS, KNOWN_PRODUCTS } from '@/lib/products';

interface CamposPermitidos {
  clientes: string[];
  produtos: string[];
}

/**
 * Tags na criação de Task/PBI e na reunião do Timer (pedido do Igor,
 * 18/11/2026). A lista vem do DevOps (op `tags` da edge); a separação entre
 * produto e cliente usa a regra que o FlagHub já tem (products.ts), porque o
 * DevOps não diz o que cada tag é.
 */
export type TipoTag = 'produto' | 'cliente' | 'categoria' | 'marcador' | 'kpi';

const CATEGORIAS_SET = new Set(['EVENTO', 'RISCO', 'REUNIÃO', 'REUNIAO']);

/** Mesmos marcadores que a edge recusa: mudam KPI de sprint, são do gestor. */
const RE_KPI = [
  /^prioriza[cç][aã]o$/i,
  /^avi[aã]o\b/i,
  /^transbord(o|ad[oa])$/i,
  /^retorno\s*(de\s*)?qa$/i,
  /^bug$/i,
  /^escopopago$/i,
  /^criticidade$/i,
];

export function tipoDaTag(tag: string): TipoTag {
  const t = tag.trim();
  const up = t.toUpperCase();
  if (RE_KPI.some((re) => re.test(t))) return 'kpi';
  if (CATEGORIAS_SET.has(up)) return 'categoria';
  if (KNOWN_PRODUCTS.has(up)) return 'produto';
  if (KNOWN_MARKERS.has(up)) return 'marcador';
  return 'cliente';
}

export const separarTags = (tags: string | null | undefined): string[] =>
  (tags ?? '')
    .split(';')
    .map((t) => t.trim())
    .filter(Boolean);

/** Do item pai, a Task herda só produto e cliente (nunca marcador nem KPI). */
export function herdaveis(tagsDoPai: string | null | undefined): string[] {
  return separarTags(tagsDoPai).filter((t) => {
    const k = tipoDaTag(t);
    return k === 'produto' || k === 'cliente';
  });
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A grafia que já existe no DevOps ("heineken" → "HEINEKEN"), ou null. */
export function grafiaExistente(texto: string, existentes: string[]): string | null {
  const alvo = semAcento(texto.trim());
  return existentes.find((e) => semAcento(e) === alvo) ?? null;
}

/** Busca sem acento e sem caixa; quem começa com o texto vem primeiro. */
export function buscarTags(lista: string[], texto: string, max = 6): string[] {
  const alvo = semAcento(texto.trim());
  if (!alvo) return [];
  const comeca: string[] = [];
  const contem: string[] = [];
  for (const t of lista) {
    const n = semAcento(t);
    if (n.startsWith(alvo)) comeca.push(t);
    else if (n.includes(alvo)) contem.push(t);
  }
  return [...comeca, ...contem].slice(0, max);
}

/**
 * A lista do DevOps separada nas três listas da tela (pedido do Igor,
 * 18/11/2026): produto, cliente e categoria (os marcadores que não mudam KPI:
 * Evento, Risco, IA, BI…). Os marcadores de KPI ficam de fora.
 */
export function agruparTags(lista: string[]): { produtos: string[]; clientes: string[]; categorias: string[] } {
  const produtos: string[] = [];
  const clientes: string[] = [];
  const categorias: string[] = [];
  for (const t of lista) {
    const k = tipoDaTag(t);
    if (k === 'produto') produtos.push(t);
    else if (k === 'cliente') clientes.push(t);
    else if (k === 'marcador' || k === 'categoria') categorias.push(t);
  }
  return { produtos, clientes, categorias };
}

export const temProduto = (tags: string[]) => tags.some((t) => tipoDaTag(t) === 'produto');

/**
 * Categoria = as tags do projeto (System.Tags), sem os marcadores que mudam
 * KPI. Cliente e Produto NÃO são tag: são campos de lista do DevOps
 * (Custom.PRODUTOSS e Custom.CLIENTESS, com os nomes trocados).
 */
export const categoriasDasTags = (lista: string[]) => lista.filter((t) => tipoDaTag(t) !== 'kpi');

/** Cliente, produto e categorias de um item novo. */
export interface Classificacao {
  /** campo Custom.PRODUTOSS no DevOps (os nomes são trocados lá) */
  cliente: string | null;
  /** campo Custom.CLIENTESS no DevOps */
  produto: string | null;
  /** categoria = System.Tags */
  tags: string[];
}

export const classificacaoVazia = (herdado?: { cliente?: string | null; produto?: string | null }): Classificacao => ({
  cliente: herdado?.cliente ?? null,
  produto: herdado?.produto ?? null,
  tags: [],
});

/**
 * Cliente e Produto obrigatórios quando o tipo tem o campo (decisão do Igor,
 * 18/11/2026). Sem a lista carregada, não dá para dizer que está completo.
 */
export function classificacaoCompleta(c: Classificacao, campos: CamposPermitidos | undefined): boolean {
  if (!campos) return false;
  const temNaLista = (v: string | null, lista: string[]) => !!v && lista.some((l) => l.toLowerCase() === v.toLowerCase());
  return (campos.clientes.length === 0 || temNaLista(c.cliente, campos.clientes))
    && (campos.produtos.length === 0 || temNaLista(c.produto, campos.produtos));
}
