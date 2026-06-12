import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';

// ── BI Infra / SGSI ────────────────────────────────────────────────────
// Espelho das listas SharePoint do site PORTALSGSI (mesma fonte do Power BI
// "SG-LST Usecase 1.04"), sincronizadas pela edge function
// sharepoint-sync-sgsi para as tabelas sgsi_lists/sgsi_items:
//   • SG-LST-010 → Solicitação de mudanças e atualizações
//   • SG-LST-011 → Solicitação de melhorias (OM)
//   • SG-LST-012 → Solicitação análise de riscos
//   • SG-LST-014 → Solicitação e controle de acessos
//   • SG-LST-017 → Solicitação análise e tratamento de incidentes
//   • SG-LST-018 → Solicitação de melhorias (NC)
// Os agregados (8 páginas do PBIX → 5 visões) são calculados aqui, a partir
// dos campos jsonb chaveados pelo displayName das colunas.

export interface NameValue {
  name: string;
  value: number;
}

export interface SimNao {
  sim: number;
  nao: number;
}

// SG-LST-010 — Mudanças e atualizações
export interface SgMudancaItem {
  id: number;
  chamado: string;
  ambiente: string;
  tipoMudanca: string;
  categoria: string;
  motivo: string;
  status: string;
  solicitante: string;
  aprovadorTI: string;
  risco: string;
  modificado: string;
}

export interface SgMudancasBloco {
  total: number;
  concluidos: number;
  pendentes: number;
  aguardandoGestor: number;
  aguardandoTI: number;
  porStatus: NameValue[];
  porAmbiente: NameValue[];
  porRisco: NameValue[];
  porCategoria: NameValue[];
  atualizacoesBemSucedidas: SimNao;
  validacaoTestes: SimNao;
  itens: SgMudancaItem[];
}

// SG-LST-017 — Incidentes
export interface SgIncidenteItem {
  id: number;
  titulo: string;
  ativo: string;
  motivo: string;
  priorizacao: string;
  protocolo: string;
  status: string;
  tipo: string;
  sla: string;
  categoria: string;
  downtimeHoras: number;
  inicio: string;
}

export interface SgIncidentesBloco {
  total: number;
  ativos: number;
  contornados: number;
  resolvidos: number;
  porSLA: NameValue[];
  porCategoria: NameValue[];
  itens: SgIncidenteItem[];
}

// SG-LST-012 — Riscos
export interface SgRiscoItem {
  id: number;
  descricao: string;
  ambiente: string;
  cid: string;
  categoriaAmeaca: string;
  tipoAmeaca: string;
  ativoAfetado: string;
  status: string;
  responsavelAjuste: string;
  dataLimite: string;
  eficaz: string;
}

export interface SgRiscosBloco {
  total: number;
  abertos: number;
  porStatus: NameValue[];
  porAmbiente: NameValue[];
  porCID: NameValue[];
  porCategoriaAmeaca: NameValue[];
  porTipoAmeaca: NameValue[];
  porAtivoAfetado: NameValue[];
  tratamentoEficaz: SimNao;
  itens: SgRiscoItem[];
}

// SG-LST-018 — Não conformidades
export interface SgNcItem {
  id: number;
  processo: string;
  detalhes: string;
  causaRaiz: string;
  acao: string;
  recorrente: boolean;
  status: string;
  eficaz: string;
  solicitante: string;
  criado: string;
}

export interface SgNcBloco {
  total: number;
  recorrentes: number;
  porStatus: NameValue[];
  porCausaRaiz: NameValue[];
  tratamentoEficaz: SimNao;
  itens: SgNcItem[];
}

// SG-LST-011 — Oportunidades de melhoria
export interface SgOmItem {
  id: number;
  oportunidade: string;
  ambiente: string;
  processo: string;
  beneficios: string;
  status: string;
  eficaz: string;
  solicitante: string;
}

export interface SgOmBloco {
  total: number;
  eficazes: number;
  porStatus: NameValue[];
  porAmbiente: NameValue[];
  itens: SgOmItem[];
}

// SG-LST-014 — Controle de acessos
export interface SgAcessoItem {
  id: number;
  titulo: string;
  descricao: string;
  motivo: string;
  tipo: string;
  projeto: string;
  solicitante: string;
  cargo: string;
  status: string;
  acessoDevOps: boolean;
  acessoTS: boolean;
  permissoesAdmin: boolean;
  ultimaRevisao: string;
}

export interface SgAcessosBloco {
  total: number;
  pendentes: number;
  porStatus: NameValue[];
  porTipo: NameValue[];
  porProjeto: NameValue[];
  acessoDevOps: SimNao;
  acessoTS: SimNao;
  permissoesAdmin: SimNao;
  itens: SgAcessoItem[];
}

export interface BIInfraSgsiResponse {
  success: boolean;
  message: string;
  atualizadoEm: string | null;
  /** Itens no período filtrado (blocos usam este escopo) */
  totalItens: number;
  /** Itens totais espelhados, sem filtro (distingue "não sincronizado" de "período vazio") */
  totalItensBase: number;
  diasSem: {
    incidentes: number | null;
    riscos: number | null;
    naoConformidades: number | null;
    attMalSucedidas: number | null;
  };
  mudancas: SgMudancasBloco;
  incidentes: SgIncidentesBloco;
  riscos: SgRiscosBloco;
  naoConformidades: SgNcBloco;
  melhorias: SgOmBloco;
  acessos: SgAcessosBloco;
}

// ── Linhas cruas do espelho (sgsi_items) ───────────────────────────────

export interface SgsiRawItem {
  list_key: string; // '010' | '011' | '012' | '014' | '017' | '018'
  item_id: number;
  fields: Record<string, unknown>;
  created_sp: string | null;
  modified_sp: string | null;
}

// ── Helpers puros (testáveis) ──────────────────────────────────────────

/** Valores de um campo: colunas multi-escolha do SharePoint chegam como array. */
function valuesOf(item: SgsiRawItem, ...names: string[]): string[] {
  for (const name of names) {
    const v = item.fields[name];
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v)) {
      const arr = v.map((x) => String(x)).filter(Boolean);
      if (arr.length > 0) return arr;
      continue;
    }
    if (typeof v === 'string') return [v];
    if (typeof v === 'number' || typeof v === 'boolean') return [String(v)];
  }
  return [];
}

function str(item: SgsiRawItem, ...names: string[]): string {
  return valuesOf(item, ...names).join(', ');
}

function num(item: SgsiRawItem, ...names: string[]): number {
  const raw = str(item, ...names).replace(',', '.');
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Campos Sim/Não do SharePoint chegam como boolean ou texto ("Sim"/"Yes"). */
function isSim(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'string') return /^(s|y|true)/i.test(value.trim());
  return false;
}

function isNao(value: unknown): boolean {
  if (value === false) return true;
  if (typeof value === 'string') return /^(n|false)/i.test(value.trim());
  return false;
}

export function countBy(items: SgsiRawItem[], ...fieldNames: string[]): NameValue[] {
  const map = new Map<string, number>();
  for (const item of items) {
    for (const v of valuesOf(item, ...fieldNames)) {
      map.set(v, (map.get(v) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function simNaoOf(items: SgsiRawItem[], ...fieldNames: string[]): SimNao {
  let sim = 0, nao = 0;
  for (const item of items) {
    for (const name of fieldNames) {
      const v = item.fields[name];
      if (v === null || v === undefined || v === '') continue;
      if (isSim(v)) sim++;
      else if (isNao(v)) nao++;
      break;
    }
  }
  return { sim, nao };
}

function statusMatches(item: SgsiRawItem, fieldNames: string[], pattern: RegExp): boolean {
  return pattern.test(str(item, ...fieldNames));
}

function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return null;
  return Math.max(0, Math.floor((now.getTime() - d) / 86400000));
}

function maxDate(items: SgsiRawItem[], pick: (i: SgsiRawItem) => string | null): string | null {
  let max: string | null = null;
  for (const item of items) {
    const v = pick(item);
    if (v && (!max || v > max)) max = v;
  }
  return max;
}

function recentes(items: SgsiRawItem[], limit: number): SgsiRawItem[] {
  return [...items]
    .sort((a, b) => (b.modified_sp ?? b.created_sp ?? '').localeCompare(a.modified_sp ?? a.created_sp ?? ''))
    .slice(0, limit);
}

const DASH = '—';

/** Monta a resposta SGSI completa a partir das linhas espelhadas do SharePoint.
 *  `range` (sprint/período do dashboard) filtra os blocos por data de criação
 *  ou modificação; os contadores "dias sem" são sempre atemporais. */
export function buildSgsiResponse(
  rows: SgsiRawItem[],
  syncedAt: string | null,
  now: Date = new Date(),
  range?: { from: Date; to: Date },
): BIInfraSgsiResponse {
  const inRange = (iso: string | null): boolean => {
    if (!range || !iso) return !range;
    const d = new Date(iso);
    return d >= range.from && d <= range.to;
  };
  const scoped = range
    ? rows.filter((r) => inRange(r.created_sp) || inRange(r.modified_sp))
    : rows;
  const by = (key: string) => scoped.filter((r) => r.list_key === key);
  const byAll = (key: string) => rows.filter((r) => r.list_key === key);
  const l010 = by('010');
  const l011 = by('011');
  const l012 = by('012');
  const l014 = by('014');
  const l017 = by('017');
  const l018 = by('018');

  // ── 010 Mudanças ──
  // Status reais da lista: Realizado | Aprovado | Rejeitado |
  // Aguardando aprovação Gestores | Aguardando aprovação TI.
  // "Pendentes" = em andamento (exclui realizadas e rejeitadas).
  // O campo "Título" da lista carrega o(s) ambiente(s) (multi-escolha) —
  // no PBIX ele era expandido na tabela auxiliar "Aux Ambientes".
  const STATUS_010 = ['Status'];
  const concluidos = l010.filter((i) => statusMatches(i, STATUS_010, /realizado|conclu/i)).length;
  const rejeitados010 = l010.filter((i) => statusMatches(i, STATUS_010, /rejeitad/i)).length;
  const aguardandoGestor = l010.filter((i) => statusMatches(i, STATUS_010, /gestor/i)).length;
  const aguardandoTI = l010.filter((i) => statusMatches(i, STATUS_010, /aguard.*\bti\b/i)).length;
  const mudancas: SgMudancasBloco = {
    total: l010.length,
    concluidos,
    pendentes: Math.max(0, l010.length - concluidos - rejeitados010),
    aguardandoGestor,
    aguardandoTI,
    porStatus: countBy(l010, 'Status'),
    porAmbiente: countBy(l010, 'Ambiente', 'Título'),
    porRisco: countBy(l010, 'Risco'),
    porCategoria: countBy(l010, 'Categoria da mudança', 'Categoria'),
    atualizacoesBemSucedidas: simNaoOf(l010, 'Atualizações bem sucedidas'),
    validacaoTestes: simNaoOf(l010, 'Validação e testes do pacote de atualização'),
    itens: recentes(l010, 300).map((i) => ({
      id: i.item_id,
      chamado: str(i, 'Número do chamado') || `#${i.item_id}`,
      ambiente: str(i, 'Ambiente', 'Título') || DASH,
      tipoMudanca: str(i, 'Tipo Mudança', 'Tipo de mudança') || DASH,
      categoria: str(i, 'Categoria da mudança', 'Categoria') || DASH,
      motivo: str(i, 'Motivo da mudança ou atualização') || DASH,
      status: str(i, 'Status') || DASH,
      solicitante: str(i, 'Solicitante atualização') || DASH,
      aprovadorTI: str(i, 'Aprovador TI') || DASH,
      risco: str(i, 'Risco') || DASH,
      modificado: i.modified_sp ?? i.created_sp ?? '',
    })),
  };

  // ── 017 Incidentes ──
  const STATUS_017 = ['Status', 'Status atual'];
  const incidentes: SgIncidentesBloco = {
    total: l017.length,
    ativos: l017.filter((i) => statusMatches(i, STATUS_017, /ativo|aberto|andamento/i)).length,
    contornados: l017.filter((i) => statusMatches(i, STATUS_017, /contorn/i)).length,
    resolvidos: l017.filter((i) => statusMatches(i, STATUS_017, /resolv|encerr|conclu/i)).length,
    porSLA: countBy(l017, 'SLA'),
    porCategoria: countBy(l017, 'Categoria'),
    itens: recentes(l017, 150).map((i) => ({
      id: i.item_id,
      titulo: str(i, 'Título', 'Title') || DASH,
      ativo: str(i, 'Identificação do Ativo', 'Ativo afetado') || DASH,
      motivo: str(i, 'Motivo incidente', 'Motivo identificado') || DASH,
      priorizacao: str(i, 'Priorização') || DASH,
      protocolo: str(i, 'Protocolo') || `#${i.item_id}`,
      status: str(i, ...STATUS_017) || DASH,
      tipo: str(i, 'Tipo Incidente', 'Tipo') || DASH,
      sla: str(i, 'SLA') || DASH,
      categoria: str(i, 'Categoria') || DASH,
      downtimeHoras: num(i, 'Tempo Downtime'),
      inicio: str(i, 'Data e hora inicio Incidente') || i.created_sp || '',
    })),
  };

  // ── 012 Riscos ──
  // Status reais: Encerrado | Rejeitado | Plano de Tratamento Definido |
  // Em monitoramento TI. Aberto = nem encerrado/tratado nem rejeitado.
  // "Ativo afetado" não existe na lista — o campo real é "O que este risco afeta".
  const STATUS_012 = ['Status solicitação', 'Status'];
  const riscos: SgRiscosBloco = {
    total: l012.length,
    abertos: l012.filter((i) => !statusMatches(i, STATUS_012, /tratad|encerr|conclu|finaliz|rejeitad/i)).length,
    porStatus: countBy(l012, ...STATUS_012),
    porAmbiente: countBy(l012, 'Ambiente Afetado', 'Ambiente afetado'),
    porCID: countBy(l012, 'CID afetado'),
    porCategoriaAmeaca: countBy(l012, 'Categoria Ameaça'),
    porTipoAmeaca: countBy(l012, 'Tipo ameaça', 'Tipo da ameaça'),
    porAtivoAfetado: countBy(l012, 'Ativo afetado', 'O que este risco afeta'),
    tratamentoEficaz: simNaoOf(l012, 'O plano de tratamento de risco foi eficaz?'),
    itens: recentes(l012, 150).map((i) => ({
      id: i.item_id,
      descricao: str(i, 'Informações adicionais', 'Título', 'Title') || DASH,
      ambiente: str(i, 'Ambiente Afetado', 'Ambiente afetado') || DASH,
      cid: str(i, 'CID afetado') || DASH,
      categoriaAmeaca: str(i, 'Categoria Ameaça') || DASH,
      tipoAmeaca: str(i, 'Tipo ameaça') || DASH,
      ativoAfetado: str(i, 'Ativo afetado', 'O que este risco afeta') || DASH,
      status: str(i, ...STATUS_012) || DASH,
      responsavelAjuste: str(i, 'Responsável pelo ajuste') || DASH,
      dataLimite: str(i, 'Data limite solução') || '',
      eficaz: str(i, 'O plano de tratamento de risco foi eficaz?') || DASH,
    })),
  };

  // ── 018 Não conformidades ──
  const naoConformidades: SgNcBloco = {
    total: l018.length,
    recorrentes: l018.filter((i) => isSim(i.fields['Não conformidade recorrente'])).length,
    porStatus: countBy(l018, 'Status Análise', 'Status'),
    porCausaRaiz: countBy(l018, 'Causa Raiz'),
    tratamentoEficaz: simNaoOf(l018, 'Tratamento eficaz'),
    itens: recentes(l018, 150).map((i) => ({
      id: i.item_id,
      processo: str(i, 'Processo afetado') || DASH,
      detalhes: str(i, 'Detalhes NC') || DASH,
      causaRaiz: str(i, 'Causa Raiz') || DASH,
      acao: str(i, 'Ação NC') || DASH,
      recorrente: isSim(i.fields['Não conformidade recorrente']),
      status: str(i, 'Status Análise', 'Status') || DASH,
      eficaz: str(i, 'Tratamento eficaz') || DASH,
      solicitante: str(i, 'Solicitante') || DASH,
      criado: i.created_sp ?? '',
    })),
  };

  // ── 011 Oportunidades de melhoria ──
  const melhorias: SgOmBloco = {
    total: l011.length,
    eficazes: l011.filter((i) => isSim(i.fields['Melhoria foi eficaz?'])).length,
    // "Ambiente afetado" não existe na lista 011 — usa "Processo afetado".
    porStatus: countBy(l011, 'Status Análise', 'Status'),
    porAmbiente: countBy(l011, 'Ambiente afetado', 'Processo afetado'),
    itens: recentes(l011, 150).map((i) => ({
      id: i.item_id,
      oportunidade: str(i, 'Oportunidade de melhoria') || DASH,
      ambiente: str(i, 'Ambiente afetado', 'Processo afetado') || DASH,
      processo: str(i, 'Processo afetado') || DASH,
      beneficios: str(i, 'Beneficos da melhoria', 'Benefícios da melhoria') || DASH,
      status: str(i, 'Status Análise', 'Status') || DASH,
      eficaz: str(i, 'Melhoria foi eficaz?') || DASH,
      solicitante: str(i, 'Solicitante') || DASH,
    })),
  };

  // ── 014 Acessos ──
  const STATUS_014 = ['Status solicitação', 'Status'];
  const acessos: SgAcessosBloco = {
    total: l014.length,
    pendentes: l014.filter((i) => statusMatches(i, STATUS_014, /pendente|aguard|análise|analise/i)).length,
    porStatus: countBy(l014, ...STATUS_014),
    porTipo: countBy(l014, 'Tipo solicitação'),
    porProjeto: countBy(l014, 'Projeto'),
    acessoDevOps: simNaoOf(l014, 'Acesso ao DevOps'),
    acessoTS: simNaoOf(l014, 'Acesso ao TS'),
    permissoesAdmin: simNaoOf(l014, 'Permissões administrativas'),
    itens: recentes(l014, 300).map((i) => ({
      id: i.item_id,
      titulo: str(i, 'TItulo', 'Título', 'Title') || `#${i.item_id}`,
      descricao: str(i, 'Descrição acesso') || DASH,
      motivo: str(i, 'Motivo acesso') || DASH,
      tipo: str(i, 'Tipo solicitação') || DASH,
      projeto: str(i, 'Projeto') || DASH,
      solicitante: str(i, 'Solicitante') || DASH,
      cargo: DASH, // jobTitle do solicitante não vem no espelho v1 (campo pessoa)
      status: str(i, ...STATUS_014) || DASH,
      acessoDevOps: isSim(i.fields['Acesso ao DevOps']),
      acessoTS: isSim(i.fields['Acesso ao TS']),
      permissoesAdmin: isSim(i.fields['Permissões administrativas']),
      ultimaRevisao: str(i, 'Data ultima revisão', 'Data última revisão') || '',
    })),
  };

  // ── Gestão à vista: dias sem ocorrências (atemporal — ignora o período) ──
  const a010 = byAll('010');
  const ultimaAttMalSucedida = maxDate(
    a010.filter((i) => isNao(i.fields['Atualizações bem sucedidas'])),
    (i) => i.modified_sp ?? i.created_sp,
  );
  const diasSem = {
    incidentes: daysSince(maxDate(byAll('017'), (i) => str(i, 'Data e hora inicio Incidente') || i.created_sp), now),
    riscos: daysSince(maxDate(byAll('012'), (i) => i.created_sp), now),
    naoConformidades: daysSince(maxDate(byAll('018'), (i) => i.created_sp), now),
    attMalSucedidas: daysSince(ultimaAttMalSucedida, now),
  };

  return {
    success: true,
    message: 'sgsi-mirror',
    atualizadoEm: syncedAt,
    totalItens: scoped.length,
    totalItensBase: rows.length,
    diasSem,
    mudancas,
    incidentes,
    riscos,
    naoConformidades,
    melhorias,
    acessos,
  };
}

// ── Hook ───────────────────────────────────────────────────────────────

export function useBIInfraSgsi(dateFrom?: Date, dateTo?: Date) {
  const fromStr = dateFrom ? dateFrom.toISOString().split('T')[0] : null;
  const toStr = dateTo ? dateTo.toISOString().split('T')[0] : null;
  return useQuery<BIInfraSgsiResponse>({
    queryKey: ['bi-infra', 'sgsi', fromStr, toStr],
    queryFn: async () => {
      // Paginado: o espelho passa de 3,7k itens e o PostgREST limita 1000/request.
      const items = await fetchAllRows<SgsiRawItem>((from, to) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('sgsi_items')
          .select('list_key, item_id, fields, created_sp, modified_sp')
          .range(from, to)
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lists } = await (supabase as any)
        .from('sgsi_lists')
        .select('synced_at')
        .order('synced_at', { ascending: false })
        .limit(1);

      return buildSgsiResponse(
        items,
        lists?.[0]?.synced_at ?? null,
        new Date(),
        dateFrom && dateTo ? { from: dateFrom, to: dateTo } : undefined,
      );
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
