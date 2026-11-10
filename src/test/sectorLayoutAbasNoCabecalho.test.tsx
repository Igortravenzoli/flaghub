import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';

vi.mock('@/hooks/useHubAreas', () => ({
  useHubAreas: () => ({
    isOwner: () => true, isOperacional: () => true, getAreaRole: () => 'owner', hasArea: () => true,
    areas: [], isLoading: false,
  }),
}));
vi.mock('@/hooks/useHubPermissions', () => ({
  useHubIsAdmin: () => false,
  useAccessRequests: () => ({ requestAccess: { mutateAsync: vi.fn(), isPending: false }, requests: [] }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ isAdmin: false, user: { id: 'u1' } }) }));
vi.mock('@/contexts/MetricMetadataContext', () => ({
  MetricMetadataProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/setores/SectorSettings', () => ({ SectorSettings: () => <div>conteúdo de configurações</div> }));
vi.mock('@/components/setores/SectorImportArea', () => ({ SectorImportArea: () => <div>conteúdo de importações</div> }));
vi.mock('@/components/setores/SectorIntegrations', () => ({ SectorIntegrations: () => null }));

const base = { title: 'Produtos', templateKey: 'cs_implantacoes_v1', areaKey: 'customer-service' };

describe('SectorLayout · abasNoCabecalho', () => {
  it('por padrão mantém a faixa Dashboard / Importações / Configurações', () => {
    render(<SectorLayout {...base}><p>painel</p></SectorLayout>);
    expect(screen.getByRole('tab', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /importações/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /configurações/i })).toBeInTheDocument();
  });

  it('esconde a faixa e leva Importações e Configurações para o cabeçalho', async () => {
    render(<SectorLayout {...base} abasNoCabecalho><p>painel</p></SectorLayout>);
    // A faixa segue no DOM (é ela que liga o conteúdo), mas fora da tela.
    expect(screen.getByRole('tablist', { hidden: true })).toHaveClass('hidden');
    expect(screen.getByText('painel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /voltar ao painel/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /configurações/i }));
    expect(await screen.findByText('conteúdo de configurações')).toBeInTheDocument();
    expect(screen.queryByText('painel')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /voltar ao painel/i }));
    expect(screen.getByText('painel')).toBeInTheDocument();
  });

  it('não esconde a faixa quando há abas de conteúdo que dependem dela', () => {
    render(
      <SectorLayout {...base} abasNoCabecalho extraTabs={[{ id: 'x', label: 'Extra', icon: null, content: <p>extra</p> }]}>
        <p>painel</p>
      </SectorLayout>,
    );
    expect(screen.getByRole('tablist')).not.toHaveClass('hidden');
    expect(screen.getByRole('tab', { name: /extra/i })).toBeInTheDocument();
  });
});

describe('DashboardFilterBar · rotuloDatas', () => {
  const props = {
    preset: 'mes_anterior' as const, onPresetChange: vi.fn(), presetLabel: 'Mês ant.',
    presets: [{ value: 'mes_anterior' as const, label: 'Mês ant.' }], onCustomRange: vi.fn(),
  };

  it('usa "Custom" quando a página não diz nada', () => {
    render(<DashboardFilterBar {...props} />);
    expect(screen.getByRole('button', { name: /custom/i })).toBeInTheDocument();
  });

  it('mostra o texto da página no botão que abre o calendário', () => {
    render(<DashboardFilterBar {...props} rotuloDatas="01/10/26 – 31/10/26" />);
    expect(screen.getByRole('button', { name: '01/10/26 – 31/10/26' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /custom/i })).toBeNull();
  });
});
