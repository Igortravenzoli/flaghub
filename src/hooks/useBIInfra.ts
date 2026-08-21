import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import {
  DASH, countBy, isNao, isSim, num, recentes, simNaoOf, statusMatches, str,
  type NameValue, type SgsiRawItem, type SimNao,
} from '@/lib/sgsiFields';

// ── Re-exports de compatibilidade (INC-1) ───────────────────────────────
// Os helpers e tipos puros migraram para `@/lib/sgsiFields` para que o card de
// Customer Service (`useCsIncidentesDeclarados`) não precise arrastar a
// paginação do espelho inteiro. Estes re-exports mantêm os call sites intactos:
//   • src/test/sgsiBuild.test.ts        → countBy, simNaoOf, SgsiRawItem
//   • src/components/infraestrutura/BIInfraSgsiPanel.tsx → NameValue, SimNao
//   • src/test/infraExecutivoTv.test.tsx → spread do namespace (precisa dos VALORES)
// `export { countBy, simNaoOf }` tem de ser re-export de VALOR: com `export type`
// as funções sairiam do namespace e os testes acima quebrariam.
export { countBy, simNaoOf };
export type { NameValue, SgsiRawItem, SimNao };

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

// `NameValue` e `SimNao` vivem em `@/lib/sgsiFields` e são re-exportados acima.

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
  aprovadorGestor: string;
  risco: string;
  /** Data de abertura da solicitação (created_sp do SharePoint). */
  criado: string;
  /** "Data e Hora conclusão" — pode vir como texto livre da lista. */
  conclusao: string;
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
  /** Texto do incidente ("Descrição incidente"). */
  descricao: string;
  /** Solução aplicada ("Solução corretiva" / "Lições aprendidas"). */
  solucao: string;
  /** Produto afetado ("Produto"). */
  produto: string;
}

export interface SgIncidentesBloco {
  total: number;
  ativos: number;
  contornados: number;
  resolvidos: number;
  porSLA: NameValue[];
  /** % de incidentes resolvidos dentro do SLA (campo SLA = Sim / (Sim+Não)). */
  pctDentroSla: number | null;
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
  /** Solução/tratamento ("Descrição da ação a ser tomada" ou "Controle a ser adotado"). */
  solucao: string;
}

export interface SgRiscosBloco {
  total: number;
  abertos: number;
  /** % de riscos resolvidos (encerrados) dentro de 30 dias da abertura. */
  pctResolvido30d: number | null;
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
    /** Recorde: maior intervalo (dias) entre registros consecutivos da lista,
     *  considerando também o intervalo em curso. Quando `incidentes` empata com
     *  este valor, a sequência atual É o recorde (modo TV — aprovado 20/08). */
    maiorIntervaloIncidentes: number | null;
    maiorIntervaloRiscos: number | null;
  };
  mudancas: SgMudancasBloco;
  incidentes: SgIncidentesBloco;
  riscos: SgRiscosBloco;
  naoConformidades: SgNcBloco;
  melhorias: SgOmBloco;
  acessos: SgAcessosBloco;
}

// Linhas cruas do espelho (`SgsiRawItem`), parsing de campos (`valuesOf`/`str`/
// `num`/`isSim`/`isNao`/`countBy`/`simNaoOf`/`statusMatches`/`recentes`) e `DASH`
// vivem em `@/lib/sgsiFields` e sao re-exportados no topo deste arquivo.
// Abaixo ficam so os helpers exclusivos desta visao (contadores "dias sem").

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

/** Maior intervalo (dias) entre registros consecutivos de uma lista, incluindo
 *  o intervalo em curso (do último registro até `now`) — assim "dias sem" nunca
 *  supera o recorde sem que o recorde acompanhe. Usa `created_sp` (mesma data
 *  dos contadores "dias sem"); null sem registros. */
function maiorIntervaloDias(items: SgsiRawItem[], now: Date): number | null {
  const ts = items
    .map((i) => (i.created_sp ? new Date(i.created_sp).getTime() : NaN))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  if (ts.length === 0) return null;
  let max = now.getTime() - ts[ts.length - 1];
  for (let k = 1; k < ts.length; k++) max = Math.max(max, ts[k] - ts[k - 1]);
  return Math.max(0, Math.floor(max / 86400000));
}

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
      // "Solicitante atualização" fica vazio na lista — o solicitante real
      // costuma ser quem criou o item (nomes resolvidos do lookupId no sync).
      solicitante: str(i, 'Solicitante atualização') || str(i, 'Criado por') || DASH,
      aprovadorTI: str(i, 'Aprovador TI') || DASH,
      aprovadorGestor: str(i, 'Aprovador Gestor') || DASH,
      risco: str(i, 'Risco') || DASH,
      criado: i.created_sp ?? '',
      conclusao: str(i, 'Data e Hora conclusão'),
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
    pctDentroSla: (() => {
      const sim = l017.filter((i) => str(i, 'SLA').trim().toLowerCase() === 'sim').length;
      const nao = l017.filter((i) => { const v = str(i, 'SLA').trim().toLowerCase(); return v === 'não' || v === 'nao'; }).length;
      return sim + nao > 0 ? Math.round((sim / (sim + nao)) * 100) : null;
    })(),
    porCategoria: countBy(l017, 'Categoria'),
    itens: recentes(l017, 150).map((i) => ({
      id: i.item_id,
      // Nos lançamentos recentes o Título vem vazio — cai para o Produto afetado.
      titulo: str(i, 'Título', 'Title', 'Produto') || DASH,
      ativo: str(i, 'Identificação do Ativo', 'Ativo afetado') || DASH,
      // 'Motivo identificado' é Sim/Não (não é texto) — a causa fica só no 'Motivo incidente'.
      motivo: str(i, 'Motivo incidente') || DASH,
      priorizacao: str(i, 'Priorização') || DASH,
      protocolo: str(i, 'Protocolo') || `#${i.item_id}`,
      status: str(i, ...STATUS_017) || DASH,
      tipo: str(i, 'Tipo Incidente', 'Tipo') || DASH,
      sla: str(i, 'SLA') || DASH,
      categoria: str(i, 'Categoria') || DASH,
      downtimeHoras: num(i, 'Tempo Downtime'),
      inicio: str(i, 'Data e hora inicio Incidente') || i.created_sp || '',
      descricao: str(i, 'Descrição incidente') || DASH,
      solucao: str(i, 'Solução corretiva', 'Lições aprendidas') || DASH,
      produto: str(i, 'Produto') || DASH,
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
    pctResolvido30d: (() => {
      const resolv = l012.filter((i) => statusMatches(i, STATUS_012, /encerr|conclu|finaliz|tratad/i));
      const within = resolv.filter((i) => {
        if (!i.created_sp || !i.modified_sp) return false;
        const dias = (new Date(i.modified_sp).getTime() - new Date(i.created_sp).getTime()) / 86400000;
        return dias >= 0 && dias <= 30;
      }).length;
      return resolv.length > 0 ? Math.round((within / resolv.length) * 100) : null;
    })(),
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
      solucao: str(i, 'Descrição da ação a ser tomada', 'Controle a ser adotado') || DASH,
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
    // "Data e hora inicio Incidente" é texto livre na lista (ex.: "Dia:
    // 09/10/2023 - Horário: 06h27") — impossível parsear; usa a criação do item.
    incidentes: daysSince(maxDate(byAll('017'), (i) => i.created_sp), now),
    riscos: daysSince(maxDate(byAll('012'), (i) => i.created_sp), now),
    naoConformidades: daysSince(maxDate(byAll('018'), (i) => i.created_sp), now),
    attMalSucedidas: daysSince(ultimaAttMalSucedida, now),
    maiorIntervaloIncidentes: maiorIntervaloDias(byAll('017'), now),
    maiorIntervaloRiscos: maiorIntervaloDias(byAll('012'), now),
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
