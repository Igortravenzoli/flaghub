import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  DASH, countBy, numOrNull, semAcento, statusMatches, str,
  type NameValue, type SgsiRawItem,
} from '@/lib/sgsiFields';

// ── INC-1 — Incidentes DECLARADOS (SGSI/SharePoint) para Customer Service ──
// Lê SÓ `list_key='017'` (SG-LST-016/017 "Solicitação análise e tratamento de
// incidentes", site PORTALSGSI), escopado pelo período da tela.
//
// Por que não `useBIInfraSgsi`: aquele hook pagina o espelho INTEIRO
// (fetchAllRows sobre as 6 listas, >3,7k linhas com jsonb gordo) para montar 6
// blocos. Aqui são 2 requests e trabalho O(período).
//
// O que este hook NÃO tem: escopo Global × Pontual e "com parada". A lista 017
// não possui coluna de escopo nem de clientes afetados (INC-3) — ver
// `temCampoEscopo` abaixo. Nunca sintetize esses valores.

const LIST_KEY = '017';
/** Teto de leitura numa página do PostgREST. Acima disso, `truncado = true`. */
const LIMITE_ITENS = 1000;
/** Itens exibidos no card. 4 = 2 linhas no grid md:grid-cols-2 (seguro na TV). */
export const RECENTES_MAX = 4;
/** Idade do espelho considerada saudável — mesma régua do HubUpTime. */
const HORAS_ESPELHO_OK = 48;
const HORAS_ESPELHO_CRITICO = 24 * 7;

const CAMPOS_STATUS = ['Status', 'Status atual'];
const RE_RESOLVIDO = /resolv|encerr|conclu|finaliz/i;
const RE_CONTORNADO = /contorn|paliativ|workaround/i;
const RE_ATIVO = /ativo|abert|andamento|tratament/i;

export type StatusBucket017 = 'ativo' | 'contornado' | 'resolvido' | 'outro';

/** Estado da fonte — separa "período sem incidente" de "espelho indisponível". */
export type CsIncidentesEstado = 'sem-espelho' | 'espelho-vazio' | 'periodo-vazio' | 'ok';

export interface CsIncidenteDeclarado {
  id: number;
  protocolo: string;
  titulo: string;
  status: string;
  bucket: StatusBucket017;
  categoria: string;
  priorizacao: string;
  produto: string;
  sla: string;
  /** `null` = downtime NÃO declarado. Não é 0h. */
  downtimeHoras: number | null;
  /** ISO de `created_sp` — a base do filtro de período. */
  criadoEm: string | null;
}

export interface CsIncidentesDeclaradosResponse {
  estado: CsIncidentesEstado;
  /** Itens no período — contagem EXATA no banco, mesmo se a lista vier truncada. */
  total: number;
  /** Itens da lista 017 no espelho, sem período (`sgsi_lists.item_count`). */
  totalBase: number;
  ativos: number;
  contornados: number;
  resolvidos: number;
  /** Status que não casa com nenhum bucket. Soma com os outros 3 = `total`. */
  naoClassificados: number;
  /** % dentro do SLA. `null` quando NENHUM item do período tem o campo SLA. */
  pctDentroSla: number | null;
  slaDentro: number;
  slaFora: number;
  porCategoria: NameValue[];
  porPriorizacao: NameValue[];
  porStatus: NameValue[];
  /** Soma do downtime declarado. `null` se ninguém declarou. */
  downtimeTotalHoras: number | null;
  /** Quantos itens do período têm downtime declarado (denominador honesto). */
  comDowntime: number;
  recentes: CsIncidenteDeclarado[];
  truncado: boolean;
  limite: number;
  /** `sgsi_lists.synced_at` da lista 017. `null` = linha inexistente. */
  sincronizadoEm: string | null;
  sincronizadoHaHoras: number | null;
  espelhoDesatualizado: boolean;
  espelhoCritico: boolean;
  /** SEMPRE `false`: a lista 017 não tem campo de escopo/parada (INC-3).
   *  Tipado como LITERAL de propósito — se alguém tentar "ligar" Global ×
   *  Pontual sem coluna nova no SharePoint, o TypeScript reclama. */
  temCampoEscopo: false;
}

/**
 * Bucket EXCLUSIVO (resolvido > contornado > ativo > outro), para que
 * `ativos + contornados + resolvidos + naoClassificados === total`.
 * Difere de propósito do `useBIInfra`, onde os filtros se sobrepõem e um item
 * "Contornado e resolvido" conta 2× (num card executivo isso não fecha a conta).
 */
export function classificaStatus017(item: SgsiRawItem): StatusBucket017 {
  if (statusMatches(item, CAMPOS_STATUS, RE_RESOLVIDO)) return 'resolvido';
  if (statusMatches(item, CAMPOS_STATUS, RE_CONTORNADO)) return 'contornado';
  if (statusMatches(item, CAMPOS_STATUS, RE_ATIVO)) return 'ativo';
  return 'outro';
}

/**
 * Campo "SLA" da lista: em prod aparece como Sim/Não E como
 * "Dentro do SLA"/"Fora do SLA". `useBIInfra` só reconhece sim/não — aqui
 * aceitamos as duas formas, e devolvemos `null` para qualquer outro valor
 * (nunca "chutar" para dentro).
 */
export function classificaSla(valor: string): 'dentro' | 'fora' | null {
  const v = semAcento(valor);
  if (v === '') return null;
  if (v === 'sim' || v.startsWith('dentro')) return 'dentro';
  if (v === 'nao' || v.startsWith('fora')) return 'fora';
  return null;
}

function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function fimDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Monta a resposta a partir das linhas cruas — puro e testável sem Supabase. */
export function buildCsIncidentesDeclarados(args: {
  rows: SgsiRawItem[];
  /** `count` exato do PostgREST para o período. `null` → cai em `rows.length`. */
  totalNoPeriodo: number | null;
  /** `sgsi_lists.item_count` da 017. `null` = linha da lista não existe. */
  totalBase: number | null;
  sincronizadoEm: string | null;
  limite?: number;
  now?: Date;
}): CsIncidentesDeclaradosResponse {
  const { rows, totalNoPeriodo, totalBase, sincronizadoEm } = args;
  const limite = args.limite ?? LIMITE_ITENS;
  const now = args.now ?? new Date();

  const total = totalNoPeriodo ?? rows.length;
  const base = totalBase ?? 0;

  const buckets = rows.map((r) => classificaStatus017(r));
  const conta = (b: StatusBucket017) => buckets.filter((x) => x === b).length;

  let slaDentro = 0, slaFora = 0;
  let downtimeSoma = 0, comDowntime = 0;
  for (const r of rows) {
    const sla = classificaSla(str(r, 'SLA'));
    if (sla === 'dentro') slaDentro++;
    else if (sla === 'fora') slaFora++;

    const dt = numOrNull(r, 'Tempo Downtime');
    if (dt !== null && dt > 0) { downtimeSoma += dt; comDowntime++; }
  }

  const ordenados = [...rows].sort(
    (a, b) => (b.created_sp ?? '').localeCompare(a.created_sp ?? '')
  );

  const ms = sincronizadoEm ? now.getTime() - new Date(sincronizadoEm).getTime() : null;
  const sincronizadoHaHoras =
    ms !== null && Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 3600000)) : null;

  const estado: CsIncidentesEstado =
    totalBase === null && sincronizadoEm === null ? 'sem-espelho'
    : base === 0 ? 'espelho-vazio'
    : total === 0 ? 'periodo-vazio'
    : 'ok';

  return {
    estado,
    total,
    totalBase: base,
    ativos: conta('ativo'),
    contornados: conta('contornado'),
    resolvidos: conta('resolvido'),
    naoClassificados: conta('outro'),
    pctDentroSla:
      slaDentro + slaFora > 0 ? Math.round((slaDentro / (slaDentro + slaFora)) * 100) : null,
    slaDentro,
    slaFora,
    porCategoria: countBy(rows, 'Categoria'),
    porPriorizacao: countBy(rows, 'Priorização'),
    porStatus: countBy(rows, ...CAMPOS_STATUS),
    downtimeTotalHoras: comDowntime > 0 ? Math.round(downtimeSoma * 10) / 10 : null,
    comDowntime,
    recentes: ordenados.slice(0, RECENTES_MAX).map((i) => ({
      id: i.item_id,
      protocolo: str(i, 'Protocolo') || `#${i.item_id}`,
      // Nos lançamentos recentes o Título vem vazio — cai para o Produto afetado.
      titulo: str(i, 'Título', 'Title', 'Produto') || DASH,
      status: str(i, ...CAMPOS_STATUS) || DASH,
      bucket: classificaStatus017(i),
      categoria: str(i, 'Categoria') || DASH,
      priorizacao: str(i, 'Priorização') || DASH,
      produto: str(i, 'Produto') || DASH,
      sla: str(i, 'SLA') || DASH,
      downtimeHoras: numOrNull(i, 'Tempo Downtime'),
      criadoEm: i.created_sp,
    })),
    truncado: total > rows.length,
    limite,
    sincronizadoEm,
    sincronizadoHaHoras,
    espelhoDesatualizado: sincronizadoHaHoras !== null && sincronizadoHaHoras > HORAS_ESPELHO_OK,
    espelhoCritico: sincronizadoHaHoras !== null && sincronizadoHaHoras > HORAS_ESPELHO_CRITICO,
    temCampoEscopo: false,
  };
}

// ── Acesso ao espelho ──────────────────────────────────────────────────
// `sgsi_items`/`sgsi_lists` NÃO estão no `Database` gerado (criadas pela
// migration 20260611190000). `useBIInfra` resolve com `(supabase as any)` +
// eslint-disable; aqui descrevemos estruturalmente só o que usamos — zero `any`.
interface RawResult<T> {
  data: T[] | null;
  count: number | null;
  error: { message: string } | null;
}
interface RawQuery<T> extends PromiseLike<RawResult<T>> {
  select(cols: string, opts?: { count: 'exact'; head?: boolean }): RawQuery<T>;
  eq(col: string, val: string): RawQuery<T>;
  gte(col: string, val: string): RawQuery<T>;
  lte(col: string, val: string): RawQuery<T>;
  order(col: string, opts: { ascending: boolean }): RawQuery<T>;
  limit(n: number): RawQuery<T>;
}
interface RawDb {
  from<T>(table: string): RawQuery<T>;
}
const rawDb = (): RawDb => supabase as unknown as RawDb;

interface SgsiListMeta {
  synced_at: string | null;
  item_count: number | null;
}

/**
 * Incidentes declarados (SGSI) no período — 2 requests, escopo O(período).
 *
 * Filtra por `created_sp`: o campo de data do formulário é texto livre
 * ("Dia: 09/10/2023 - Horário: 06h27") e não é parseável — o próprio
 * `useBIInfra` desistiu de tentar. O card declara isso no rodapé.
 */
export function useCsIncidentesDeclarados(dataInicio: Date, dataFim: Date) {
  const deIso = inicioDoDia(dataInicio).toISOString();
  const ateIso = fimDoDia(dataFim).toISOString();

  return useQuery<CsIncidentesDeclaradosResponse>({
    queryKey: ['cs', 'incidentes-declarados', LIST_KEY, deIso, ateIso],
    queryFn: async () => {
      // 1) Metadados da lista 017: distingue "nunca sincronizado" de "vazio".
      const meta = await rawDb()
        .from<SgsiListMeta>('sgsi_lists')
        .select('synced_at, item_count')
        .eq('list_key', LIST_KEY)
        .limit(1);
      if (meta.error) throw new Error(`sgsi_lists(${LIST_KEY}): ${meta.error.message}`);
      const linhaLista = meta.data?.[0] ?? null;

      // 2) Itens do período. `count: 'exact'` devolve o total do FILTRO
      //    (ignora o limit) — daí sai `truncado` sem um segundo request.
      const itens = await rawDb()
        .from<SgsiRawItem>('sgsi_items')
        .select('list_key, item_id, fields, created_sp, modified_sp', { count: 'exact' })
        .eq('list_key', LIST_KEY)
        .gte('created_sp', deIso)
        .lte('created_sp', ateIso)
        .order('created_sp', { ascending: false })
        .limit(LIMITE_ITENS);
      if (itens.error) throw new Error(`sgsi_items(${LIST_KEY}): ${itens.error.message}`);

      return buildCsIncidentesDeclarados({
        rows: itens.data ?? [],
        totalNoPeriodo: itens.count,
        totalBase: linhaLista ? (linhaLista.item_count ?? 0) : null,
        sincronizadoEm: linhaLista?.synced_at ?? null,
        limite: LIMITE_ITENS,
      });
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
