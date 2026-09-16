import { useCallback } from 'react';
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
  /** "Atualizações bem sucedidas" com os mesmos predicados de `simNaoOf` —
   *  o drill do KPI filtra por aqui e precisa bater com a contagem dele. */
  atualizacaoBemSucedida: 'Sim' | 'Não' | typeof DASH;
  /** Por que a atualização foi (ou não) bem sucedida — coluna "Comentário
   *  atualizações" da lista SG-LST-010. */
  justificativa: string;
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
  /** Cobertura da avaliação de eficácia (campo "O plano de tratamento de risco
   *  foi eficaz?"). `tratamentoEficaz` so conta quem RESPONDEU Sim/Nao — sozinho
   *  ele exibe "100%" sem dizer quantos deveriam ter respondido. O auditor abre a
   *  lista e acha os silenciosos; melhor o painel os mostrar primeiro. */
  eficaciaCobertura: {
    /** Encerrados no recorte: quem já deve ter veredito de eficácia. */
    elegiveis: number;
    /** Responderam Sim ou Não — é o denominador do % exibido. */
    respondidos: number;
    /** Ainda em tratamento: prazo em aberto, fora do denominador por direito. */
    emTratamento: number;
    /** Menor "Data limite solução" entre os em tratamento (ISO), ou null. */
    proximoLimite: string | null;
  };
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
  /** "Aprovador TI" — coluna de pessoa: o nome vem resolvido pelo sync. */
  aprovadorTI: string;
  /** "Aprovador Gestor" — na 014 é texto (já chega com o nome). */
  aprovadorGestor: string;
  cargo: string;
  status: string;
  acessoDevOps: boolean;
  acessoTS: boolean;
  permissoesAdmin: boolean;
  ultimaRevisao: string;
  /** Item no SharePoint (DispForm), gravado pelo sync em `_sharepoint_url`;
   *  '' quando ausente. Substitui as colunas de senha, que saíram do espelho. */
  link: string;
  /** Caixa "<---Preenchimento TI--->": marcada = a TI validou o acesso (revogou,
   *  alterou ou manteve). Com a data da última revisão, é evidência de auditoria. */
  revisaoTI: 'Acesso Revisado' | 'A revisar';
  /** Marcado como revisado, mas sem "Data ultima revisão" — sem evidência datada. */
  revisadoSemData: boolean;
  /** "Tipo liberação". */
  tipoLiberacao: 'Definitiva' | 'Provisória' | typeof DASH;
  /** "Data fim liberação provisória" (ISO); '' quando ausente. */
  fimLiberacao: string;
  /** Só em provisório (null nos demais). A lista não tem data de revogação, então a
   *  revisão da TI marcada E datada vale como evidência de que o acesso foi revogado.
   *  Rejeitado ou ainda aguardando aprovação nunca liberou acesso: "Não se aplica".
   *  Sem evidência, quem ainda está dentro do prazo fica "No prazo"; o vencido (ou
   *  sem data fim) fica "Sem evidência" — é o que a auditoria cobra. */
  evidenciaRevogacao: 'Com evidência' | 'No prazo' | 'Sem evidência' | 'Não se aplica' | null;
  /** "Categoria Liberação" (multi-escolha) normalizada — "Banco de dados", "Acesso a
   *  servidor", "Acesso pastas", "Acesso VPN"…; [] quando vazia. */
  categorias: string[];
  /** Texto de "Categoria Liberação" como está na lista (achatado, sem repetir) — o
   *  agrupamento perde detalhe ("Vpn IBM Cloud" e "Vpn Flag Local" viram "Acesso VPN"). */
  categoriasLista: string[];
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
  // Revisão da TI e liberação — contam os mesmos campos que o drill da tabela filtra.
  revisados: number;
  aRevisar: number;
  revisadosSemData: number;
  definitivos: number;
  provisorios: number;
  provisoriosComEvidencia: number;
  provisoriosNoPrazo: number;
  provisoriosSemEvidencia: number;
  /** Provisórios rejeitados ou ainda aguardando aprovação: nunca liberaram acesso. */
  provisoriosNaoAplica: number;
  /** Tipo de acesso: itens por categoria (um item conta em cada categoria que tiver). */
  porCategoria: NameValue[];
  /** Itens sem nenhuma categoria preenchida. */
  semCategoria: number;
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
 *  ou modificação; os contadores "dias sem" são sempre atemporais. Acessos (014)
 *  ignora `range`: só `periodoAcessos` — o período do calendário — recorta a
 *  lista, pela vigência do acesso (regra no bloco 014). */
export function buildSgsiResponse(
  rows: SgsiRawItem[],
  syncedAt: string | null,
  now: Date = new Date(),
  range?: { from: Date; to: Date },
  periodoAcessos?: { from: Date; to: Date },
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
  // 012 recorta SÓ por `created_sp` — o dia em que a linha entrou na lista.
  // Os outros blocos seguem criação OU modificação; o risco não pode, porque
  // `modified_sp` é volátil: anexar evidência ou corrigir um texto puxaria o
  // registro para dentro da janela sem que risco nenhum tivesse mudado, e o
  // mesmo filtro devolveria um conjunto diferente a cada auditoria. Com
  // `created_sp` o auditor reproduz a conta filtrando "Criado" na própria
  // SG-LST-012. Decisão do Igor, 16/09/2026.
  const l012 = range
    ? rows.filter((r) => r.list_key === '012' && inRange(r.created_sp))
    : rows.filter((r) => r.list_key === '012');
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
    // Sem teto (era 300): os KPIs clicáveis contam o período inteiro e o drill
    // filtra ESTA lista — com teto, "Não · 12 itens" abriria uma tabela com 9.
    itens: recentes(l010, l010.length).map((i) => ({
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
      atualizacaoBemSucedida: isSim(i.fields['Atualizações bem sucedidas']) ? 'Sim'
        : isNao(i.fields['Atualizações bem sucedidas']) ? 'Não' : DASH,
      // Coluna "Comentário atualizações" da lista (nome confirmado pelo Igor em
      // 10/09/2026): é onde se registra por que a atualização falhou.
      justificativa: str(i, 'Comentário atualizações') || DASH,
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
  const ENCERRADO_012 = /tratad|encerr|conclu|finaliz/i;
  // Em tratamento: nem encerrado nem rejeitado — prazo ainda correndo, então
  // fica FORA do denominador da eficácia por direito, não por omissão.
  const emTratamento012 = l012.filter((i) => !statusMatches(i, STATUS_012, /tratad|encerr|conclu|finaliz|rejeitad/i));
  const eficaz012 = simNaoOf(l012, 'O plano de tratamento de risco foi eficaz?');
  const riscos: SgRiscosBloco = {
    total: l012.length,
    abertos: emTratamento012.length,
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
    tratamentoEficaz: eficaz012,
    eficaciaCobertura: {
      elegiveis: l012.filter((i) => statusMatches(i, STATUS_012, ENCERRADO_012)).length,
      respondidos: eficaz012.sim + eficaz012.nao,
      emTratamento: emTratamento012.length,
      proximoLimite: emTratamento012
        .map((i) => str(i, 'Data limite solução'))
        .filter((v) => /^\d{4}-\d{2}-\d{2}/.test(v))
        .sort()[0] ?? null,
    },
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
  // "Data fim liberação provisória" é dia de calendário: chega como meia-noite UTC
  // ("2026-09-09T00:00:00Z", o formato visto na 014) ou de Brasília (T03:00:00Z).
  // Nos dois casos o dia é o do texto, e o acesso vale até o fim dele em Brasília.
  const fimDoDia = (iso: string): number | null => {
    const dia = /^(\d{4}-\d{2}-\d{2})/.exec(iso)?.[1];
    if (!dia) return null;
    const fim = Date.parse(`${dia}T23:59:59.999-03:00`);
    return Number.isFinite(fim) ? fim : null;
  };
  const dentroDoPrazo = (fimIso: string): boolean => {
    const fim = fimDoDia(fimIso);
    return fim !== null && now.getTime() <= fim;
  };
  // Leitura única dos campos que decidem revisão, liberação e vigência: o recorte
  // do calendário e os itens da tela não podem divergir na interpretação.
  const leitura014 = (i: SgsiRawItem) => {
    const ultimaRevisao = str(i, 'Data ultima revisão', 'Data última revisão') || '';
    // Caixa de seleção do SharePoint: chega como boolean (true = marcada).
    const revisado = isSim(i.fields['<---Preenchimento TI--->']);
    const tipo = str(i, 'Tipo liberação');
    const status = str(i, ...STATUS_014) || DASH;
    const tipoLiberacao: SgAcessoItem['tipoLiberacao'] = /provis/i.test(tipo) ? 'Provisória' : /definit/i.test(tipo) ? 'Definitiva' : DASH;
    return {
      ultimaRevisao,
      revisado,
      tipoLiberacao,
      fimLiberacao: str(i, 'Data fim liberação provisória') || '',
      status,
      // A lista não tem data de revogação: a revisão da TI marcada E datada é a evidência.
      comEvidencia: revisado && !!ultimaRevisao,
      // Rejeitado ou aguardando aprovação nunca liberou acesso.
      naoLiberado: /rejeitad|aguard/i.test(status),
    };
  };
  // Acessos é estoque, não fluxo: a auditoria de revisão/revogação precisa da base
  // inteira. Com o recorte da sprint, o provisório vencido que ninguém tocou (sem
  // modified_sp no período) sumia da tela — justamente o que a auditoria cobra.
  // Por isso a sprint não recorta a 014. O calendário recorta pela VIGÊNCIA: entra
  // o acesso pedido até o último dia do período e sem fim comprovado antes do
  // primeiro (dias de calendário em Brasília). Sem data de revogação na lista, só a
  // revisão da TI com evidência comprova o fim:
  //  • rejeitado nunca liberou — conta só no período em que foi pedido;
  //  • aguardando aprovação é pedido em aberto até hoje;
  //  • provisório com evidência vale até a data fim ou a revisão, o que vier depois;
  //  • definitivo revogado com evidência vale até a revisão;
  //  • o resto (definitivo ativo, provisório sem evidência) segue vigente — o
  //    provisório vencido sem evidência aparece em todo período posterior.
  const todos014 = byAll('014');
  const l014 = (() => {
    if (!periodoAcessos) return todos014;
    const dia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // O seletor entrega meia-noite local do dia escolhido: vale o dia, não a hora.
    const inicio = Date.parse(`${dia(periodoAcessos.from)}T00:00:00.000-03:00`);
    const fim = Date.parse(`${dia(periodoAcessos.to)}T23:59:59.999-03:00`);
    return todos014.filter((i) => {
      const pedido = i.created_sp ? Date.parse(i.created_sp) : NaN;
      if (pedido > fim) return false;
      const l = leitura014(i);
      const revisao = Date.parse(l.ultimaRevisao);
      let encerrado: number | null = null; // null = sem fim comprovado
      if (/rejeitad/i.test(l.status)) encerrado = Number.isFinite(pedido) ? pedido : null;
      else if (!l.naoLiberado && l.comEvidencia && Number.isFinite(revisao)) {
        if (l.tipoLiberacao === 'Provisória') encerrado = Math.max(revisao, fimDoDia(l.fimLiberacao) ?? revisao);
        else if (/revog/i.test(l.status)) encerrado = revisao;
      }
      return encerrado === null || encerrado >= inicio;
    });
  })();
  // "Categoria Liberação" (multi-escolha) chega como array, string JSON de array e
  // até array com JSON dentro (visto em produção); os sinônimos viram um nome só,
  // e o texto original fica guardado para o drawer e a busca.
  const CATEGORIAS_014: [RegExp, string][] = [
    [/banco/i, 'Banco de dados'],
    [/servidor/i, 'Acesso a servidor'],
    [/pasta/i, 'Acesso pastas'],
    [/vpn/i, 'Acesso VPN'],
    [/c[óo]digo/i, 'Acesso ao código fonte'],
    [/devops/i, 'DevOps'],
    [/primeiro/i, 'Primeiro acesso'],
  ];
  const categoriasDe = (valor: unknown): Pick<SgAcessoItem, 'categorias' | 'categoriasLista'> => {
    const brutos = (Array.isArray(valor) ? valor : valor == null ? [] : [valor]).flatMap((v): string[] => {
      const s = String(v).trim();
      if (s.startsWith('[') && s.endsWith(']')) {
        try {
          const arr: unknown = JSON.parse(s);
          if (Array.isArray(arr)) return arr.map((x) => String(x).trim());
        } catch { /* texto comum que começa com colchete */ }
      }
      return [s];
    });
    const categorias: string[] = [];
    const categoriasLista: string[] = [];
    for (const nome of brutos) {
      if (!nome) continue;
      // original sem repetir, ignorando a caixa ("Acesso pastas" = "Acesso Pastas")
      if (!categoriasLista.some((l) => l.toLowerCase() === nome.toLowerCase())) categoriasLista.push(nome);
      const canonico = CATEGORIAS_014.find(([re]) => re.test(nome))?.[1] ?? nome;
      if (!categorias.includes(canonico)) categorias.push(canonico);
    }
    return { categorias, categoriasLista };
  };
  // Sem teto (era 300): a 014 passa de 700 itens e os KPIs de revisão/liberação
  // filtram esta lista no drill — com teto, contagem e tabela divergiriam.
  const itens014 = recentes(l014, l014.length).map((i): SgAcessoItem => {
    const { ultimaRevisao, revisado, tipoLiberacao, fimLiberacao, status, comEvidencia, naoLiberado } = leitura014(i);
    return {
      id: i.item_id,
      titulo: str(i, 'TItulo', 'Título', 'Title') || `#${i.item_id}`,
      descricao: str(i, 'Descrição acesso') || DASH,
      motivo: str(i, 'Motivo acesso') || DASH,
      tipo: str(i, 'Tipo solicitação') || DASH,
      projeto: str(i, 'Projeto') || DASH,
      solicitante: str(i, 'Solicitante') || DASH,
      aprovadorTI: str(i, 'Aprovador TI') || DASH,
      aprovadorGestor: str(i, 'Aprovador Gestor') || DASH,
      cargo: DASH, // jobTitle do solicitante não vem no espelho v1 (campo pessoa)
      status,
      acessoDevOps: isSim(i.fields['Acesso ao DevOps']),
      acessoTS: isSim(i.fields['Acesso ao TS']),
      permissoesAdmin: isSim(i.fields['Permissões administrativas']),
      ultimaRevisao,
      // Só https: o valor vira href na tabela e no drawer.
      link: /^https:\/\//i.test(str(i, '_sharepoint_url')) ? str(i, '_sharepoint_url') : '',
      revisaoTI: revisado ? 'Acesso Revisado' : 'A revisar',
      revisadoSemData: revisado && !ultimaRevisao,
      tipoLiberacao,
      fimLiberacao,
      // Evidência e "nunca liberou" vêm da leitura014 — a mesma do recorte do calendário.
      evidenciaRevogacao: tipoLiberacao !== 'Provisória' ? null
        : naoLiberado ? 'Não se aplica'
          : comEvidencia ? 'Com evidência'
            : dentroDoPrazo(fimLiberacao) ? 'No prazo' : 'Sem evidência',
      ...categoriasDe(i.fields['Categoria Liberação']),
    };
  });
  const conta014 = (p: (a: SgAcessoItem) => boolean) => itens014.filter(p).length;
  const porCategoria014 = (() => {
    const mapa = new Map<string, number>();
    for (const a of itens014) for (const c of a.categorias) mapa.set(c, (mapa.get(c) ?? 0) + 1);
    return [...mapa.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((x, y) => y.value - x.value || x.name.localeCompare(y.name, 'pt-BR'));
  })();
  const acessos: SgAcessosBloco = {
    total: l014.length,
    pendentes: l014.filter((i) => statusMatches(i, STATUS_014, /pendente|aguard|análise|analise/i)).length,
    porStatus: countBy(l014, ...STATUS_014),
    porTipo: countBy(l014, 'Tipo solicitação'),
    porProjeto: countBy(l014, 'Projeto'),
    acessoDevOps: simNaoOf(l014, 'Acesso ao DevOps'),
    acessoTS: simNaoOf(l014, 'Acesso ao TS'),
    permissoesAdmin: simNaoOf(l014, 'Permissões administrativas'),
    revisados: conta014((a) => a.revisaoTI === 'Acesso Revisado'),
    aRevisar: conta014((a) => a.revisaoTI === 'A revisar'),
    revisadosSemData: conta014((a) => a.revisadoSemData),
    definitivos: conta014((a) => a.tipoLiberacao === 'Definitiva'),
    provisorios: conta014((a) => a.tipoLiberacao === 'Provisória'),
    provisoriosComEvidencia: conta014((a) => a.evidenciaRevogacao === 'Com evidência'),
    provisoriosNoPrazo: conta014((a) => a.evidenciaRevogacao === 'No prazo'),
    provisoriosSemEvidencia: conta014((a) => a.evidenciaRevogacao === 'Sem evidência'),
    provisoriosNaoAplica: conta014((a) => a.evidenciaRevogacao === 'Não se aplica'),
    porCategoria: porCategoria014,
    semCategoria: conta014((a) => a.categorias.length === 0),
    itens: itens014,
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
    // O 012 tem recorte próprio (só `created_sp`): contá-lo pelo `scoped` faria
    // o cabeçalho "N de M itens" discordar da soma das seções.
    totalItens: scoped.filter((r) => r.list_key !== '012').length + l012.length,
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

/** Espelho bruto do SGSI: baixado uma vez e compartilhado por todos os períodos. */
interface SgsiEspelho {
  items: SgsiRawItem[];
  syncedAt: string | null;
  /** Marca de cada busca: força o select a remontar com a hora atual. */
  fetchedAt: number;
}

export function useBIInfraSgsi(dateFrom?: Date, dateTo?: Date, acessosNoPeriodo = false) {
  const fromMs = dateFrom?.getTime();
  const toMs = dateTo?.getTime();
  // O período muda a montagem, não o download. Com o período na chave, cada troca
  // de sprint/calendário — e a Visão Executiva ao lado da Gestão SG — baixava o
  // espelho inteiro de novo (egress, com a cota da Supabase no limite).
  const montar = useCallback((espelho: SgsiEspelho): BIInfraSgsiResponse => {
    const range = fromMs !== undefined && toMs !== undefined ? { from: new Date(fromMs), to: new Date(toMs) } : undefined;
    // Só o período do calendário recorta Acessos (pela vigência); a sprint não.
    return buildSgsiResponse(espelho.items, espelho.syncedAt, new Date(), range, acessosNoPeriodo ? range : undefined);
  }, [fromMs, toMs, acessosNoPeriodo]);
  return useQuery<SgsiEspelho, Error, BIInfraSgsiResponse>({
    queryKey: ['bi-infra', 'sgsi-rows'],
    select: montar,
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

      // fetchedAt: um refetch com as mesmas linhas devolveria o MESMO objeto (structural
      // sharing) e o select não rodaria — "No prazo" e "dias sem" ficariam com a hora
      // da montagem anterior. Com a marca, cada busca remonta com a hora atual.
      return { items, syncedAt: lists?.[0]?.synced_at ?? null, fetchedAt: Date.now() };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
