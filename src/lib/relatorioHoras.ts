/**
 * Relatório de horas apontadas do período, em PDF pela impressão do navegador.
 *
 * É o fechamento que o gestor leva para fora do portal: consolidado por fábrica
 * e área, uma seção por colaborador (calendário e itens), horas por sistema,
 * horas por cliente e os KPIs macro das sprints do período.
 *
 * Tudo aqui é função pura sobre dado já carregado — a busca e a impressão ficam
 * em `relatorioHorasDados.ts`. As horas saem de `v_horas_negocio`, a mesma fonte
 * do TimeLog Executivo, então o total do relatório é o total da tela: VDESK e
 * DevOps são a mesma hora e a view já consolida com `greatest()`, sem somar.
 *
 * O relatório é HTML com `@page`, e não jsPDF, porque o layout (calendário,
 * barras, cartões) é o que o torna legível; redesenhar isso célula a célula no
 * autotable custaria mais do que a exportação inteira.
 */
import type { HoraNegocioRow } from '@/hooks/useHorasNegocio';
import { SEM_CLIENTE, SEM_PRODUTO } from '@/hooks/useHorasNegocio';
import type { SnapshotScopeBreakdown } from '@/hooks/useSprintSnapshots';
import { GRUPOS_HORAS, SQUADS, buildAlocacaoMap, casasDe, normName, type CasaAlocada } from '@/lib/fabricaRoster';
import { GRUPOS, fabricasDoGrupo, grupoDaFabrica, rotuloFabrica, rotuloFabricaLongo } from '@/lib/fabricaOrganograma';
import { diaLocal, diasUteisAusentes, type Ausencia } from '@/lib/capacidade';
import { businessDaysBetween } from '@/lib/sprintCalendar';
import {
  indexarCodigo, codigoDoItem, rotuloEstadoPr, diaBrasilia,
  type CodigoPeriodo, type CodigoPessoa, type AutorSemVinculo,
} from '@/lib/relatorioHorasCodigo';

// ─── Entrada ──────────────────────────────────────────────────────────────────

export interface RosterRelatorio {
  colaborador: string;
  squad: string;
  papel: string | null;
  /** Percentual da pessoa nesta fábrica; ausente = 100. Uma linha por fábrica. */
  alocacao_pct?: number | null;
}

/** Foto de fim de sprint (`sprint_indicator_snapshots`), só o que o relatório usa. */
export interface SnapshotRelatorio {
  sprint_code: string;
  sprint_start_date: string;
  sprint_end_date: string;
  total_demands: number | null;
  planned_demands: number | null;
  unplanned_demands: number | null;
  delivered_demands: number | null;
  finalized_demands: number | null;
  transbordo_count: number | null;
  avg_lead_time_days: number | null;
  qa_concluidos: number | null;
  qa_concluidos_com_retorno: number | null;
  qa_return_rate_pct: number | null;
  qa_avg_return_cycles: number | null;
  category_breakdown: {
    geral: SnapshotScopeBreakdown;
    fabricas: Record<string, SnapshotScopeBreakdown>;
  } | null;
}

export interface EntradaRelatorio {
  /** yyyy-mm-dd, inclusivo. */
  dateFrom: string;
  dateTo: string;
  rows: HoraNegocioRow[];
  roster: RosterRelatorio[];
  ausencias: Ausencia[];
  snapshots: SnapshotRelatorio[];
  /**
   * Commits e PRs do período. `null`/ausente = coleta indisponível (tabela
   * ainda não criada, sem permissão): o relatório sai sem as partes de código
   * em vez de mostrar zero, que se leria como "ninguém commitou".
   */
  codigo?: CodigoPeriodo | null;
  /** Momento em que os dados foram lidos; vira o carimbo do cabeçalho. */
  extraidoEm: Date;
}

// ─── Modelo ───────────────────────────────────────────────────────────────────

export const SEM_GRUPO = 'SEM CADASTRO';

export interface ItemRelatorio {
  id: number | null;
  titulo: string;
  tipo: string;
  estado: string;
  lancamentos: number;
  devops: number;
  vdesk: number;
  horas: number;
  /** PBI pai, quando o item é Task: é para ele que o PR costuma apontar. */
  pbiId: number | null;
  /** Commits e PRs da própria pessoa que citam o item ou o PBI pai. */
  commits: number;
  prs: number;
}

export interface PessoaRelatorio {
  nome: string;
  /** Fábrica principal (a de maior alocação) — é onde a pessoa é listada. */
  grupo: string;
  /** Todas as fábricas da pessoa, com o rateio das horas. Vazio = sem cadastro. */
  casas: CasaAlocada[];
  lead: boolean;
  devops: number;
  vdesk: number;
  horas: number;
  lancDevops: number;
  lancVdesk: number;
  /** Dias distintos com pelo menos um apontamento. */
  dias: number;
  /** Dias úteis de ausência dentro do período. */
  ferias: number;
  /** yyyy-mm-dd de cada dia de ausência (inclui fim de semana) no período. */
  diasAusentes: Set<string>;
  /** yyyy-mm-dd → horas do dia por fonte. */
  porDia: Map<string, { devops: number; vdesk: number }>;
  itens: ItemRelatorio[];
  /** Código da pessoa no período; `null` quando não há nenhum ou não há coleta. */
  codigo: CodigoPessoa | null;
}

/** Visão geral do código no período. Só existe quando a coleta respondeu. */
export interface CodigoModelo {
  totalCommits: number;
  totalPrs: number;
  /** Autores que não casam com ninguém do cadastro de colaboradores. */
  semVinculo: AutorSemVinculo[];
  /** Quem tem commit ou PR no período e nenhuma hora lançada. */
  semHoras: Array<{ nome: string; commits: number; prs: number }>;
}

export interface LinhaDimensao {
  chave: string;
  horas: number;
  lancamentos: number;
  itens: number;
  pessoas: number;
  semClassificacao: boolean;
}

/** Linha do resumo por fábrica: horas já rateadas pela alocação. */
export interface ResumoFabrica {
  codigo: string;
  rotulo: string;
  cor: string;
  pessoas: number;
  devops: number;
  vdesk: number;
  horas: number;
}

/** Consolidado de um grupo do organograma (soma das fábricas dele). */
export interface ResumoGrupo extends ResumoFabrica {
  fabricas: ResumoFabrica[];
}

export interface ModeloRelatorio {
  dateFrom: string;
  dateTo: string;
  diasUteis: number;
  extraidoEm: Date;
  pessoas: PessoaRelatorio[];
  /** Grupos com gente, na ordem de exibição (fábricas, áreas, sem cadastro). */
  grupos: string[];
  /** Cadastrados no roster que não apontaram no período. */
  semApontamento: Array<{ nome: string; grupo: string }>;
  /** Grupo › fábrica, na ordem do organograma; só o que tem hora no período. */
  resumoGrupos: ResumoGrupo[];
  total: { horas: number; devops: number; vdesk: number; lancamentos: number; itens: number; pessoas: number };
  sistemas: LinhaDimensao[];
  clientes: LinhaDimensao[];
  sprints: SnapshotRelatorio[];
  codigo: CodigoModelo | null;
}

const isoDia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function cadaDia(from: Date, to: Date): Date[] {
  const dias: Date[] = [];
  for (let d = new Date(from); d <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    dias.push(d);
  }
  return dias;
}

function agregarDimensao(
  rows: HoraNegocioRow[],
  chaveDe: (r: HoraNegocioRow) => string | null,
  rotuloVazio: string,
): LinhaDimensao[] {
  const mapa = new Map<string, { horas: number; lanc: number; itens: Set<number>; pessoas: Set<string>; sem: boolean }>();
  for (const r of rows) {
    const bruta = chaveDe(r);
    const chave = bruta ?? rotuloVazio;
    let no = mapa.get(chave);
    if (!no) {
      no = { horas: 0, lanc: 0, itens: new Set(), pessoas: new Set(), sem: bruta == null };
      mapa.set(chave, no);
    }
    no.horas += r.horas;
    no.lanc += (r.lancamentos_devops ?? 0) + (r.lancamentos_vdesk ?? 0);
    if (r.work_item_id != null) no.itens.add(r.work_item_id);
    if (r.colaborador) no.pessoas.add(r.colaborador);
  }
  return [...mapa.entries()]
    .map(([chave, n]) => ({
      chave, horas: n.horas, lancamentos: n.lanc, itens: n.itens.size, pessoas: n.pessoas.size, semClassificacao: n.sem,
    }))
    .sort((a, b) => b.horas - a.horas);
}

export function montarRelatorio(entrada: EntradaRelatorio): ModeloRelatorio {
  const from = diaLocal(entrada.dateFrom);
  const to = diaLocal(entrada.dateTo);
  const dias = cadaDia(from, to);

  // Uma pessoa pode ter uma linha por fábrica: as casas vêm do rateio, o lead de qualquer linha.
  const alocMap = buildAlocacaoMap(entrada.roster);
  const leads = new Set(entrada.roster.filter((r) => r.papel === 'lead').map((r) => normName(r.colaborador)));
  const ausenciasPorNome = new Map<string, Ausencia[]>();
  for (const a of entrada.ausencias) {
    const k = normName(a.colaborador);
    ausenciasPorNome.set(k, [...(ausenciasPorNome.get(k) ?? []), a]);
  }

  const porPessoa = new Map<string, HoraNegocioRow[]>();
  for (const r of entrada.rows) {
    const nome = r.colaborador ?? 'Sem colaborador';
    porPessoa.set(nome, [...(porPessoa.get(nome) ?? []), r]);
  }

  const indice = entrada.codigo ? indexarCodigo(entrada.codigo, entrada.dateFrom, entrada.dateTo) : null;

  const pessoas: PessoaRelatorio[] = [...porPessoa.entries()].map(([nome, linhas]) => {
    const casas = casasDe(alocMap, nome);
    const codigo = indice?.porPessoa.get(normName(nome)) ?? null;
    const ausencias = ausenciasPorNome.get(normName(nome)) ?? [];

    const itens = new Map<string, ItemRelatorio>();
    const porDia = new Map<string, { devops: number; vdesk: number }>();
    let devops = 0, vdesk = 0, horas = 0, lancDevops = 0, lancVdesk = 0;

    for (const r of linhas) {
      const hd = (r.minutes_devops ?? 0) / 60;
      const hv = (r.minutes_vdesk ?? 0) / 60;
      devops += hd; vdesk += hv; horas += r.horas;
      lancDevops += r.lancamentos_devops ?? 0;
      lancVdesk += r.lancamentos_vdesk ?? 0;

      const dia = porDia.get(r.log_date) ?? { devops: 0, vdesk: 0 };
      dia.devops += hd; dia.vdesk += hv;
      porDia.set(r.log_date, dia);

      const k = String(r.work_item_id ?? 'sem');
      const item = itens.get(k) ?? {
        id: r.work_item_id, titulo: r.work_item_title ?? '', tipo: r.work_item_type ?? '',
        estado: r.work_item_state ?? '', lancamentos: 0, devops: 0, vdesk: 0, horas: 0,
        pbiId: r.pbi_id ?? null,
        ...codigoDoItem(codigo, r.work_item_id, r.pbi_id ?? null),
      };
      item.lancamentos += (r.lancamentos_devops ?? 0) + (r.lancamentos_vdesk ?? 0);
      item.devops += hd; item.vdesk += hv; item.horas += r.horas;
      itens.set(k, item);
    }

    const diasAusentes = new Set<string>();
    for (const a of ausencias) {
      const ini = diaLocal(a.data_inicio), fim = diaLocal(a.data_fim);
      for (const d of dias) if (d >= ini && d <= fim) diasAusentes.add(isoDia(d));
    }

    return {
      nome,
      grupo: casas[0]?.squad ?? SEM_GRUPO,
      casas,
      lead: leads.has(normName(nome)),
      devops, vdesk, horas, lancDevops, lancVdesk,
      dias: porDia.size,
      ferias: diasUteisAusentes(ausencias, from, to),
      diasAusentes,
      porDia,
      itens: [...itens.values()].sort((a, b) => b.horas - a.horas),
      codigo,
    };
  });

  // Ordem de leitura: fábricas, áreas, quem não tem cadastro; dentro do grupo,
  // quem apontou mais primeiro.
  const ordemGrupo = (g: string) => {
    const i = GRUPOS_HORAS.indexOf(g);
    return i === -1 ? (g === SEM_GRUPO ? 999 : 500) : i;
  };
  pessoas.sort((a, b) =>
    ordemGrupo(a.grupo) - ordemGrupo(b.grupo) || a.grupo.localeCompare(b.grupo) || b.horas - a.horas);
  const grupos = [...new Set(pessoas.map((p) => p.grupo))];

  const comHoras = new Set(pessoas.map((p) => normName(p.nome)));
  // Uma entrada por PESSOA: quem está em duas fábricas apareceria duas vezes.
  const semApontamento = [...new Map(entrada.roster
    .filter((r) => !comHoras.has(normName(r.colaborador)))
    .map((r) => [normName(r.colaborador), {
      nome: r.colaborador,
      grupo: casasDe(alocMap, r.colaborador).map((c) => rotuloFabricaLongo(c.squad)).join(' + '),
    }])).values()]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));

  /**
   * Resumo grupo › fábrica. Quem divide o tempo entra em cada fábrica na
   * proporção da alocação — as linhas somam o total geral, sem dobrar ninguém.
   * `pessoas` conta gente distinta: no grupo, quem está em duas fábricas dele
   * conta uma vez só.
   */
  const acum = new Map<string, { devops: number; vdesk: number; horas: number; nomes: Set<string> }>();
  for (const p of pessoas) {
    const partes = p.casas.length ? p.casas : [{ squad: SEM_GRUPO, pct: 100, peso: 1 }];
    for (const c of partes) {
      const a = acum.get(c.squad) ?? { devops: 0, vdesk: 0, horas: 0, nomes: new Set<string>() };
      a.devops += p.devops * c.peso; a.vdesk += p.vdesk * c.peso; a.horas += p.horas * c.peso;
      a.nomes.add(p.nome);
      acum.set(c.squad, a);
    }
  }
  const linhaResumo = (codigo: string, rotulo: string, cor: string): ResumoFabrica | null => {
    const a = acum.get(codigo);
    return a ? { codigo, rotulo, cor, pessoas: a.nomes.size, devops: a.devops, vdesk: a.vdesk, horas: a.horas } : null;
  };
  const resumoGrupos: ResumoGrupo[] = GRUPOS.map((g) => {
    const fabricas = fabricasDoGrupo(g.id)
      .map((f) => linhaResumo(f.codigo, f.rotulo, f.cor))
      .filter((x): x is ResumoFabrica => x != null);
    const nomes = new Set(fabricas.flatMap((f) => [...(acum.get(f.codigo)?.nomes ?? [])]));
    const soma = (fn: (f: ResumoFabrica) => number) => fabricas.reduce((s, f) => s + fn(f), 0);
    return {
      codigo: g.id, rotulo: g.rotulo, cor: g.cor, pessoas: nomes.size,
      devops: soma((f) => f.devops), vdesk: soma((f) => f.vdesk), horas: soma((f) => f.horas), fabricas,
    };
  }).filter((g) => g.fabricas.length > 0);
  const semCadastro = linhaResumo(SEM_GRUPO, 'Sem cadastro', '#94a3b8');
  if (semCadastro) resumoGrupos.push({ ...semCadastro, fabricas: [] });

  const itensDistintos = new Set(entrada.rows.map((r) => r.work_item_id).filter((id) => id != null));

  return {
    dateFrom: entrada.dateFrom,
    dateTo: entrada.dateTo,
    diasUteis: businessDaysBetween(from, to),
    extraidoEm: entrada.extraidoEm,
    pessoas,
    grupos,
    semApontamento,
    resumoGrupos,
    total: {
      horas: pessoas.reduce((s, p) => s + p.horas, 0),
      devops: pessoas.reduce((s, p) => s + p.devops, 0),
      vdesk: pessoas.reduce((s, p) => s + p.vdesk, 0),
      lancamentos: pessoas.reduce((s, p) => s + p.lancDevops + p.lancVdesk, 0),
      itens: itensDistintos.size,
      pessoas: pessoas.length,
    },
    sistemas: agregarDimensao(entrada.rows, (r) => r.produto, SEM_PRODUTO),
    clientes: agregarDimensao(entrada.rows, (r) => r.cliente, SEM_CLIENTE),
    // Sprint que encosta no período, da mais antiga para a mais nova.
    sprints: entrada.snapshots
      .filter((s) => s.category_breakdown && s.sprint_end_date >= entrada.dateFrom && s.sprint_start_date <= entrada.dateTo)
      .sort((a, b) => a.sprint_start_date.localeCompare(b.sprint_start_date)),
    codigo: indice && {
      totalCommits: indice.totalCommits,
      totalPrs: indice.totalPrs,
      semVinculo: indice.semVinculo,
      semHoras: [...indice.porPessoa.entries()]
        .filter(([k]) => !comHoras.has(k))
        .map(([k, c]) => ({ nome: indice.nomes.get(k) ?? k, commits: c.commits, prs: c.prs.length }))
        .sort((a, b) => (b.commits + b.prs) - (a.commits + a.prs)),
    },
  };
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v: number, casas = 1) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
/** Zero vira travessão: numa tabela de horas, "0,0" repetido esconde quem apontou. */
const ouTraco = (v: number) => (v > 0.004 ? num(v) : '–');
const pct = (a: number, b: number) => (b > 0 ? `${num((100 * a) / b)} %` : '–');
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const ddmmaaaa = (iso: string) => `${ddmm(iso)}/${iso.slice(0, 4)}`;

/** "Outubro de 2026" quando o período é um mês cheio; senão o intervalo por extenso. */
export function rotuloPeriodo(dateFrom: string, dateTo: string): string {
  const from = diaLocal(dateFrom), to = diaLocal(dateTo);
  const ultimoDia = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
  const mesCheio = from.getDate() === 1 && to.getDate() === ultimoDia
    && from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
  return mesCheio ? `${MESES[from.getMonth()]} de ${from.getFullYear()}` : `${ddmmaaaa(dateFrom)} a ${ddmmaaaa(dateTo)}`;
}

function topo(titulo: string, sub: string, m: ModeloRelatorio): string {
  const carimbo = m.extraidoEm.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).replace(',', ' às');
  return `<header><div class="marca"><i></i><div>FLAG<small>Hub de Operações</small></div></div>`
    + `<div class="tit"><h1>${titulo}</h1><p>${sub}</p></div>`
    + `<div class="meta">Dados extraídos em<br><b>${carimbo}</b></div></header>`;
}

function cartoes(itens: Array<[rotulo: string, valor: string, pe: string]>): string {
  return `<div class="res">${itens.map(([r, v, p], i) =>
    `<div${i === 0 ? ' class="d"' : ''}><span>${r}</span><b>${v}</b><small>${p}</small></div>`).join('')}</div>`;
}

/**
 * Resumo grupo › fábrica: a primeira leitura do relatório. O grupo é a linha
 * de destaque (soma das fábricas dele); a barra usa a cor que a fábrica tem
 * na tela, para o PDF e o painel falarem a mesma língua.
 */
function resumoPorFabrica(m: ModeloRelatorio): string {
  if (m.resumoGrupos.length === 0) return '';
  const maior = Math.max(...m.resumoGrupos.map((g) => g.horas), 1);
  const linha = (r: ResumoFabrica, cls: string) =>
    `<tr${cls}><td class="n">${esc(r.rotulo)}</td><td>${r.pessoas}</td><td>${ouTraco(r.devops)}</td><td>${ouTraco(r.vdesk)}</td>`
    + `<td class="c">${num(r.horas)}</td><td>${pct(r.horas, m.total.horas)}</td>`
    + `<td class="bar"><i style="width:${((100 * r.horas) / maior).toFixed(1)}%;background:${r.cor}"></i></td></tr>`;
  const corpo = m.resumoGrupos.map((g) =>
    `<tbody>${linha(g, ' class="g"')}${g.fabricas.map((f) => linha(f, '')).join('')}</tbody>`).join('');
  return '<h2>Resumo por fábrica <small>grupo › fábrica</small></h2>'
    + '<table class="t rs"><thead><tr><th class="n">Grupo / Fábrica</th><th>Pessoas</th><th>DevOps (h)</th><th>VDESK (h)</th>'
    + `<th>Consolidado (h)</th><th>% do total</th><th></th></tr></thead>${corpo}`
    + `<tfoot><tr><td class="n">Total geral</td><td>${m.total.pessoas}</td><td>${num(m.total.devops)}</td><td>${num(m.total.vdesk)}</td>`
    + `<td class="c">${num(m.total.horas)}</td><td></td><td></td></tr></tfoot></table>`;
}

function paginaConsolidado(m: ModeloRelatorio, periodo: string): string {
  const maior = Math.max(...m.pessoas.map((p) => p.horas), 1);
  // As colunas de código só existem quando a coleta respondeu: coluna de zeros
  // sem coleta se leria como "ninguém commitou".
  const cod = m.codigo;
  const commitsDe = (p: PessoaRelatorio) => p.codigo?.commits ?? 0;
  const prsDe = (p: PessoaRelatorio) => p.codigo?.prs.length ?? 0;
  const inteiro = (v: number) => (v ? String(v) : '–');
  // Quem divide o tempo é listado na fábrica principal, com a outra anotada.
  const divide = (p: PessoaRelatorio) => (p.casas.length > 1
    ? ` <span class="tag dv">${Math.round(p.casas[0].pct)}% · também ${esc(p.casas.slice(1).map((c) => rotuloFabricaLongo(c.squad)).join(', '))}</span>`
    : '');
  const blocos = m.grupos.map((g) => {
    const ps = m.pessoas.filter((p) => p.grupo === g);
    const soma = (f: (p: PessoaRelatorio) => number) => ps.reduce((s, p) => s + f(p), 0);
    const tipo = grupoDaFabrica(g)?.rotulo ?? '';
    const linhas = ps.map((p) =>
      `<tr><td class="n">${esc(p.nome)}${p.lead ? ' <span class="tag">lead</span>' : ''}${divide(p)}</td>`
      + `<td>${ouTraco(p.devops)}</td><td>${ouTraco(p.vdesk)}</td><td class="c">${num(p.horas)}</td>`
      + `<td class="bar"><i style="width:${((100 * p.horas) / maior).toFixed(1)}%"></i></td>`
      + `<td>${p.lancDevops + p.lancVdesk}</td><td>${p.itens.length}</td><td>${p.dias}</td><td>${p.ferias || '–'}</td>`
      + (cod ? `<td class="cd">${inteiro(commitsDe(p))}</td><td>${inteiro(prsDe(p))}</td>` : '') + '</tr>').join('');
    return `<tbody><tr class="g"><td class="n">${esc(rotuloFabrica(g))}<small>${esc(tipo)}</small></td>`
      + `<td>${ouTraco(soma((p) => p.devops))}</td><td>${ouTraco(soma((p) => p.vdesk))}</td><td class="c">${num(soma((p) => p.horas))}</td><td></td>`
      + `<td>${soma((p) => p.lancDevops + p.lancVdesk)}</td><td></td><td></td><td></td>`
      + (cod ? `<td class="cd">${inteiro(soma(commitsDe))}</td><td>${inteiro(soma(prsDe))}</td>` : '') + `</tr>${linhas}</tbody>`;
  }).join('');

  const semApont = m.semApontamento.length
    ? `<p><b>Cadastrados sem apontamento no período</b>: ${esc(m.semApontamento.map((s) => `${s.nome} (${s.grupo})`).join(', '))}.</p>`
    : '';

  const partes = (c: number, p: number) =>
    [c ? `${c} commit${c > 1 ? 's' : ''}` : '', p ? `${p} PR${p > 1 ? 's' : ''}` : ''].filter(Boolean).join(' e ');
  const notasCodigo = !cod ? '' : NOTA_CODIGO
    + (cod.semHoras.length
      ? `<p><b>Com código e sem hora lançada no período</b>: ${esc(cod.semHoras.map((s) => `${s.nome} (${partes(s.commits, s.prs)})`).join(', '))}.</p>`
      : '')
    + (cod.semVinculo.length
      ? `<p><b>Autores sem vínculo no cadastro de colaboradores</b> (fora das colunas): ${esc(cod.semVinculo.map((s) => `${s.autor} (${partes(s.commits, s.prs)})`).join(', '))}.</p>`
      : '');
  const somaCommits = m.pessoas.reduce((s, p) => s + commitsDe(p), 0);
  const somaPrs = m.pessoas.reduce((s, p) => s + prsDe(p), 0);

  return topo('Horas apontadas', `${periodo} · ${ddmm(m.dateFrom)} a ${ddmm(m.dateTo)} · ${m.diasUteis} dias úteis`, m)
    + cartoes([
      ['Horas consolidadas', num(m.total.horas), 'DevOps e VDESK, sem somar em dobro'],
      ['Horas no DevOps', num(m.total.devops), `${m.pessoas.reduce((s, p) => s + p.lancDevops, 0)} lançamentos`],
      ['Horas no VDESK', num(m.total.vdesk), `${m.pessoas.reduce((s, p) => s + p.lancVdesk, 0)} lançamentos`],
      ['Colaboradores', String(m.total.pessoas), 'com horas no período'],
    ])
    + resumoPorFabrica(m)
    + `<h2>Por colaborador <small>na fábrica principal de cada um</small></h2>`
    + `<table class="t"><thead><tr><th class="n">Colaborador</th><th>DevOps (h)</th><th>VDESK (h)</th><th>Consolidado (h)</th><th></th>`
    + `<th>Lançam.</th><th>Itens</th><th>Dias com apont.</th><th>Férias (dias úteis)</th>`
    + (cod ? '<th class="cd">Commits</th><th>PRs</th>' : '') + `</tr></thead>${blocos}`
    + `<tfoot><tr><td class="n">Total geral</td><td>${num(m.total.devops)}</td><td>${num(m.total.vdesk)}</td><td class="c">${num(m.total.horas)}</td>`
    + `<td></td><td>${m.total.lancamentos}</td><td></td><td></td><td></td>`
    + (cod ? `<td class="cd">${somaCommits}</td><td>${somaPrs}</td>` : '') + '</tr></tfoot></table>'
    + `<div class="notas"><p><b>Consolidado</b>: DevOps e VDESK registram a mesma hora; por item, dia e colaborador vale o maior valor entre as duas fontes, sem somar. `
    + `<b>Resumo por fábrica</b>: quem divide o tempo entre duas fábricas entra em cada uma na proporção da alocação do cadastro; as linhas somam o total geral. Na lista por colaborador a pessoa aparece inteira na fábrica principal, então o subtotal de um bloco pode diferir da linha do resumo. `
    + `<b>Férias</b>: dias úteis de ausência no Controle Colaborador dentro do período. Lançamentos removidos no DevOps não entram. Dias úteis não descontam feriados.</p>${semApont}${notasCodigo}</div>`;
}

/** "I & R 50% + LAB 50%" — as fábricas da pessoa, para o cabeçalho da página dela. */
function casasDaPessoa(p: PessoaRelatorio): string {
  if (p.casas.length === 0) return p.grupo;
  return p.casas
    .map((c) => `${rotuloFabricaLongo(c.squad)}${p.casas.length > 1 || c.pct < 100 ? ` ${Math.round(c.pct)}%` : ''}`)
    .join(' + ');
}

/** Como ler os números de código. Vai em toda página que os mostra. */
const NOTA_CODIGO = '<p><b>Commits e PRs</b>: repositórios do Azure DevOps marcados como aplicáveis. Commits são os da branch padrão, pela data do autor; '
  + 'PRs são os criados ou concluídos no período. Hora sem código não é falha por si: teste, análise, infraestrutura e suporte apontam sem commit, '
  + 'e trabalho em repositório fora dessa lista não aparece aqui.</p>';

function secaoCodigo(p: PessoaRelatorio, m: ModeloRelatorio): string {
  if (!m.codigo) return '';
  const c = p.codigo;
  if (!c || (c.commits === 0 && c.prs.length === 0)) {
    return '<h2>Código no período</h2><div class="notas"><p>Nenhum commit ou pull request desta pessoa nos repositórios coletados.</p>' + NOTA_CODIGO + '</div>';
  }
  const dia = (instante: string | null) => (instante ? ddmm(diaBrasilia(instante)) : '–');
  const prs = c.prs.length === 0 ? '' : '<table class="t it"><thead><tr><th class="id">PR</th><th class="n">Título</th><th class="q">Repositório</th>'
    + '<th class="q">Estado</th><th>Criado</th><th>Fechado</th><th>Itens</th></tr></thead><tbody>'
    + c.prs.map((pr) =>
      `<tr><td class="id">${pr.pr_id}</td><td class="n tt">${esc(pr.title ?? '')}</td><td class="q">${esc(pr.repo_name)}</td>`
      + `<td class="q">${rotuloEstadoPr(pr)}</td><td>${dia(pr.creation_date)}</td><td>${dia(pr.closed_date)}</td>`
      + `<td>${(pr.work_item_ids ?? []).length ? (pr.work_item_ids ?? []).join(', ') : '<span class="al">sem item</span>'}</td></tr>`).join('')
    + '</tbody></table>';
  const repos = [...c.commitsPorRepo.entries()].sort((a, b) => b[1] - a[1]);
  const commits = repos.length === 0 ? '' : `<p class="rp"><b>Commits por repositório</b>: ${repos.map(([r, n]) => `${esc(r)} (${n})`).join(' · ')}</p>`;
  return `<h2>Código no período <small>${c.commits} commits · ${c.prs.length} pull requests</small></h2>${prs}${commits}`
    + `<div class="notas">${NOTA_CODIGO}</div>`;
}

function calendario(p: PessoaRelatorio, m: ModeloRelatorio): string {
  const from = diaLocal(m.dateFrom), to = diaLocal(m.dateTo);
  // Recua até a segunda-feira da primeira semana.
  let cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate() - ((from.getDay() + 6) % 7));
  let linhas = '';
  while (cursor <= to) {
    let somaD = 0, somaV = 0, somaC = 0, celulas = '';
    for (let k = 0; k < 7; k++) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + k);
      if (d < from || d > to) { celulas += '<td class="fora"></td>'; continue; }
      const iso = isoDia(d);
      const h = p.porDia.get(iso) ?? { devops: 0, vdesk: 0 };
      somaD += h.devops; somaV += h.vdesk;
      const ausente = p.diasAusentes.has(iso);
      const fds = d.getDay() === 0 || d.getDay() === 6;
      const nc = p.codigo?.commitsPorDia.get(iso) ?? 0;
      somaC += nc;
      celulas += `<td class="${ausente ? 'fer' : fds ? 'off' : ''}"><u>${ddmm(iso)}</u>${ausente ? '<em>férias</em>' : ''}`
        + `<b>${h.devops > 0.004 ? num(h.devops) : ''}</b>${h.vdesk > 0.004 ? `<s>VDESK ${num(h.vdesk)}</s>` : ''}`
        + `${nc ? `<s class="cm">${nc} commit${nc > 1 ? 's' : ''}</s>` : ''}</td>`;
    }
    linhas += `<tr>${celulas}<td class="sm"><b>${ouTraco(somaD)}</b>${somaV > 0.004 ? `<s>VDESK ${num(somaV)}</s>` : ''}`
      + `${somaC ? `<s class="cm">${somaC} commit${somaC > 1 ? 's' : ''}</s>` : ''}</td></tr>`;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
  }
  return `<table class="cal"><thead><tr>${SEMANA.map((s) => `<th>${s}</th>`).join('')}<th class="sm">Semana</th></tr></thead><tbody>${linhas}</tbody></table>`;
}

function paginaPessoa(p: PessoaRelatorio, m: ModeloRelatorio, periodo: string): string {
  const temVdesk = p.vdesk > 0.004;
  const temCodigo = !!m.codigo;
  // "2 PR · 5 c": PRs e commits da própria pessoa que citam o item ou o PBI pai.
  const codigoItem = (i: ItemRelatorio) =>
    [i.prs ? `${i.prs} PR` : '', i.commits ? `${i.commits} c` : ''].filter(Boolean).join(' · ') || '–';
  const linhas = p.itens.map((i) =>
    `<tr><td class="id">${i.id ?? '–'}</td><td class="n tt">${i.titulo ? esc(i.titulo) : '<i>sem work item</i>'}</td>`
    + `<td class="q">${esc(i.tipo)}</td><td class="q">${esc(i.estado)}</td><td>${i.lancamentos || '–'}</td><td>${ouTraco(i.devops)}</td>`
    + (temVdesk ? `<td>${ouTraco(i.vdesk)}</td><td class="c">${num(i.horas)}</td>` : '')
    + (temCodigo ? `<td class="cd">${codigoItem(i)}</td>` : '') + '</tr>').join('');
  const cartaoCodigo: Array<[string, string, string]> = temCodigo
    ? [['Commits · PRs', `${p.codigo?.commits ?? 0} · ${p.codigo?.prs.length ?? 0}`, 'no Azure DevOps']]
    : [];

  return '<div class="pb"></div>'
    + topo(esc(p.nome), `${esc(casasDaPessoa(p))}${p.lead ? ' · lead' : ''} · ${periodo}`, m)
    + cartoes([
      ['Horas consolidadas', num(p.horas), 'maior valor por item e dia'],
      ['DevOps', ouTraco(p.devops), `${p.lancDevops} lançamentos`],
      ['VDESK', ouTraco(p.vdesk), `${p.lancVdesk} lançamentos`],
      ['Dias com apontamento', String(p.dias), `de ${m.diasUteis - p.ferias} dias úteis disponíveis`],
      ['Férias', p.ferias ? String(p.ferias) : '–', 'dias úteis no período'],
      ...cartaoCodigo,
    ])
    + `<h2>Horas por dia <small>valor em destaque = DevOps</small></h2>${calendario(p, m)}`
    + `<h2>Horas por item de trabalho <small>${p.itens.length} itens</small></h2>`
    + `<table class="t it"><thead><tr><th class="id">Item</th><th class="n">Título</th><th class="q">Tipo</th><th class="q">Estado</th>`
    + `<th>Lançam.</th><th>DevOps (h)</th>${temVdesk ? '<th>VDESK (h)</th><th>Consol. (h)</th>' : ''}`
    + `${temCodigo ? '<th class="cd">Código</th>' : ''}</tr></thead><tbody>${linhas}</tbody>`
    + `<tfoot><tr><td></td><td class="n">Total</td><td></td><td></td><td>${p.lancDevops + p.lancVdesk}</td><td>${num(p.devops)}</td>`
    + (temVdesk ? `<td>${num(p.vdesk)}</td><td class="c">${num(p.horas)}</td>` : '')
    + (temCodigo ? '<td class="cd"></td>' : '') + '</tr></tfoot></table>'
    + secaoCodigo(p, m);
}

function paginaDimensao(m: ModeloRelatorio, periodo: string, titulo: string, rotulo: string, linhas: LinhaDimensao[]): string {
  const total = m.total.horas;
  const maior = Math.max(...linhas.map((l) => l.horas), 1);
  const identificado = linhas.filter((l) => !l.semClassificacao).reduce((s, l) => s + l.horas, 0);
  const corpo = linhas.map((l) =>
    `<tr${l.semClassificacao ? ' class="sc"' : ''}><td class="n">${esc(l.chave)}</td><td class="c">${num(l.horas)}</td><td>${pct(l.horas, total)}</td>`
    + `<td class="bar"><i style="width:${((100 * l.horas) / maior).toFixed(1)}%"></i></td>`
    + `<td>${l.lancamentos}</td><td>${l.itens}</td><td>${l.pessoas}</td></tr>`).join('');

  return '<div class="pb"></div>'
    + topo(titulo, `${periodo} · ${ddmm(m.dateFrom)} a ${ddmm(m.dateTo)} · todos os colaboradores`, m)
    + cartoes([
      ['Horas no período', num(total), 'consolidadas'],
      [`${rotulo}s`, String(linhas.filter((l) => !l.semClassificacao).length), 'com horas no período'],
      [`Com ${rotulo.toLowerCase()} identificado`, pct(identificado, total), `${num(identificado)} h`],
      [`Sem ${rotulo.toLowerCase()}`, num(total - identificado), 'horas sem classificação'],
    ])
    + `<table class="t dim"><thead><tr><th class="n">${rotulo}</th><th>Horas</th><th>% do total</th><th></th><th>Lançam.</th><th>Itens</th><th>Colaboradores</th></tr></thead>`
    + `<tbody>${corpo}</tbody><tfoot><tr><td class="n">Total</td><td class="c">${num(total)}</td><td>100,0 %</td><td></td>`
    + `<td>${m.total.lancamentos}</td><td>${m.total.itens}</td><td>${m.total.pessoas}</td></tr></tfoot></table>`
    + `<div class="notas"><p>${rotulo} vem do campo do item no DevOps (ou do item pai) e, na falta dele, da tag. Os nomes aparecem como estão cadastrados.</p></div>`;
}

function paginaSprints(m: ModeloRelatorio, periodo: string): string {
  const sp = m.sprints;
  if (sp.length === 0) return '';
  const n = (v: number | null | undefined) => v ?? 0;
  const geral = (s: SnapshotRelatorio) => s.category_breakdown!.geral;
  const avioes = (e: SnapshotScopeBreakdown) => e.cats.aviao_sprint + e.cats.aviao_transbordado;
  const intervalo = (s: SnapshotRelatorio) => `${ddmm(s.sprint_start_date)} a ${ddmm(s.sprint_end_date)}`;

  const cartoesSprint = sp.map((s) => {
    const g = geral(s);
    const done = n(s.finalized_demands), entregue = n(s.delivered_demands);
    const aberto = Math.max(0, n(s.total_demands) - done - entregue);
    return `<div class="sp"><h3>${esc(s.sprint_code)}<small>${intervalo(s)}</small></h3><div class="spk">`
      + `<div><b>${n(s.total_demands)}</b><span>itens</span></div><div><b>${avioes(g)}</b><span>aviões</span></div>`
      + `<div><b>${g.cats.bug}</b><span>bugs</span></div><div><b>${g.cats.retorno_qa}</b><span>retorno QA</span></div>`
      + `<div><b>${n(s.transbordo_count)}</b><span>transbordo</span></div></div>`
      + `<div class="seg"><i class="a" style="flex:${done}"></i><i class="b" style="flex:${entregue}"></i><i style="flex:${aberto}"></i></div>`
      + `<p>${done} done · ${entregue} entregues · ${aberto} em aberto</p></div>`;
  }).join('');

  const indicadores: Array<[string, (s: SnapshotRelatorio) => string | number, string]> = [
    ['Itens na sprint', (s) => n(s.total_demands), 'd'],
    ['Priorizados (planejados)', (s) => n(s.planned_demands), ''],
    ['vindos de transbordo', (s) => geral(s).cats.priorizacao_transbordo, 's'],
    ['Não planejados', (s) => n(s.unplanned_demands), ''],
    ['Bugs', (s) => geral(s).cats.bug, 's'],
    ['Retorno de QA', (s) => geral(s).cats.retorno_qa, 's'],
    ['Aviões', (s) => avioes(geral(s)), 's'],
    ['% não planejado', (s) => pct(n(s.unplanned_demands), n(s.total_demands)), ''],
    ['Done', (s) => n(s.finalized_demands), 'd'],
    ['Entregue', (s) => n(s.delivered_demands), ''],
    ['% concluído (Done + Entregue)', (s) => pct(n(s.finalized_demands) + n(s.delivered_demands), n(s.total_demands)), ''],
    ['Transbordo', (s) => n(s.transbordo_count), 'd'],
    ['% de transbordo', (s) => pct(n(s.transbordo_count), n(s.total_demands)), ''],
    ['QA · concluídos', (s) => n(s.qa_concluidos), 'd'],
    ['QA · concluídos com retorno', (s) => n(s.qa_concluidos_com_retorno), ''],
    ['QA · taxa de retorno', (s) => (s.qa_return_rate_pct == null ? '–' : `${num(Number(s.qa_return_rate_pct))} %`), ''],
    ['QA · ciclos de retorno (média)', (s) => (s.qa_avg_return_cycles == null ? '–' : num(Number(s.qa_avg_return_cycles), 2)), ''],
    ['Lead time médio (dias)', (s) => (s.avg_lead_time_days == null ? '–' : num(Number(s.avg_lead_time_days))), 'd'],
  ];
  const corpo = indicadores.map(([rot, fn, cls]) =>
    `<tr class="${cls}"><td class="n">${rot}</td>${sp.map((s) => `<td>${fn(s)}</td>`).join('')}</tr>`).join('');

  // A fábrica do item é o título do Épico raiz; as squads usam "[K8] - Squad".
  const ehSquad = (titulo: string, squad: string) => titulo.trim().toUpperCase().startsWith(`[${squad}]`);
  const celulas = (s: SnapshotRelatorio, filtro: (titulo: string) => boolean) => {
    const es = Object.entries(s.category_breakdown!.fabricas).filter(([t]) => filtro(t)).map(([, e]) => e);
    const soma = (f: (e: SnapshotScopeBreakdown) => number) => es.reduce((a, e) => a + f(e), 0);
    const v = (x: number) => (x ? String(x) : '–');
    return `<td class="s">${v(soma((e) => e.total))}</td><td>${v(soma((e) => e.cats.bug))}</td><td>${v(soma(avioes))}</td>`
      + `<td>${v(soma((e) => e.cats.retorno_qa))}</td><td>${v(soma((e) => e.done.total + e.entregue.total))}</td>`;
  };
  const porFabrica = SQUADS.map((q) =>
    `<tr><td class="n">${q}</td>${sp.map((s) => celulas(s, (t) => ehSquad(t, q))).join('')}</tr>`).join('')
    + `<tr><td class="n">Demais épicos e áreas</td>${sp.map((s) => celulas(s, (t) => !SQUADS.some((q) => ehSquad(t, q)))).join('')}</tr>`;

  return '<div class="pb"></div>'
    + topo('Sprints do período', `${periodo} · KPIs macro da Fábrica · foto selada no fim de cada sprint`, m)
    + `<div class="sps">${cartoesSprint}</div><h2>Indicadores por sprint</h2>`
    + `<table class="t kp"><thead><tr><th class="n">Indicador</th>${sp.map((s) => `<th>${esc(s.sprint_code)}<small>${intervalo(s)}</small></th>`).join('')}</tr></thead><tbody>${corpo}</tbody></table>`
    + `<h2>Por squad <small>Épico do item no DevOps</small></h2><table class="t fb"><thead><tr><th rowspan="2" class="n">Squad</th>${sp.map((s) => `<th colspan="5" class="grp">${esc(s.sprint_code)}</th>`).join('')}</tr>`
    + `<tr>${sp.map(() => '<th class="s">Itens</th><th>Bugs</th><th>Aviões</th><th>Ret. QA</th><th>Done + Entr.</th>').join('')}</tr></thead><tbody>${porFabrica}</tbody></table>`
    + `<div class="notas"><p>Fonte: fotos de fim de sprint do FlagHub, com os itens que estavam na sprint naquele momento. `
    + `Cada item entra em uma só categoria, definida pela tag (retorno de QA, avião, priorização) ou pelo tipo Bug. <b>Aviões</b> somam os da sprint e os transbordados. `
    + `<b>Transbordo</b>: itens na sprint com a tag de transbordo. <b>Entregue</b>: aguardando teste, em teste, aguardando deploy ou homologação. Lead time considera só PBIs. `
    + `<b>Por squad</b>: a squad de um item é o Épico dele no DevOps, que ainda segue o organograma anterior; por isso esta tabela não repete as fábricas do resumo de horas. `
    + `Entram as sprints que tocam o período; um mesmo item pode aparecer em mais de uma, então as colunas não se somam.</p></div>`;
}

// Cores e raio são os tokens do portal (src/index.css): --flag-navy, --flag-gold,
// --sidebar-background, --border, --muted-foreground, --radius.
const CSS = `@page{size:A4 portrait;margin:12mm 12mm 14mm;@bottom-left{content:"FlagHub · Horas apontadas";font:7pt Inter,"Segoe UI",sans-serif;color:#64748b}
@bottom-right{content:counter(page) " / " counter(pages);font:600 7pt Inter,"Segoe UI",sans-serif;color:#64748b}}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
:root{--navy:#0f172a;--navy2:#141d38;--gold:#d99b12;--gold-s:#fdf6e3;--mut:#64748b;--bd:#e5e7eb;--sec:#f3f4f6;--info:#0ea5e9;--ok:#22c55e}
body{margin:0;font:8.6pt/1.35 Inter,"Segoe UI",Arial,sans-serif;color:var(--navy);background:#fff;font-variant-numeric:tabular-nums}
.pb{break-before:page}
header{display:flex;align-items:center;gap:14px;background:var(--navy2);color:#f8fafc;border-radius:12px;padding:11px 15px}
.marca{font-weight:700;font-size:12pt;display:flex;align-items:center;gap:7px;padding-right:14px;border-right:1px solid #2b3658;white-space:nowrap}
.marca i{width:24px;height:24px;border-radius:7px;background:var(--gold);display:block}.marca div{line-height:1.05}.marca small{display:block;font-size:6.4pt;font-weight:400;color:#aab4c8}
.tit{flex:1}.tit h1{margin:0;font-size:14pt;font-weight:700}.tit p{margin:1px 0 0;color:#aab4c8;font-size:8.2pt}
.meta{text-align:right;font-size:7.2pt;color:#aab4c8;line-height:1.45}.meta b{color:#f8fafc}
.res{display:flex;gap:8px;margin:9px 0 11px}.res div{flex:1;border:1px solid var(--bd);border-radius:12px;padding:8px 11px;background:#fff}
.res div.d{border-color:var(--gold);background:var(--gold-s)}.res span{display:block;font-size:7.2pt;color:var(--mut);font-weight:600}
.res b{display:block;font-size:16pt;font-weight:700;line-height:1.2}.res small{font-size:6.9pt;color:var(--mut)}
h2{font-size:9.6pt;font-weight:700;margin:12px 0 5px;padding-left:8px;border-left:3px solid var(--gold)}h2 small{font-weight:400;color:var(--mut);margin-left:6px;font-size:7.6pt}
.t{width:100%;border-collapse:separate;border-spacing:0;border:1px solid var(--bd);border-radius:12px;overflow:hidden}
.t thead{display:table-header-group}.t tfoot{display:table-row-group}.t tr{break-inside:avoid}
.t th{font-size:7pt;font-weight:600;color:var(--mut);text-align:right;padding:5px 7px;background:var(--sec);border-bottom:1px solid var(--bd);vertical-align:bottom}
.t th small{display:block;font-weight:400;font-size:6.6pt}.t td{text-align:right;padding:3px 7px;border-bottom:1px solid #f0f1f4}
.t .n{text-align:left;white-space:nowrap}.t .q{text-align:left;color:var(--mut);font-size:7.7pt}.t .c{font-weight:700}
.t tr.g td{background:var(--gold-s);font-weight:700;border-bottom:1px solid #f1e3b8;border-top:1px solid #f1e3b8;padding-top:4.5px;padding-bottom:4.5px}
.t tr.g td.n{box-shadow:inset 3px 0 0 var(--gold)}.t tr.g small{font-weight:400;color:var(--mut);margin-left:7px;font-size:7.2pt}
.t tbody tr:not(.g) td.n{padding-left:15px}.t tfoot td{font-weight:700;background:var(--navy2);color:#f8fafc;border-bottom:0;padding-top:5px;padding-bottom:5px}
.bar{width:21%;padding-left:2px!important}.bar i{display:block;height:7px;background:var(--gold);border-radius:4px;min-width:2px}
.tag{font-size:6.4pt;font-weight:600;background:var(--navy2);color:var(--gold);border-radius:8px;padding:1px 6px;margin-left:5px}.tag.dv{background:var(--sec);color:var(--mut);font-weight:500}
.t.rs{margin-bottom:2px}.t.rs .bar{width:26%}.t.rs .bar i{height:8px}
.t.it td{font-size:8pt}.t.it tbody td.n,.t.dim tbody td.n,.t.kp tbody td.n,.t.fb tbody td.n{padding-left:9px!important}
.id{text-align:left!important;width:44px;color:var(--mut)}.tt{max-width:290px;overflow:hidden;text-overflow:ellipsis}
.t.dim td{padding-top:2.5px;padding-bottom:2.5px}.t.dim tr.sc td{color:var(--mut);font-style:italic}.t.dim .bar{width:30%}
.cal{width:100%;border-collapse:separate;border-spacing:3px;table-layout:fixed;margin:-3px}.cal tr{break-inside:avoid}
.cal th{font-size:7pt;color:var(--mut);font-weight:600;text-align:left;padding:1px 6px}
.cal td{height:38px;border:1px solid var(--bd);border-radius:8px;padding:2px 6px;vertical-align:top}
.cal u{text-decoration:none;font-size:6.8pt;color:var(--mut);font-weight:600}.cal em{font-style:normal;font-size:6.2pt;color:var(--mut);float:right}
.cal b{display:block;font-size:11.5pt;font-weight:700;line-height:1.2}.cal s{display:block;text-decoration:none;font-size:6.4pt;color:#0369a1;line-height:1;font-weight:600}
.cal .off{background:var(--sec);border-color:var(--sec)}.cal .fer{background:var(--gold-s);border-color:#f1e3b8}.cal .fora{border:0}
.cal td.sm{width:13%;background:var(--navy2);border-color:var(--navy2);color:#f8fafc}.cal td.sm s{color:#7dd3fc}
.t .cd{border-left:1px solid var(--bd);white-space:nowrap}.t tfoot .cd{border-left-color:#2b3658}.al{color:#b45309}
.cal s.cm{color:#6d28d9}.cal td.sm s.cm{color:#c4b5fd}.rp{margin:7px 0 0;font-size:7.8pt}
.notas{margin-top:8px;font-size:7.3pt;color:var(--mut)}.notas p{margin:0 0 3px}.notas b{color:var(--navy)}
.sps{display:flex;gap:8px;margin:9px 0 4px}.sp{flex:1;border:1px solid var(--bd);border-radius:12px;padding:9px 11px}
.sp h3{margin:0 0 6px;font-size:11pt}.sp h3 small{font-weight:400;color:var(--mut);font-size:7.4pt;margin-left:6px}
.spk{display:flex;justify-content:space-between;margin-bottom:8px}.spk b{display:block;font-size:13pt;line-height:1.1}.spk span{font-size:6.6pt;color:var(--mut)}.spk div:first-child b{color:var(--gold)}
.seg{display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--sec);gap:1px}.seg i{display:block;background:#dfe3ea}.seg .a{background:var(--ok)}.seg .b{background:var(--info)}
.sp p{margin:4px 0 0;font-size:7pt;color:var(--mut)}
.t.kp td{padding-top:3.4px;padding-bottom:3.4px}.t.kp tr.d td{border-top:1px solid var(--bd);font-weight:700}.t.kp tr.s td{color:var(--mut)}.t.kp tr.s td.n{padding-left:22px!important}
.t.kp th:not(.n){font-size:9pt;color:var(--navy);font-weight:700}
.t th.grp{text-align:center;color:var(--navy);font-weight:700;font-size:8pt;border-left:1px solid var(--bd)}.t.fb .s{border-left:1px solid var(--bd)}.t.fb td{padding:4px 6px}.t.fb th{padding:4px 5px}`;

/** Nome que o navegador sugere ao salvar o PDF. */
export function tituloRelatorio(dateFrom: string, dateTo: string): string {
  return `FlagHub - Horas apontadas - ${dateFrom} a ${dateTo}`;
}

export function renderizarRelatorioHtml(m: ModeloRelatorio): string {
  const periodo = rotuloPeriodo(m.dateFrom, m.dateTo);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(tituloRelatorio(m.dateFrom, m.dateTo))}</title><style>${CSS}</style></head><body>`
    + paginaConsolidado(m, periodo)
    + m.pessoas.map((p) => paginaPessoa(p, m, periodo)).join('')
    + paginaDimensao(m, periodo, 'Horas por sistema', 'Sistema', m.sistemas)
    + paginaDimensao(m, periodo, 'Horas por cliente', 'Cliente', m.clientes)
    + paginaSprints(m, periodo)
    + '</body></html>';
}
