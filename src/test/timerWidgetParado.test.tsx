import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Mini timer (/timer/widget) sem timer rodando — 25/11/2026.
 *
 * Parado, a pílula mostrava o nome da última tarefa escolhida e "00:00:00" ao
 * lado: parecia um timer aberto naquela tarefa. Agora o relógio some e a
 * pílula diz "Retomar: <tarefa>" quando há o que retomar, ou "Sem timer ativo".
 */

let motor: Record<string, unknown>;
vi.mock('@/hooks/useTimerRelogio', () => ({ useMotorTimer: () => motor }));
vi.mock('@/hooks/useTimerAcesso', () => ({ registrarEventoTimer: vi.fn() }));

import TimerWidget from '@/pages/timer/TimerWidget';

const mut = { isPending: false, mutate: vi.fn() };
const rodando = { id: 't1', work_item_id: 19234, titulo: 'Evolução de Segurança', tipo: 'Task', projeto: null };

function montar(p: { rodando: boolean; demandas: number[] }) {
  const todos = p.rodando ? [rodando] : [];
  motor = {
    rodandoTodos: todos,
    segundosDe: () => 4980,
    carregando: false,
    somenteConsulta: false,
    estado: { demandas: p.demandas.map((id) => ({ work_item_id: id })) },
    referencia: null,
    acoes: { iniciar: mut, pausar: mut, sinal: mut },
  };
  return render(
    <MemoryRouter>
      <TimerWidget />
    </MemoryRouter>,
  );
}

const guardarEscolha = () =>
  localStorage.setItem(
    'timer-flag:tarefa-selecionada',
    JSON.stringify({ id: 19300, title: "Refinamento KPI's", work_item_type: 'Task', caminho: null, web_url: null }),
  );

afterEach(() => localStorage.clear());

describe('mini timer parado', () => {
  it('com demanda aberta para retomar: diz "Retomar: <tarefa>", sem relógio; o ▶ diz o que retoma', () => {
    guardarEscolha();
    montar({ rodando: false, demandas: [19300] });
    expect(screen.getByText("Retomar: Refinamento KPI's")).toBeTruthy();
    // o nome sozinho, como num timer rodando, não aparece
    expect(screen.queryByText("Refinamento KPI's")).toBeNull();
    expect(screen.queryByText('Sem timer ativo')).toBeNull();
    expect(screen.queryByText('00:00:00')).toBeNull();
    expect(screen.getByRole('button', { name: "Retomar #19300 Refinamento KPI's" })).toBeTruthy();
  });

  it('com a demanda da escolha encerrada: nem o ▶ aparece', () => {
    guardarEscolha();
    montar({ rodando: false, demandas: [19281] });
    expect(screen.getByText('Sem timer ativo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Retomar/ })).toBeNull();
  });

  it('rodando: nome da tarefa, relógio e Pausar', () => {
    guardarEscolha();
    montar({ rodando: true, demandas: [19234, 19300] });
    expect(screen.getByText('Evolução de Segurança')).toBeTruthy();
    expect(screen.getByText('01:23:00')).toBeTruthy();
    expect(screen.queryByText('Sem timer ativo')).toBeNull();
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy();
  });
});
