import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BIInfraSgsiPanel } from '@/components/infraestrutura/BIInfraSgsiPanel';
import { InfraProjetosPanel } from '@/components/infraestrutura/InfraProjetosPanel';

// Testa os novos painéis do setor de Infra alimentados pelo gateway em modo
// mock (sem VITE_GATEWAY_URL): espelho do Power BI SG-LST e gestão de
// projetos sem pipeline com a meta de 3 pipelines novas por trimestre.

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

describe('InfraProjetosPanel - Projetos & Pipelines', () => {
  it('exibe a meta trimestral de 3 pipelines e a carteira sem pipeline', async () => {
    renderWithQuery(<InfraProjetosPanel />);

    expect(screen.getByText('Projetos & Pipelines')).toBeInTheDocument();
    expect(screen.getByText('meta: 3 pipelines novas por trimestre')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('META DO TRIMESTRE — PIPELINES NOVAS')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('/ 3')).toBeInTheDocument());

    // filtro padrão: projetos sem pipeline (gestão do plano de esteira)
    expect(screen.getByText('Projetos sem pipeline')).toBeInTheDocument();
    expect(screen.getByText('DR Site Secundário')).toBeInTheDocument();
    expect(screen.getAllByText('Sem pipeline').length).toBeGreaterThan(0);

    // pipelines entregues no trimestre corrente
    expect(screen.getByText('veeam-policy-as-code')).toBeInTheDocument();
    expect(screen.getByText('obs-datacenter-deploy')).toBeInTheDocument();
  });
});
