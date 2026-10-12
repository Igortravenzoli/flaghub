import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { criarFakePostgrest, type FakePostgrest, type Linha } from './fakePostgrest';

/**
 * EG-8 (11/10/2026) — o perfil do telão da Fábrica baixa só a sprint vigente
 * (PBI/US/Bug, 8 colunas) e a hierarquia dos itens com apontamento, em vez da
 * tabela `devops_work_items` inteira. Este teste roda o hook DE VERDADE sobre um
 * PostgREST falso que aplica filtros e PROJEÇÃO, nos dois perfis, e exige que o
 * que a FabricaTvView mostra saia idêntico: os contadores, `kpiItems` (nos
 * campos que a TV lê) e `horasPorFabricaFull` (Uso cruzado).
 */
const h = vi.hoisted(() => ({ fake: null as unknown as FakePostgrest }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => h.fake.supabase.from(tabela),
    rpc: (nome: string, args: Record<string, unknown>) => h.fake.supabase.rpc(nome, args),
  },
}));

import {
  buscarAncestrais,
  completarWorkItem,
  padraoSprintServidor,
  useFabricaKpis,
  WI_COLUNAS_HIERARQUIA,
  WI_COLUNAS_MESA,
  WI_COLUNAS_TELAO,
} from '@/hooks/useFabricaKpis';
import { extractSprintCodeFromPath, getOfficialSprintRange } from '@/lib/sprintCalendar';

// ── Base sintética ────────────────────────────────────────────────────────
const P = 'Flag.Planejamento';
function wi(id: number, o: Partial<Linha>): Linha {
  return {
    id,
    rev: 1,
    tags: null,
    title: `Item ${id}`,
    parent_id: null,
    assigned_to_display: null,
    area_path: P,
    work_item_type: 'Product Backlog Item',
    iteration_history: [],
    state: 'New',
    iteration_path: `${P}\\Backlog`,
    priority: 2,
    effort: 3,
    created_date: '2026-06-01T12:00:00Z',
    changed_date: '2026-06-02T12:00:00Z',
    web_url: `https://dev.azure.com/FlagIW/Flag.Planejamento/_workitems/edit/${id}`,
    raw: { fields: {} },
    ...o,
  };
}

const S20 = `${P}\\S20-2026`;
const S19 = `${P}\\S19-2026`;
const S21 = `${P}\\S21-2026`;

const WORK_ITEMS: Linha[] = [
  // Epics / Features (sem sprint)
  wi(9000, { work_item_type: 'Epic', title: 'FLEXX', iteration_path: P }),
  wi(9001, { work_item_type: 'Epic', title: 'K8', iteration_path: P }),
  wi(9002, { work_item_type: 'Epic', title: 'Infraestrutura', iteration_path: P }),
  wi(9100, { work_item_type: 'Feature', title: 'Feature FLEXX', parent_id: 9000, iteration_path: P }),
  wi(9101, { work_item_type: 'Feature', title: 'Feature K8', parent_id: 9001, iteration_path: P }),
  // guarda-chuva fora da Fábrica (pai 9990 não existe na base)
  wi(2700, { title: '[INFRA] - SPRINT', parent_id: 9990, iteration_path: S20, state: 'Em desenvolvimento' }),
  // S20 — itens de gestor
  wi(100, { parent_id: 9100, assigned_to_display: 'Ana Dev', state: 'Em desenvolvimento', tags: 'PRIORIZACAO', iteration_path: S20 }),
  wi(101, { parent_id: 9101, assigned_to_display: 'Bruno Dev', state: 'Done', tags: 'BUG; FLEXX', work_item_type: 'Bug', iteration_path: S20 }),
  wi(102, { parent_id: 9100, assigned_to_display: 'Ana Dev', state: 'New', tags: 'AVIAO', iteration_path: S20 }),
  wi(103, { assigned_to_display: 'Carlos Fora', state: 'Em Teste', tags: 'PRIORIZACAO; TRANSBORDO', iteration_path: S20 }),
  wi(104, { title: '[INFRA] servidor', parent_id: 9002, assigned_to_display: 'Ana Dev', state: 'New', iteration_path: S20 }),
  wi(105, { parent_id: 2700, assigned_to_display: 'Ana Dev', state: 'New', iteration_path: S20 }),
  wi(106, { parent_id: 9100, assigned_to_display: 'Ana Dev', state: 'Removed', iteration_path: S20 }),
  wi(107, { work_item_type: 'User Story', parent_id: 9101, assigned_to_display: 'Bruno Dev', state: 'Aguardando Deploy', tags: 'RETORNO QA', iteration_path: S20 }),
  wi(108, { parent_id: 9101, assigned_to_display: 'Bruno Dev', state: 'Em Teste', tags: 'AVIAO; TRANSBORDO', iteration_path: `${P}\\s20-2026` }),
  wi(109, { assigned_to_display: null, state: 'To Do', iteration_path: S20, work_item_type: 'Bug' }),
  // outras sprints / backlog
  wi(200, { parent_id: 9100, assigned_to_display: 'Ana Dev', state: 'Done', iteration_path: S19, iteration_history: [{ oldValue: S19, newValue: S20, revisedDate: '2026-09-29' }] }),
  wi(201, { parent_id: 9101, assigned_to_display: 'Bruno Dev', state: 'Em desenvolvimento', iteration_path: S19 }),
  wi(300, { parent_id: 9100, assigned_to_display: 'Ana Dev', state: 'New', changed_date: '2026-10-01T12:00:00Z' }),
  // tasks
  wi(1000, { work_item_type: 'Task', parent_id: 100, assigned_to_display: 'Ana Dev', state: 'Done', iteration_path: S20 }),
  wi(1001, { work_item_type: 'Task', parent_id: 101, assigned_to_display: 'Bruno Dev', state: 'In Progress', iteration_path: S20 }),
  wi(1002, { work_item_type: 'Task', parent_id: 200, assigned_to_display: 'Ana Dev', state: 'Done', iteration_path: S19 }),
  wi(1003, { work_item_type: 'Task', parent_id: 2700, assigned_to_display: 'Igor Cardoso', state: 'Done', iteration_path: S20 }),
  wi(1004, { work_item_type: 'Task', parent_id: 300, assigned_to_display: 'Ana Dev', state: 'Done' }),
  wi(1005, { work_item_type: 'Task', parent_id: null, assigned_to_display: 'Bruno Dev', state: 'Done', iteration_path: S20 }),
  wi(1006, { work_item_type: 'Task', parent_id: 9999, assigned_to_display: 'Bruno Dev', state: 'Done', iteration_path: S20 }),
  wi(1007, { work_item_type: 'Task', parent_id: 104, assigned_to_display: 'Ana Dev', state: 'Done', iteration_path: S20 }),
  // S21: só uma Task (cenário de virada de sprint)
  wi(1100, { work_item_type: 'Task', parent_id: 100, assigned_to_display: 'Ana Dev', state: 'New', iteration_path: S21 }),
  // histórico sem apontamento no período — o grosso da tabela no PROD
  ...Array.from({ length: 300 }, (_, i) => wi(5000 + i, {
    parent_id: i % 2 ? 9100 : 9101,
    work_item_type: i % 3 ? 'Task' : 'Product Backlog Item',
    state: 'Done',
    iteration_path: `${P}\\S${(i % 18) + 1}-2026`,
    iteration_history: [{ oldValue: `${P}\\Backlog`, newValue: `${P}\\S1-2026`, revisedDate: '2026-01-10' }],
  })),
];

const porId = new Map(WORK_ITEMS.map((w) => [w.id as number, w]));
function linhaView(id: number, countInKpi = true): Linha {
  const w = porId.get(id)!;
  const pai = w.parent_id != null ? porId.get(w.parent_id as number) : undefined;
  return {
    id: w.id, title: w.title, work_item_type: w.work_item_type, state: w.state,
    assigned_to_display: w.assigned_to_display, priority: w.priority, effort: w.effort,
    iteration_path: w.iteration_path, created_date: w.created_date, changed_date: w.changed_date,
    parent_id: w.parent_id, parent_title: pai?.title ?? null, parent_type: pai?.work_item_type ?? null,
    web_url: w.web_url, tags: w.tags, count_in_kpi: countInKpi,
  };
}

// A view: fila da Fábrica (sem 102, 105, 106, 108, 109 — esses só existem na tabela),
// com Tasks filhas e uma linha duplicada, como no PROD.
const VIEW: Linha[] = [
  linhaView(100), linhaView(101), linhaView(101), linhaView(103), linhaView(104), linhaView(107),
  linhaView(200), linhaView(300), linhaView(1000, false), linhaView(1001, false),
];

const TIMELOGS = [
  { work_item_id: 1000, total_minutes: 120, user_name: 'Ana Dev', max_log_date: '2026-09-30' },
  { work_item_id: 1001, total_minutes: 60, user_name: 'Bruno Dev', max_log_date: '2026-10-01' },
  { work_item_id: 1002, total_minutes: 30, user_name: 'Ana Dev', max_log_date: '2026-09-29' },
  { work_item_id: 1003, total_minutes: 200, user_name: 'Igor', max_log_date: '2026-10-02' },
  { work_item_id: 1004, total_minutes: 15, user_name: 'Ana Dev', max_log_date: '2026-10-02' },
  { work_item_id: 1005, total_minutes: 10, user_name: 'Bruno Dev', max_log_date: '2026-10-03' },
  { work_item_id: 1006, total_minutes: 5, user_name: 'Bruno Dev', max_log_date: '2026-10-03' },
  { work_item_id: 1007, total_minutes: 45, user_name: 'Ana Dev', max_log_date: '2026-10-03' },
  { work_item_id: 100, total_minutes: 20, user_name: 'Ana Dev', max_log_date: '2026-10-04' },
  { work_item_id: 201, total_minutes: 25, user_name: 'bruno dev', max_log_date: '2026-10-04' },
  { work_item_id: 77777, total_minutes: 7, user_name: 'Ana Dev', max_log_date: '2026-10-04' },
];

function novaBase(): FakePostgrest {
  return criarFakePostgrest(
    {
      vw_fabrica_kpis: VIEW,
      devops_work_items: WORK_ITEMS,
      devops_queries: [{ sector: 'fabrica', last_synced_at: '2026-10-08T10:00:00Z' }],
      devops_collaborator_map: [{ timelog_name: 'Igor', canonical_name: 'Igor Cardoso' }],
      fabrica_squad_membership: [
        { colaborador: 'Ana Dev', squad: 'FLEXX', papel: 'dev', ativo: true, capacidade_h_dia: 7, conta_horas: true },
        { colaborador: 'Bruno Dev', squad: 'K8', papel: 'dev', ativo: true, capacidade_h_dia: 7, conta_horas: true },
        { colaborador: 'Igor Cardoso', squad: 'INFRA', papel: 'infra', ativo: true, capacidade_h_dia: 7, conta_horas: true },
      ],
      v_devops_time_logs_ativos: [
        { work_item_id: 1000, user_name: 'Ana Dev', log_date: '2026-09-30', time_minutes: 120 },
      ],
      vdesk_time_logs: [
        { id: 'v1', task_devops: 1000, usuario_vdesk: 'Ana', log_date: '2026-09-30', tempo_segundos: 3600 },
      ],
    },
    { rpc_devops_timelog_agg: () => TIMELOGS.map((t) => ({ ...t })) },
  );
}

function novoCliente() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}
function wrapperDe(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** Espera o cliente ficar ocioso de forma estável (consultas encadeadas). */
async function aguardarOcioso(qc: QueryClient) {
  for (let i = 0; i < 4; i++) {
    await waitFor(() => expect(qc.isFetching()).toBe(0));
    await new Promise((r) => setTimeout(r, 30));
  }
  await waitFor(() => expect(qc.isFetching()).toBe(0));
}

type Resultado = ReturnType<typeof useFabricaKpis>;

/** Exatamente o que a FabricaTvView lê de `fab`. */
function vistaDaTv(r: Resultado) {
  return {
    total: r.total,
    done: r.done,
    inProgress: r.inProgress,
    entregue: r.entregue,
    toDo: r.toDo,
    kpiItems: r.kpiItems
      .map((i) => ({ id: i.id, state: i.state, work_item_type: i.work_item_type, tags: i.tags ?? null }))
      .sort((a, b) => (a.id ?? 0) - (b.id ?? 0)),
    horasPorFabricaFull: r.horasPorFabricaFull,
  };
}

async function rodar(codigo: string, telao: boolean) {
  h.fake = novaBase();
  const range = getOfficialSprintRange(codigo)!;
  const qc = novoCliente();
  const { result } = renderHook(
    () => useFabricaKpis(range.from, range.to, codigo, { includeTimeLogs: true, ...(telao ? { telao: true } : {}) }),
    { wrapper: wrapperDe(qc) },
  );
  await aguardarOcioso(qc);
  return { r: result.current, consultas: h.fake.consultas };
}

const baixouTabelaInteira = (consultas: FakePostgrest['consultas']) =>
  consultas.some((c) => c.tabela === 'devops_work_items' && c.select === WI_COLUNAS_MESA);

describe('useFabricaKpis — perfil do telão (EG-8)', () => {
  it('sprint vigente: o telão mostra o mesmo que o perfil de mesa, sem baixar a tabela inteira', async () => {
    const mesa = await rodar('S20-2026', false);
    const tv = await rodar('S20-2026', true);

    expect(vistaDaTv(mesa.r).total).toBeGreaterThan(0);
    expect(vistaDaTv(mesa.r).horasPorFabricaFull.length).toBeGreaterThan(0);
    expect(vistaDaTv(tv.r)).toEqual(vistaDaTv(mesa.r));

    expect(baixouTabelaInteira(mesa.consultas)).toBe(true);
    expect(baixouTabelaInteira(tv.consultas)).toBe(false);
    // apontamento por dia e VDESK não aparecem no telão
    expect(tv.consultas.some((c) => c.tabela === 'v_devops_time_logs_ativos')).toBe(false);
    expect(tv.consultas.some((c) => c.tabela === 'vdesk_time_logs')).toBe(false);
    // a view veio enxuta (sem web_url/parent_title)
    const view = tv.consultas.find((c) => c.tabela === 'vw_fabrica_kpis')!;
    expect(view.select).not.toMatch(/web_url|parent_title|parent_type|priority|effort/);
    // work items no telão: só a sprint enxuta e a hierarquia, uma fração da base
    const wiTv = tv.consultas.filter((c) => c.tabela === 'devops_work_items');
    expect(new Set(wiTv.map((c) => c.select))).toEqual(new Set([WI_COLUNAS_TELAO, WI_COLUNAS_HIERARQUIA]));
    expect(wiTv.reduce((s, c) => s + c.linhas, 0)).toBeLessThan(WORK_ITEMS.length / 5);
  });

  it('virada de sprint (só Task na sprint nova): o telão cai na carga inteira e segue igual à mesa', async () => {
    const mesa = await rodar('S21-2026', false);
    const tv = await rodar('S21-2026', true);
    expect(vistaDaTv(tv.r)).toEqual(vistaDaTv(mesa.r));
    expect(baixouTabelaInteira(tv.consultas)).toBe(true);
  });

  it('sprint sem nenhum item: mesmo recorte por datas nos dois perfis', async () => {
    const mesa = await rodar('S30-2026', false);
    const tv = await rodar('S30-2026', true);
    expect(vistaDaTv(tv.r)).toEqual(vistaDaTv(mesa.r));
  });
});

describe('helpers do perfil do telão', () => {
  it('filtro de servidor é superconjunto do casamento por código do cliente', () => {
    const caminhos = [
      S20, `${P}\\s20-2026`, `${P}\\S120-2026`, `${P}\\S20-20261`, `${P}\\Sprint 20`, S19, `${P}\\Backlog`,
      `X\\S20-2026\\S21-2026`, `X\\S21-2026\\S20-2026`,
    ];
    const re = new RegExp(`^${padraoSprintServidor('S20-2026').split('%').join('.*')}$`, 'i');
    for (const c of caminhos) {
      if (extractSprintCodeFromPath(c) === 'S20-2026') expect(re.test(c)).toBe(true);
    }
  });

  it('buscarAncestrais sobe até a raiz, em lotes, sem repetir id', async () => {
    const pedidos: number[][] = [];
    const linhas = await buscarAncestrais(
      [1000, 1002, 1006, 77777, 1000],
      async (lote) => {
        pedidos.push(lote);
        return WORK_ITEMS
          .filter((w) => lote.includes(w.id as number))
          .map((w) => ({ id: w.id as number, parent_id: w.parent_id as number | null }));
      },
      11,
      2,
    );
    const ids = linhas.map((l) => l.id).sort((a, b) => a - b);
    expect(ids).toEqual([100, 200, 1000, 1002, 1006, 9000, 9100]);
    expect(pedidos.flat().filter((id) => id === 1000)).toHaveLength(1);
    expect(pedidos.every((l) => l.length <= 2)).toBe(true);
  });

  it('buscarAncestrais respeita a profundidade máxima', async () => {
    const cadeia = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, parent_id: i + 2 <= 20 ? i + 2 : null }));
    const linhas = await buscarAncestrais([1], async (lote) => cadeia.filter((c) => lote.includes(c.id)), 11);
    expect(linhas.map((l) => l.id)).toEqual(Array.from({ length: 11 }, (_, i) => i + 1));
  });

  it('completarWorkItem preenche com null o que o select enxuto não trouxe', () => {
    const w = completarWorkItem({ id: 1, title: 't', tags: 'A' });
    expect(w).toMatchObject({ id: 1, title: 't', tags: 'A', web_url: null, iteration_history: null, effort: null });
  });
});
