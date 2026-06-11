import { render, screen, fireEvent } from '@testing-library/react';
import { MovimentacaoFormDialog } from '@/components/comercial/MovimentacaoFormDialog';

// Testa o formulário de movimentação manual no nível do dialog (componente
// controlado, sem Supabase). Evita interação com o Select do Radix ("Tipo"
// usa o valor padrão "ganho") e valida render, edição dos campos e submit.
describe('MovimentacaoFormDialog - Cadastro Manual', () => {
  it('renderiza os campos principais e edita os campos de texto', () => {
    render(
      <MovimentacaoFormDialog open onClose={() => {}} onSubmit={() => {}} mode="create" />
    );

    expect(screen.getByText('Nova Movimentação')).toBeInTheDocument();

    const codigo = screen.getByLabelText('Código do Cliente') as HTMLInputElement;
    const nome = screen.getByLabelText('Nome do Cliente') as HTMLInputElement;

    fireEvent.change(codigo, { target: { value: 'C001' } });
    fireEvent.change(nome, { target: { value: 'Cliente Teste' } });

    expect(codigo.value).toBe('C001');
    expect(nome.value).toBe('Cliente Teste');

    expect(screen.getByText('Salvar')).toBeInTheDocument();
    expect(screen.getByText('Cancelar')).toBeInTheDocument();
  });

  it('dispara onSubmit com os dados ao clicar em Salvar', () => {
    const onSubmit = vi.fn();
    render(
      <MovimentacaoFormDialog open onClose={() => {}} onSubmit={onSubmit} mode="create" />
    );

    fireEvent.change(screen.getByLabelText('Código do Cliente'), { target: { value: 'C001' } });
    fireEvent.change(screen.getByLabelText('Nome do Cliente'), { target: { value: 'Cliente Teste' } });

    fireEvent.click(screen.getByText('Salvar'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        cliente_codigo: 'C001',
        cliente_nome: 'Cliente Teste',
        tipo: 'ganho',
      })
    );
  });
});
