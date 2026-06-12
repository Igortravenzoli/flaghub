import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BIInfraSgsiPanel } from '@/components/infraestrutura/BIInfraSgsiPanel';

// Testa o painel SGSI do setor de Infra alimentado pelo gateway em modo
// mock (sem VITE_GATEWAY_URL): espelho do Power BI SG-LST.

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('BIInfraSgsiPanel - Gestão SG (espelho Power BI SG-LST)', () => {
  it('renderiza os contadores "dias sem" e as abas das listas SG', async () => {
    renderWithQuery(<BIInfraSgsiPanel />);

    expect(screen.getByText('Gestão SG · Listas SharePoint')).toBeInTheDocument();
    expect(screen.getByText('Dias sem incidentes')).toBeInTheDocument();
    expect(screen.getByText('Dias sem riscos novos')).toBeInTheDocument();
    expect(screen.getByText('Mudanças (010)')).toBeInTheDocument();
    expect(screen.getByText('Incidentes (017)')).toBeInTheDocument();
    expect(screen.getByText('Riscos (012)')).toBeInTheDocument();
    expect(screen.getByText('NC & Melhorias (018/011)')).toBeInTheDocument();
    expect(screen.getByText('Acessos (014)')).toBeInTheDocument();

    // dados do mock chegam após a latência simulada do gateway
    await waitFor(() => expect(screen.getByText('41')).toBeInTheDocument());
    expect(screen.getByText('Atualizações bem-sucedidas')).toBeInTheDocument();
    expect(screen.getByText('Mudanças e atualizações recentes')).toBeInTheDocument();
  });
});
