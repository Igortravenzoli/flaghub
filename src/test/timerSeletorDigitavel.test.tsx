import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Classificacao } from '@/lib/timerTags';

/**
 * Produto, Cliente e Categoria pelo teclado — 25/11/2026.
 *
 * Vindo do título com Tab, cada campo era um botão: tinha de abrir a lista
 * para só então pesquisar. Agora o campo é a própria busca: chegou, digita,
 * Enter (ou Tab) escolhe.
 */

vi.mock('@/hooks/useTimerTarefas', () => ({
  ErroTimer: class extends Error {},
  useCamposTimer: () => ({
    data: { produtos: ['FlexX', 'FlexxPower', 'Sofia'], clientes: ['Nestlé', 'Heineken', 'Flag'] },
    isLoading: false,
    error: null,
  }),
  useTagsTimer: () => ({ data: ['Infra', 'Reunião', 'Suporte'], isLoading: false, error: null }),
  useTagsConhecidas: () => [],
}));

import { SeletorTags } from '@/components/timer/SeletorTags';

function Tela({ inicial }: { inicial?: Partial<Classificacao> }) {
  const [cls, setCls] = useState<Classificacao>({ produto: null, cliente: null, tags: [], ...inicial });
  return (
    <>
      <SeletorTags projeto="Flag.Planejamento" valor={cls} onChange={setCls} />
      <output data-testid="valor">{JSON.stringify(cls)}</output>
    </>
  );
}
const valor = () => JSON.parse(screen.getByTestId('valor').textContent ?? '{}') as Classificacao;
const campo = (nome: RegExp) => screen.getByRole('combobox', { name: nome }) as HTMLInputElement;

describe('campos de Produto, Cliente e Categoria', () => {
  it('são campos de texto: dá para chegar com Tab e digitar, sem abrir nada antes', () => {
    render(<Tela />);
    for (const nome of [/Produto/, /Cliente/, /Categoria/]) {
      expect(campo(nome).tagName).toBe('INPUT');
      expect(campo(nome).tabIndex).toBe(0);
    }
    // nada aberto até a pessoa digitar ou clicar
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('digitar filtra e Enter escolhe o primeiro; o campo passa a mostrar a escolha', () => {
    render(<Tela />);
    const produto = campo(/Produto/);
    fireEvent.change(produto, { target: { value: 'sof' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Sofia']);
    fireEvent.keyDown(produto, { key: 'Enter' });
    expect(valor().produto).toBe('Sofia');
    expect(produto.value).toBe('Sofia');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('as setas andam pela lista e o Enter escolhe o destacado', () => {
    render(<Tela />);
    const produto = campo(/Produto/);
    fireEvent.change(produto, { target: { value: 'fle' } });
    fireEvent.keyDown(produto, { key: 'ArrowDown' });
    fireEvent.keyDown(produto, { key: 'Enter' });
    expect(valor().produto).toBe('FlexxPower');
  });

  it('Tab com algo digitado escolhe o destacado e não segura o foco', () => {
    render(<Tela />);
    const cliente = campo(/Cliente/);
    fireEvent.change(cliente, { target: { value: 'hei' } });
    const naoBarrou = fireEvent.keyDown(cliente, { key: 'Tab' });
    expect(naoBarrou).toBe(true); // o Tab segue para o próximo campo
    expect(valor().cliente).toBe('Heineken');
  });

  it('Tab sem digitar não mexe na escolha; redigitar o mesmo nome não esvazia o campo', () => {
    render(<Tela inicial={{ produto: 'Sofia' }} />);
    const produto = campo(/Produto/);
    expect(produto.value).toBe('Sofia');
    fireEvent.keyDown(produto, { key: 'Tab' });
    expect(valor().produto).toBe('Sofia');
    fireEvent.change(produto, { target: { value: 'sofia' } });
    fireEvent.keyDown(produto, { key: 'Tab' });
    expect(valor().produto).toBe('Sofia');
  });

  it('Esc fecha a lista e devolve o valor que estava', () => {
    render(<Tela inicial={{ cliente: 'Flag' }} />);
    const cliente = campo(/Cliente/);
    fireEvent.change(cliente, { target: { value: 'xyz' } });
    expect(screen.getByText('Nada encontrado.')).toBeTruthy();
    fireEvent.keyDown(cliente, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(cliente.value).toBe('Flag');
    expect(valor().cliente).toBe('Flag');
  });

  it('Categoria aceita várias: Enter marca e a lista segue aberta para a próxima', () => {
    render(<Tela />);
    const categoria = campo(/Categoria/);
    fireEvent.change(categoria, { target: { value: 'inf' } });
    fireEvent.keyDown(categoria, { key: 'Enter' });
    fireEvent.change(categoria, { target: { value: 'sup' } });
    fireEvent.keyDown(categoria, { key: 'Enter' });
    expect(valor().tags).toEqual(['Infra', 'Suporte']);
    expect(screen.getByRole('listbox')).toBeTruthy();
    // na múltipla, o Tab só segue: não marca nada
    fireEvent.change(categoria, { target: { value: 'reu' } });
    fireEvent.keyDown(categoria, { key: 'Tab' });
    expect(valor().tags).toEqual(['Infra', 'Suporte']);
  });

  it('clicar no campo abre a lista inteira e clicar num item escolhe', () => {
    render(<Tela />);
    fireEvent.click(campo(/Produto/));
    expect(screen.getAllByRole('option')).toHaveLength(3);
    fireEvent.click(screen.getByRole('option', { name: 'FlexX' }));
    expect(valor().produto).toBe('FlexX');
  });
});
