import { describe, it, expect } from 'vitest';
import type { HoraNegocioRow } from '@/hooks/useHorasNegocio';
import { montarRelatorio, renderizarRelatorioHtml, type EntradaRelatorio } from '@/lib/relatorioHoras';
import {
  indexarCodigo, codigoDoItem, diaBrasilia, rotuloEstadoPr,
  type CodigoPeriodo, type CommitRelatorio, type PrRelatorio,
} from '@/lib/relatorioHorasCodigo';

const commit = (p: Partial<CommitRelatorio> & { commit_id: string; author_date: string }): CommitRelatorio => ({
  repo_id: 'r1', project_name: 'Flag.Flexx', repo_name: 'api',
  author_name: 'Ana Souza', author_email: 'ana@flag.com.br', comment: 'ajuste', work_item_ids: [],
  ...p,
});

const pr = (p: Partial<PrRelatorio> & { pr_id: number; creation_date: string }): PrRelatorio => ({
  repo_id: 'r1', project_name: 'Flag.Flexx', repo_name: 'api', title: `PR ${p.pr_id}`,
  status: 'completed', is_draft: false, created_by_name: 'Ana Souza', created_by_email: 'ana@flag.com.br',
  closed_date: null, target_branch: 'main', work_item_ids: [],
  ...p,
});

const codigo = (extra: Partial<CodigoPeriodo> = {}): CodigoPeriodo => ({
  identidades: [
    { canonical_name: 'Ana Souza', timelog_name: 'Ana Souza', devops_email: 'ANA@flag.com.br' },
    { canonical_name: 'Bruno Lima', timelog_name: 'Bruno', devops_email: null },
  ],
  commits: [
    commit({ commit_id: 'a1', author_date: '2026-10-05T14:00:00Z', work_item_ids: [10] }),
    commit({ commit_id: 'a2', author_date: '2026-10-05T18:30:00Z', work_item_ids: [10] }),
    commit({ commit_id: 'a3', author_date: '2026-10-06T12:00:00Z', repo_name: 'web' }),
    // 01:30 UTC do dia 1º de novembro ainda é 31/10 em Brasília.
    commit({ commit_id: 'a4', author_date: '2026-11-01T01:30:00Z' }),
    // 03:30 UTC já é 1º de novembro: fora do período.
    commit({ commit_id: 'a5', author_date: '2026-11-01T03:30:00Z' }),
    // Sem e-mail cadastrado: casa pelo nome do TimeLog.
    commit({ commit_id: 'b1', author_date: '2026-10-07T12:00:00Z', author_name: 'bruno', author_email: 'outro@x.com' }),
    commit({ commit_id: 'z1', author_date: '2026-10-08T12:00:00Z', author_name: 'Terceiro', author_email: 't@fora.com' }),
  ],
  prs: [
    pr({ pr_id: 7, creation_date: '2026-10-05T15:00:00Z', closed_date: '2026-10-06T15:00:00Z', work_item_ids: [99] }),
    // Criado em setembro, concluído em outubro: entra.
    pr({ pr_id: 3, creation_date: '2026-09-20T15:00:00Z', closed_date: '2026-10-02T15:00:00Z' }),
    // Criado e fechado em setembro: não entra.
    pr({ pr_id: 2, creation_date: '2026-09-10T15:00:00Z', closed_date: '2026-09-11T15:00:00Z' }),
    pr({ pr_id: 9, creation_date: '2026-10-09T15:00:00Z', created_by_name: 'Terceiro', created_by_email: 't@fora.com', status: 'active' }),
  ],
  ...extra,
});

describe('indexarCodigo', () => {
  const idx = indexarCodigo(codigo(), '2026-10-01', '2026-10-31');

  it('liga o autor à pessoa por e-mail, sem diferenciar maiúsculas, e cai para o nome', () => {
    expect(idx.porPessoa.get('ana souza')!.commits).toBe(4);
    expect(idx.porPessoa.get('bruno lima')!.commits).toBe(1);
  });

  it('corta o período pelo dia de Brasília', () => {
    expect(diaBrasilia('2026-11-01T01:30:00Z')).toBe('2026-10-31');
    const ana = idx.porPessoa.get('ana souza')!;
    expect(ana.commitsPorDia.get('2026-10-05')).toBe(2);
    expect(ana.commitsPorDia.get('2026-10-31')).toBe(1);
    expect(idx.totalCommits).toBe(6);
  });

  it('leva o PR criado ou concluído no período e ignora o resto', () => {
    expect(idx.porPessoa.get('ana souza')!.prs.map((p) => p.pr_id)).toEqual([3, 7]);
    expect(idx.totalPrs).toBe(3);
  });

  it('não descarta autor sem cadastro: lista em semVinculo', () => {
    expect(idx.semVinculo).toEqual([{ autor: 'Terceiro', commits: 1, prs: 1 }]);
  });

  it('agrupa commits por repositório', () => {
    expect([...idx.porPessoa.get('ana souza')!.commitsPorRepo.entries()]).toEqual([
      ['Flag.Flexx / api', 3], ['Flag.Flexx / web', 1],
    ]);
  });
});

describe('codigoDoItem', () => {
  const ana = indexarCodigo(codigo(), '2026-10-01', '2026-10-31').porPessoa.get('ana souza')!;

  it('soma o que cita a Task e o que cita o PBI pai', () => {
    expect(codigoDoItem(ana, 10, 99)).toEqual({ commits: 2, prs: 1 });
    expect(codigoDoItem(ana, 10, null)).toEqual({ commits: 2, prs: 0 });
  });

  it('não conta em dobro quando a hora está no próprio PBI', () => {
    expect(codigoDoItem(ana, 99, 99)).toEqual({ commits: 0, prs: 1 });
  });

  it('devolve zero sem código ou sem item', () => {
    expect(codigoDoItem(null, 10, 99)).toEqual({ commits: 0, prs: 0 });
    expect(codigoDoItem(ana, null, null)).toEqual({ commits: 0, prs: 0 });
  });
});

describe('rotuloEstadoPr', () => {
  it('traduz o estado e mostra rascunho só enquanto aberto', () => {
    expect(rotuloEstadoPr({ status: 'completed', is_draft: false })).toBe('Concluído');
    expect(rotuloEstadoPr({ status: 'abandoned', is_draft: true })).toBe('Abandonado');
    expect(rotuloEstadoPr({ status: 'active', is_draft: true })).toBe('Rascunho');
    expect(rotuloEstadoPr({ status: 'active', is_draft: false })).toBe('Aberto');
  });
});

// ─── No relatório ─────────────────────────────────────────────────────────────

function linha(p: Partial<HoraNegocioRow> & { colaborador: string; log_date: string }): HoraNegocioRow {
  const md = p.minutes_devops ?? 60;
  return {
    work_item_id: 1, minutos: md, horas: md / 60, minutes_vdesk: 0, minutes_devops: md,
    lancamentos_vdesk: 0, lancamentos_devops: 1, conciliacao: 'only_devops',
    cliente: null, cliente_origem: null, cliente_herdado: null, cliente_ambiguo: null,
    produto: null, produto_origem: null, produto_herdado: null, produto_ambiguo: null,
    work_item_type: 'Task', work_item_title: 'Item', work_item_state: 'Done',
    iteration_path: null, sprint_code: null,
    pbi_id: null, pbi_title: null, pbi_type: null, pbi_cliente: null, pbi_produto: null,
    pbi_cliente_origem: null, pbi_produto_origem: null,
    ...p,
  };
}

const entrada = (cod: CodigoPeriodo | null | undefined): EntradaRelatorio => ({
  dateFrom: '2026-10-01', dateTo: '2026-10-31',
  rows: [
    linha({ colaborador: 'Ana Souza', log_date: '2026-10-05', work_item_id: 10, pbi_id: 99, work_item_title: 'Task com código' }),
    linha({ colaborador: 'Ana Souza', log_date: '2026-10-06', work_item_id: 11, work_item_title: 'Task sem código' }),
    linha({ colaborador: 'Carla Dias', log_date: '2026-10-07', work_item_id: 12 }),
  ],
  roster: [], ausencias: [], snapshots: [],
  codigo: cod,
  extraidoEm: new Date(2026, 10, 9, 23, 16),
});

describe('relatório com código', () => {
  it('marca em cada item os commits e PRs que o citam', () => {
    const m = montarRelatorio(entrada(codigo()));
    const ana = m.pessoas.find((p) => p.nome === 'Ana Souza')!;
    expect(ana.itens.find((i) => i.id === 10)).toMatchObject({ commits: 2, prs: 1 });
    expect(ana.itens.find((i) => i.id === 11)).toMatchObject({ commits: 0, prs: 0 });
    expect(m.pessoas.find((p) => p.nome === 'Carla Dias')!.codigo).toBeNull();
  });

  it('lista quem tem código e nenhuma hora, e os autores sem cadastro', () => {
    const m = montarRelatorio(entrada(codigo()));
    expect(m.codigo!.semHoras).toEqual([{ nome: 'Bruno Lima', commits: 1, prs: 0 }]);
    expect(m.codigo!.semVinculo.map((s) => s.autor)).toEqual(['Terceiro']);
  });

  it('mostra colunas, calendário e a lista de PRs', () => {
    const html = renderizarRelatorioHtml(montarRelatorio(entrada(codigo())));
    expect(html).toContain('<th class="cd">Commits</th><th>PRs</th>');
    expect(html).toContain('2 commits');
    expect(html).toContain('Código no período');
    expect(html).toContain('PR 7');
    expect(html).toContain('1 PR · 2 c');
    expect(html).toContain('Com código e sem hora lançada no período');
    expect(html).toContain('Nenhum commit ou pull request desta pessoa');
  });
});

describe('relatório sem coleta', () => {
  it.each([null, undefined])('sai sem nenhuma parte de código (codigo = %s)', (cod) => {
    const m = montarRelatorio(entrada(cod));
    expect(m.codigo).toBeNull();
    const html = renderizarRelatorioHtml(m);
    expect(html).not.toContain('Código no período');
    expect(html).not.toContain('>Commits<');
    expect(html).not.toContain('Commits · PRs');
  });
});
