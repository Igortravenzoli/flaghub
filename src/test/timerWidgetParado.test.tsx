import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Mini timer (/timer/widget) sem timer rodando — 25/11/2026.
 *
 * Pausou, a pílula fica em "Sem timer ativo": sem nome de tarefa e sem
 * relógio (com o nome ali, parecia que o título anterior tinha ficado). O ▶
 * retoma a última tarefa TRABALHADA que segue aberta, pelo estado do servidor,
 * e não a escolha guardada no navegador; a dica do botão diz qual é.
 */

let motor: Record<string, unknown>;
vi.mock('@/hooks/useTimerRelogio', () => ({ useMotorTimer: () => motor }));
vi.mock('@/hooks/useTimerAcesso', () => ({ registrarEventoTimer: vi.fn() }));

import TimerWidget from '@/pages/timer/TimerWidget';

const iniciar = { isPending: false, mutate: vi.fn() };
const mut = { isPending: false, mutate: vi.fn() };
const rodando = { id: 't1', work_item_id: 19234, titulo: 'Evolução de Segurança', tipo: 'Task', projeto: null };

const demanda = (id: number, titulo: string, atividade: string) => ({
  id: `d${id}`, work_item_id: id, titulo, tipo: 'Task', projeto: 'Flag.Planejamento', aberta_em: atividade, ultima_atividade_em: atividade,
});
const trecho = (id: number, fim: string) => ({ id: `t${id}${fim}`, work_item_id: id, encerrado_em: fim, descartado: false });

function montar(p: { rodando?: boolean; demandas?: unknown[]; trechos?: unknown[] }) {
  motor = {
    rodandoTodos: p.rodando ? [rodando] : [],
    segundosDe: () => 4980,
    carregando: false,
    somenteConsulta: false,
    estado: { demandas: p.demandas ?? [], trechos: p.trechos ?? [] },
    referencia: null,
    acoes: { iniciar, pausar: mut, sinal: mut },
  };
  return render(
    <MemoryRouter>
      <TimerWidget />
    </MemoryRouter>,
  );
}

afterEach(() => {
  localStorage.clear();
  iniciar.mutate.mockClear();
});

describe('mini timer parado', () => {
  it('pausou: "Sem timer ativo", sem nome de tarefa nem relógio; o ▶ retoma a que parou por último', () => {
    // a escolha guardada no navegador aponta para uma tarefa ANTERIOR: não manda mais
    localStorage.setItem('timer-flag:tarefa-selecionada', JSON.stringify({ id: 19300, title: "Refinamento KPI's" }));
    montar({
      demandas: [demanda(19300, "Refinamento KPI's", '2026-11-25T18:00:00Z'), demanda(19234, 'Evolução de Segurança', '2026-11-25T17:00:00Z')],
      trechos: [trecho(19234, '2026-11-25T21:40:00Z'), trecho(19300, '2026-11-25T20:10:00Z')],
    });
    expect(screen.getByText('Sem timer ativo')).toBeTruthy();
    expect(screen.queryByText(/Refinamento/)).toBeNull();
    expect(screen.queryByText(/Evolução/)).toBeNull();
    expect(screen.queryByText('00:00:00')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retomar #19234 Evolução de Segurança' }));
    expect(iniciar.mutate).toHaveBeenCalledWith({ id: 19234, titulo: 'Evolução de Segurança', tipo: 'Task', projeto: 'Flag.Planejamento' });
  });

  it('sem demanda aberta: nem o ▶ aparece', () => {
    montar({ demandas: [], trechos: [trecho(19300, '2026-11-25T20:10:00Z')] });
    expect(screen.getByText('Sem timer ativo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Retomar/ })).toBeNull();
  });

  it('rodando: nome da tarefa, relógio e Pausar', () => {
    montar({ rodando: true, demandas: [demanda(19234, 'Evolução de Segurança', '2026-11-25T17:00:00Z')] });
    expect(screen.getByText('Evolução de Segurança')).toBeTruthy();
    expect(screen.getByText('01:23:00')).toBeTruthy();
    expect(screen.queryByText('Sem timer ativo')).toBeNull();
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Retomar/ })).toBeNull();
  });
});
