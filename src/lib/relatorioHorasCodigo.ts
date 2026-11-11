/**
 * Código entregue no período (commits e pull requests do Azure DevOps), por
 * colaborador, para o relatório de horas.
 *
 * A pergunta que isto responde é de ACOMPANHAMENTO: a hora lançada num item tem
 * rastro no repositório? Não é régua de produtividade — QA, infra, análise e
 * suporte apontam hora sem commit, e o relatório diz isso no rodapé para o
 * número não ser lido torto.
 *
 * O vínculo com a pessoa é por E-MAIL do autor contra o cadastro de
 * colaboradores, e só cai para o nome quando o e-mail não resolve. Autor que
 * não casa com ninguém não some: vai para `semVinculo`, que é a lista de quem
 * falta cadastrar.
 */
import { normName } from '@/lib/fabricaRoster';

/** Linha de `devops_git_commits`. */
export interface CommitRelatorio {
  repo_id: string;
  commit_id: string;
  project_name: string;
  repo_name: string;
  author_name: string | null;
  author_email: string | null;
  author_date: string;
  comment: string | null;
  work_item_ids: number[] | null;
}

/** Linha de `devops_git_pull_requests`. */
export interface PrRelatorio {
  repo_id: string;
  pr_id: number;
  project_name: string;
  repo_name: string;
  title: string | null;
  status: string | null;
  is_draft: boolean;
  created_by_name: string | null;
  created_by_email: string | null;
  creation_date: string;
  closed_date: string | null;
  target_branch: string | null;
  work_item_ids: number[] | null;
}

/** Linha de `devops_collaborator_map`, só o que identifica alguém. */
export interface IdentidadeColaborador {
  canonical_name: string;
  timelog_name: string | null;
  devops_email: string | null;
}

/** Tudo que a coleta devolveu para o período. `null` = coleta indisponível. */
export interface CodigoPeriodo {
  commits: CommitRelatorio[];
  prs: PrRelatorio[];
  identidades: IdentidadeColaborador[];
}

export interface CodigoPessoa {
  commits: number;
  /** yyyy-mm-dd (calendário de Brasília) → commits do dia. */
  commitsPorDia: Map<string, number>;
  /** "Projeto / repositório" → commits. */
  commitsPorRepo: Map<string, number>;
  prs: PrRelatorio[];
  /** work item id → quantos commits e PRs da pessoa o citam. */
  porItem: Map<number, { commits: number; prs: number }>;
}

export interface AutorSemVinculo {
  autor: string;
  commits: number;
  prs: number;
}

export interface IndiceCodigo {
  /** normName(nome canônico) → código da pessoa. */
  porPessoa: Map<string, CodigoPessoa>;
  /** Nome canônico de cada chave de `porPessoa`, para exibir. */
  nomes: Map<string, string>;
  semVinculo: AutorSemVinculo[];
  totalCommits: number;
  totalPrs: number;
}

const FUSO = 'America/Sao_Paulo';

/** Dia de Brasília de um instante: as horas são lançadas nesse calendário. */
export function diaBrasilia(instante: string): string {
  // 'sv-SE' formata como yyyy-mm-dd, que é a chave usada no resto do relatório.
  return new Date(instante).toLocaleDateString('sv-SE', { timeZone: FUSO });
}

const noPeriodo = (dia: string, de: string, ate: string) => dia >= de && dia <= ate;

function novaPessoa(): CodigoPessoa {
  return { commits: 0, commitsPorDia: new Map(), commitsPorRepo: new Map(), prs: [], porItem: new Map() };
}

export function indexarCodigo(codigo: CodigoPeriodo, dateFrom: string, dateTo: string): IndiceCodigo {
  const porEmail = new Map<string, string>();
  const porNome = new Map<string, string>();
  for (const i of codigo.identidades) {
    if (i.devops_email) porEmail.set(i.devops_email.trim().toLowerCase(), i.canonical_name);
    porNome.set(normName(i.canonical_name), i.canonical_name);
    if (i.timelog_name) porNome.set(normName(i.timelog_name), i.canonical_name);
  }
  const resolver = (email: string | null, nome: string | null): string | null =>
    (email && porEmail.get(email.trim().toLowerCase())) || (nome && porNome.get(normName(nome))) || null;

  const porPessoa = new Map<string, CodigoPessoa>();
  const nomes = new Map<string, string>();
  const soltos = new Map<string, AutorSemVinculo>();
  const pessoaDe = (canonico: string) => {
    const k = normName(canonico);
    let p = porPessoa.get(k);
    if (!p) { p = novaPessoa(); porPessoa.set(k, p); nomes.set(k, canonico); }
    return p;
  };
  const soltoDe = (email: string | null, nome: string | null) => {
    const autor = nome || email || 'Autor desconhecido';
    let s = soltos.get(autor);
    if (!s) { s = { autor, commits: 0, prs: 0 }; soltos.set(autor, s); }
    return s;
  };
  const marcarItens = (p: CodigoPessoa, ids: number[] | null, campo: 'commits' | 'prs') => {
    for (const id of new Set(ids ?? [])) {
      const no = p.porItem.get(id) ?? { commits: 0, prs: 0 };
      no[campo] += 1;
      p.porItem.set(id, no);
    }
  };

  let totalCommits = 0;
  for (const c of codigo.commits) {
    const dia = diaBrasilia(c.author_date);
    if (!noPeriodo(dia, dateFrom, dateTo)) continue;
    totalCommits++;
    const dono = resolver(c.author_email, c.author_name);
    if (!dono) { soltoDe(c.author_email, c.author_name).commits++; continue; }
    const p = pessoaDe(dono);
    p.commits++;
    p.commitsPorDia.set(dia, (p.commitsPorDia.get(dia) ?? 0) + 1);
    const repo = `${c.project_name} / ${c.repo_name}`;
    p.commitsPorRepo.set(repo, (p.commitsPorRepo.get(repo) ?? 0) + 1);
    marcarItens(p, c.work_item_ids, 'commits');
  }

  let totalPrs = 0;
  for (const pr of codigo.prs) {
    // Entra o PR criado OU fechado no período: abrir e concluir são, os dois,
    // trabalho do período.
    const criado = noPeriodo(diaBrasilia(pr.creation_date), dateFrom, dateTo);
    const fechado = !!pr.closed_date && noPeriodo(diaBrasilia(pr.closed_date), dateFrom, dateTo);
    if (!criado && !fechado) continue;
    totalPrs++;
    const dono = resolver(pr.created_by_email, pr.created_by_name);
    if (!dono) { soltoDe(pr.created_by_email, pr.created_by_name).prs++; continue; }
    const p = pessoaDe(dono);
    p.prs.push(pr);
    marcarItens(p, pr.work_item_ids, 'prs');
  }

  for (const p of porPessoa.values()) {
    p.prs.sort((a, b) => a.creation_date.localeCompare(b.creation_date));
  }

  return {
    porPessoa, nomes, totalCommits, totalPrs,
    semVinculo: [...soltos.values()].sort((a, b) => (b.commits + b.prs) - (a.commits + a.prs)),
  };
}

/** Commits e PRs da pessoa que citam o item ou o PBI pai dele. */
export function codigoDoItem(
  p: CodigoPessoa | null,
  itemId: number | null,
  pbiId: number | null,
): { commits: number; prs: number } {
  const soma = { commits: 0, prs: 0 };
  if (!p) return soma;
  // O PR costuma apontar para o PBI e a hora é lançada na Task filha: olhar só
  // o id da Task faria quase todo item parecer sem código.
  for (const id of new Set([itemId, pbiId])) {
    const no = id != null ? p.porItem.get(id) : undefined;
    if (no) { soma.commits += no.commits; soma.prs += no.prs; }
  }
  return soma;
}

export function rotuloEstadoPr(pr: Pick<PrRelatorio, 'status' | 'is_draft'>): string {
  if (pr.status === 'completed') return 'Concluído';
  if (pr.status === 'abandoned') return 'Abandonado';
  if (pr.is_draft) return 'Rascunho';
  if (pr.status === 'active') return 'Aberto';
  return pr.status ?? '–';
}
