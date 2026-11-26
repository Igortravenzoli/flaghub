import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ehConclusao, mensagemFilhosAbertos, TIPOS_QUE_FECHAM_SEM_FILHO_ABERTO } from '../../supabase/functions/timer-devops/tarefas';
import { bloqueioDoDestino } from '@/lib/timerEstadoItem';
import { TIPOS_QUE_RODAM } from '@/lib/timerSelecao';

/**
 * O "momento" do PBI e do Bug — 26/11/2026 (decisões do Igor).
 *
 *   • PBI e Bug não têm play: neles cabe a Task filha ou o estado.
 *   • O estado muda direto da linha, sem timer.
 *   • O estado de conclusão fica barrado enquanto houver filho aberto.
 */

// Os estados do PBI na Flag, como a API do DevOps devolve.
const PBI_FLAG = {
  value: [
    { name: 'New', category: 'Proposed' },
    { name: 'Em desenvolvimento', category: 'InProgress' },
    { name: 'Aguardando Teste', category: 'InProgress' },
    { name: 'Done', category: 'Completed' },
    { name: 'Removed', category: 'Removed' },
  ],
};
const ESTADOS = [
  { nome: 'New', categoria: 'Proposed' },
  { nome: 'Em desenvolvimento', categoria: 'InProgress' },
  { nome: 'Aguardando Teste', categoria: 'InProgress' },
  { nome: 'Done', categoria: 'Completed' },
];

describe('regra do Done com filho aberto', () => {
  it('o timer só roda em Task', () => {
    expect([...TIPOS_QUE_RODAM]).toEqual(['Task']);
  });

  it('edge: a regra vale para PBI e Bug, e só para o estado de conclusão', () => {
    expect(TIPOS_QUE_FECHAM_SEM_FILHO_ABERTO).toEqual(['Product Backlog Item', 'Bug']);
    expect(ehConclusao('Done', PBI_FLAG)).toBe(true);
    expect(ehConclusao(' done ', PBI_FLAG)).toBe(true);
    expect(ehConclusao('Aguardando Teste', PBI_FLAG)).toBe(false);
    expect(ehConclusao('New', PBI_FLAG)).toBe(false);
    expect(ehConclusao('Done', null)).toBe(false);
  });

  it('edge: a recusa diz quais filhos estão abertos', () => {
    expect(mensagemFilhosAbertos(18905, 'Done', [19300])).toBe(
      'O item #18905 tem 1 filho aberto (#19300). Conclua ele antes de levar o item para Done.',
    );
    expect(mensagemFilhosAbertos(18905, 'Done', [1, 2, 3, 4, 5, 6, 7])).toBe(
      'O item #18905 tem 7 filhos abertos (#1, #2, #3, #4, #5 e mais 2). Conclua eles antes de levar o item para Done.',
    );
  });

  it('tela: barra só a conclusão, e só com filho aberto', () => {
    const comFilhos = { estados: ESTADOS, filhosAbertos: [19300, 19311] };
    expect(bloqueioDoDestino(comFilhos, 'Done')).toBe('2 filhos abertos (#19300, #19311)');
    expect(bloqueioDoDestino(comFilhos, 'Aguardando Teste')).toBeNull();
    expect(bloqueioDoDestino({ estados: ESTADOS, filhosAbertos: [7] }, 'done')).toBe('1 filho aberto (#7)');
    expect(bloqueioDoDestino({ estados: ESTADOS, filhosAbertos: [] }, 'Done')).toBeNull();
    // edge antiga não manda a lista: a tela não barra, quem barra é o servidor
    expect(bloqueioDoDestino({ estados: ESTADOS }, 'Done')).toBeNull();
  });
});

// ─── o menu da linha ────────────────────────────────────────────────────────

const mutate = vi.fn();
let estados: { data?: unknown; isLoading: boolean; error: unknown };
let consultado: (number | null)[] = [];

vi.mock('@/hooks/useTimerTarefas', () => ({
  ErroTimer: class extends Error {},
  useEstadosItemTimer: (id: number | null) => {
    consultado.push(id);
    return id == null ? { data: undefined, isLoading: false, error: null } : estados;
  },
  useMudarEstadoTimer: () => ({ mutate, isPending: false, variables: undefined }),
}));

import { MenuEstado } from '@/components/timer/MenuEstado';

const info = (extra: Record<string, unknown> = {}) => ({
  id: 18905, tipo: 'Product Backlog Item', estado: 'New', atribuido: true, fechado: false, estados: ESTADOS, concluido: 'Done', filhosAbertos: [], ...extra,
});
const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Mudar o estado do item 18905/ }));

describe('MenuEstado (linha do PBI/Bug)', () => {
  beforeEach(() => {
    mutate.mockClear();
    consultado = [];
    estados = { data: info(), isLoading: false, error: null };
  });

  it('só vai ao DevOps quando o menu abre', () => {
    render(<MenuEstado id={18905} estadoAtual="New" />);
    expect(consultado.every((id) => id === null)).toBe(true);
    abrir();
    expect(consultado).toContain(18905);
  });

  it('oferece os outros estados e muda sem timer nenhum', () => {
    render(<MenuEstado id={18905} estadoAtual="New" />);
    abrir();
    expect(screen.queryByRole('button', { name: 'New' })).toBeNull(); // o de hoje não é destino
    fireEvent.click(screen.getByRole('button', { name: 'Em desenvolvimento' }));
    expect(mutate).toHaveBeenCalledWith({ id: 18905, estado: 'Em desenvolvimento' }, expect.anything());
  });

  it('com filho aberto, o Done fica barrado e diz quais são; os passos do meio seguem livres', () => {
    estados = { data: info({ filhosAbertos: [19300, 19311] }), isLoading: false, error: null };
    render(<MenuEstado id={18905} estadoAtual="New" />);
    abrir();
    const done = screen.getByRole('button', { name: /Done/ }) as HTMLButtonElement;
    expect(done.disabled).toBe(true);
    expect(done.textContent).toContain('2 filhos abertos (#19300, #19311)');
    fireEvent.click(done);
    expect(mutate).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Aguardando Teste' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('item de outra pessoa: explica e não oferece nada', () => {
    estados = { data: info({ atribuido: false }), isLoading: false, error: null };
    render(<MenuEstado id={18905} estadoAtual="New" />);
    abrir();
    expect(screen.getByText(/não está atribuído a você/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });
});
