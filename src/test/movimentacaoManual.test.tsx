import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MovimentacaoTab from '@/components/comercial/MovimentacaoTab';

describe('MovimentacaoTab - Cadastro Manual', () => {
  it('permite abrir o dialog e cadastrar uma movimentação manual', async () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MovimentacaoTab />
      </QueryClientProvider>
    );

    // Botão de nova movimentação
    const btn = screen.getByText('+ Nova Movimentação');
    fireEvent.click(btn);

    // Dialog aberto
    expect(await screen.findByText('Nova Movimentação')).toBeInTheDocument();

    // Preencher campos obrigatórios
    fireEvent.change(screen.getByLabelText('Código do Cliente'), { target: { value: 'C001' } });
    fireEvent.change(screen.getByLabelText('Nome do Cliente'), { target: { value: 'Cliente Teste' } });
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'ganho' } });

    // Salvar
    fireEvent.click(screen.getByText('Salvar'));

    // Espera feedback de sucesso (pode ser um loading ou fechamento do dialog)
    await waitFor(() => {
      expect(screen.queryByText('Nova Movimentação')).not.toBeInTheDocument();
    });
  });
});
