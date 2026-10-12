import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { criarFakePostgrest, type FakePostgrest, type Linha } from './fakePostgrest';

/**
 * EG-8 (11/10/2026) — Infraestrutura no telão e no card do Home: leitura enxuta
 * da `vw_infraestrutura_kpis` e histórico de sprint só do recorte (telão) ou
 * nenhum (Home). O hook roda sobre um PostgREST falso com projeção; o que a
 * Visão Executiva em tvMode e o card do Home mostram tem de sair igual ao
 * perfil de mesa.
 */
const h = vi.hoisted(() => ({ fake: null as unknown as FakePostgrest }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (tabela: string) => h.fake.supabase.from(tabela) },
}));

import {
  contarMigracoesSprint,
  useInfraestruturaKpis,
  VW_INFRA_COLUNAS_ENXUTAS,
  type UseInfraestruturaKpisOptions,
} from '@/hooks/useInfraestruturaKpis';
import { getOfficialSprintRange } from '@/lib/sprintCalendar';

const P = 'Flag.Planejamento';
const ESTADOS = ['New', 'To Do', 'In Progress', 'Em teste', 'Done', 'Closed', 'Removed'];
const TAGS = [null, 'MELHORIA', 'ISO27001', '#Risco', 'ISO; MELHORIA', 'RISCO; ISO27001'];

const VIEW: Linha[] = Array.from({ length: 160 }, (_, i) => ({
  id: 3000 + i,
  title: `[INFRA] item ${i}`,
  work_item_type: i % 4 ? 'Task' : 'Product Backlog Item',
  state: ESTADOS[i % ESTADOS.length],
  assigned_to_display: i % 3 ? 'Ze Infra' : null,
  priority: 2,
  effort: i % 5,
  tags: TAGS[i % TAGS.length],
  created_date: `2026-${String((i % 10) + 1).padStart(2, '0')}-0${(i % 9) + 1}T12:00:00Z`,
  changed_date: i % 7 === 0 ? '2026-10-02T12:00:00Z' : `2026-${String((i % 9) + 1).padStart(2, '0')}-15T12:00:00Z`,
  web_url: `https://dev.azure.com/FlagIW/Flag.Planejamento/_workitems/edit/${3000 + i}`,
  iteration_path: i % 6 === 0 ? `${P}\\Backlog` : `${P}\\S${(i % 20) + 1}-2026`,
}));

const HIST = (i: number) => [
  [],
  [{ oldValue: `${P}\\Backlog`, newValue: `${P}\\S19-2026` }],
  [{ oldValue: `${P}\\S18-2026`, newValue: `${P}\\S19-2026` }, { oldValue: `${P}\\S19-2026`, newValue: `${P}\\S20-2026` }],
  null,
  [{ oldValue: `${P}`, newValue: `${P}\\S20-2026` }],
][i % 5];

const WORK_ITEMS: Linha[] = VIEW.map((v, i) => ({ id: v.id, iteration_history: HIST(i), title: v.title }));

function novaBase() {
  return criarFakePostgrest({
    vw_infraestrutura_kpis: VIEW,
    devops_work_items: WORK_ITEMS,
    devops_queries: [{ sector: 'infraestrutura', last_synced_at: '2026-10-08T10:00:00Z' }],
  });
}

function wrapperDe(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

async function rodar(de: Date | undefined, ate: Date | undefined, sprint: string, opcoes?: UseInfraestruturaKpisOptions) {
  h.fake = novaBase();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useInfraestruturaKpis(de, ate, sprint, opcoes), { wrapper: wrapperDe(qc) });
  for (let i = 0; i < 3; i++) {
    await waitFor(() => expect(qc.isFetching()).toBe(0));
    await new Promise((r) => setTimeout(r, 20));
  }
  return { r: result.current, consultas: h.fake.consultas };
}

type R = ReturnType<typeof useInfraestruturaKpis>;
/** O que a InfraExecutivoTab (tvMode) lê de `kpis`. */
const vistaTv = (r: R) => ({
  total: r.total,
  concluidos: r.concluidos,
  emAndamento: r.emAndamento,
  pendentes: r.pendentes,
  melhorias: r.melhorias,
  iso27001: r.iso27001,
  sprintMigracoes: r.sprintMigracoes,
  transbordo: r.transbordo,
  doneBySprint: r.doneBySprint,
  riscoItens: r.riscoItens.map((i) => ({ id: i.id, title: i.title, state: i.state, created_date: i.created_date })),
  isLoading: r.isLoading,
});

describe('useInfraestruturaKpis — telão e card do Home (EG-8)', () => {
  const sprint = getOfficialSprintRange('S20-2026')!;

  it('telão: mesmos números da Visão Executiva com leitura enxuta e histórico só do recorte', async () => {
    const mesa = await rodar(sprint.from, sprint.to, 'all');
    const tv = await rodar(sprint.from, sprint.to, 'all', { visaoEnxuta: true, transbordo: 'escopo' });

    expect(mesa.r.total).toBeGreaterThan(0);
    expect(mesa.r.sprintMigracoes).toBeGreaterThan(0);
    expect(vistaTv(tv.r)).toEqual(vistaTv(mesa.r));

    expect(tv.consultas.find((c) => c.tabela === 'vw_infraestrutura_kpis')!.select).toBe(VW_INFRA_COLUNAS_ENXUTAS);
    const hist = (cs: typeof tv.consultas) => cs.filter((c) => c.tabela === 'devops_work_items').reduce((s, c) => s + c.linhas, 0);
    expect(hist(tv.consultas)).toBe(tv.r.items.length);
    expect(hist(tv.consultas)).toBeLessThan(hist(mesa.consultas));
  });

  it('card do Home: total/em andamento iguais, sem baixar histórico', async () => {
    for (const filtro of ['all', `${P}\\S20-2026`]) {
      const mesa = await rodar(undefined, undefined, filtro);
      const home = await rodar(undefined, undefined, filtro, { visaoEnxuta: true, transbordo: 'nenhum' });
      expect([home.r.total, home.r.emAndamento]).toEqual([mesa.r.total, mesa.r.emAndamento]);
      expect(home.r.allItems.map((i) => i.iteration_path)).toEqual(mesa.r.allItems.map((i) => i.iteration_path));
      expect(home.consultas.some((c) => c.tabela === 'devops_work_items')).toBe(false);
      expect(home.r.isLoading).toBe(false);
    }
  });

  it('mesa: perfil padrão continua lendo todas as colunas e o histórico de todos os itens', async () => {
    const mesa = await rodar(undefined, undefined, 'all');
    expect(mesa.consultas.find((c) => c.tabela === 'vw_infraestrutura_kpis')!.select).toMatch(/web_url/);
    expect(mesa.consultas.filter((c) => c.tabela === 'devops_work_items').reduce((s, c) => s + c.linhas, 0)).toBe(VIEW.length);
    expect(mesa.r.allItems[0].web_url).toBe(VIEW.find((v) => v.id === mesa.r.allItems[0].id)!.web_url);
  });
});

describe('contarMigracoesSprint', () => {
  it('conta troca entre sprints e entrada fora do backlog; ignora backlog → sprint e destino sem sprint', () => {
    expect(contarMigracoesSprint(null)).toBe(0);
    expect(contarMigracoesSprint([{ oldValue: `${P}\\Backlog`, newValue: `${P}\\S2-2026` }])).toBe(0);
    expect(contarMigracoesSprint([{ oldValue: `${P}\\S1-2026`, newValue: `${P}\\S2-2026` }])).toBe(1);
    expect(contarMigracoesSprint([{ oldValue: `${P}\\S1-2026`, newValue: `${P}\\S1-2026` }])).toBe(0);
    expect(contarMigracoesSprint([{ oldValue: P, newValue: `${P}\\S2-2026` }])).toBe(1);
    expect(contarMigracoesSprint([{ oldValue: `${P}\\S2-2026`, newValue: `${P}\\Backlog` }])).toBe(0);
  });
});
