import { render, screen, fireEvent } from '@testing-library/react';
import { MovimentacaoFormDialog } from '@/components/comercial/MovimentacaoFormDialog';

// Testa o formulário de movimentação manual no nível do dialog (componente
// controlado, sem Supabase). Evita interações com o Select do Radix e com a
// submissão via portal — apenas valida render e edição dos campos de texto.
describe('MovimentacaoFormDialog - Cadastro Manual', () => {
  it('renderiza o formulário de nova movimentação com os campos principais', () => {
    render(
      <MovimentacaoFormDialog
        open
        onClose={() => {}}
        onSubmit={() => {}}
        mode="create"
      />
    );

    // Título do dialog
    expect(screen.getByText('Nova Movimentação')).toBeInTheDocument();

    // Campos de texto associados por label
    const codigo = screen.getByLabelText('Código do Cliente') as HTMLInputElement;
    const nome = screen.getByLabelText('Nome do Cliente') as HTMLInputElement;

    fireEvent.change(codigo, { target: { value: 'C001' } });
    fireEvent.change(nome, { target: { value: 'Cliente Teste' } });

    expect(codigo.value).toBe('C001');
    expect(nome.value).toBe('Cliente Teste');

    // Ações presentes
    expect(screen.getByText('Salvar')).toBeInTheDocument();
    expect(screen.getByText('Cancelar')).toBeInTheDocument();
  });
});
