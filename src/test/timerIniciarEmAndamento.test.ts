import { describe, expect, it } from 'vitest';
import { destinoDoIniciar, TIPOS_QUE_ANDAM_AO_INICIAR } from '../../supabase/functions/timer-devops/tarefas';

/**
 * Deu play, a Task sai de To Do e vai para In Progress — 26/11/2026.
 *
 * A Task "Reunião - …" criada pelo Timer ficava em To Do com o timer rodando.
 * A edge (op `iniciar`) decide o destino por aqui: só sai de um estado da
 * categoria Proposed, e para o primeiro "em andamento" do tipo.
 */

// Como a API do DevOps devolve os estados (workitemtypes/{tipo}/states).
const TASK = {
  value: [
    { name: 'To Do', category: 'Proposed' },
    { name: 'In Progress', category: 'InProgress' },
    { name: 'Done', category: 'Completed' },
    { name: 'Removed', category: 'Removed' },
  ],
};

describe('iniciar o timer: para onde a Task vai no DevOps (edge)', () => {
  it('só a Task anda ao iniciar; PBI e Bug seguem só no encerrar', () => {
    expect(TIPOS_QUE_ANDAM_AO_INICIAR).toEqual(['Task']);
  });

  it('To Do vai para In Progress', () => {
    expect(destinoDoIniciar('To Do', TASK)).toBe('In Progress');
    expect(destinoDoIniciar(' to do ', TASK)).toBe('In Progress');
  });

  it('já em andamento, concluída ou removida: fica como está', () => {
    expect(destinoDoIniciar('In Progress', TASK)).toBeNull();
    // retomar uma Task já em Done não a reabre
    expect(destinoDoIniciar('Done', TASK)).toBeNull();
    expect(destinoDoIniciar('Removed', TASK)).toBeNull();
  });

  it('estado que o tipo não conhece, ou lista que não veio: não mexe', () => {
    expect(destinoDoIniciar('Qualquer', TASK)).toBeNull();
    expect(destinoDoIniciar('To Do', null)).toBeNull();
    expect(destinoDoIniciar('To Do', { value: [] })).toBeNull();
  });

  it('processo com outros nomes: vale a categoria, na ordem do fluxo', () => {
    const agile = {
      value: [
        { name: 'Closed', category: 'Completed' },
        { name: 'Active', category: 'InProgress' },
        { name: 'New', category: 'Proposed' },
        { name: 'Resolved', category: 'Resolved' },
      ],
    };
    expect(destinoDoIniciar('New', agile)).toBe('Active');
    // tipo sem nenhum estado "em andamento": não há para onde ir
    expect(destinoDoIniciar('New', { value: [{ name: 'New', category: 'Proposed' }, { name: 'Done', category: 'Completed' }] })).toBeNull();
  });
});
