import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

/**
 * Contrato do telão (usuário monitor), 25/08/2026.
 *
 * A TV não tem operador: se reiniciar (queda de energia, update do SO), tem que
 * voltar EXIBINDO sozinha. Por isso o monitor não vê mais o diálogo de
 * configuração ao carregar — ele entra direto em rotação, e o diálogo só é
 * alcançável pelo ESC.
 *
 * O que este arquivo protege, e que já foi quebrado antes:
 *   • auto-start que dispara mais de uma vez — o ESC cairia de volta no kiosk
 *     e a configuração ficaria inalcançável;
 *   • perder a config no reload — o reboot voltaria no padrão em vez de voltar
 *     no que estava no ar;
 *   • deixar o monitor parado na tela de cards, que ninguém está lá para clicar.
 */

const MONITOR_KIOSK_CONFIG_KEY = 'flaghub:monitor-kiosk-config';

let isMonitorMock = true;
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ isMonitor: isMonitorMock }),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const base = { isLoading: false, isError: false };
vi.mock('@/hooks/useComercialKpis', () => ({ useComercialKpis: () => ({ ...base }) }));
vi.mock('@/hooks/useComercialMovimentacao', () => ({
  useComercialMovimentacao: () => ({ ...base, stats: { totalGanhos: 0, totalPerdas: 0 } }),
}));
vi.mock('@/hooks/useHelpdeskKpis', () => ({ useHelpdeskKpis: () => ({ ...base, totalRegistros: 0 }) }));
vi.mock('@/hooks/useFabricaKpis', () => ({
  useFabricaKpis: () => ({ ...base, toDo: 0, inProgress: 0, sortedSprints: [], currentSprint: 'all' }),
}));
vi.mock('@/hooks/useQualidadeKpis', () => ({
  useQualidadeKpis: () => ({ ...base, filaAtual: 0, emTeste: 0, allItems: [] }),
}));
vi.mock('@/hooks/useCustomerServiceKpis', () => ({
  useCustomerServiceKpis: () => ({ ...base, implTotal: 0, implAndamento: 0 }),
}));
vi.mock('@/hooks/useInfraestruturaKpis', () => ({
  useInfraestruturaKpis: () => ({ ...base, total: 0, emAndamento: 0, allItems: [] }),
}));
vi.mock('@/hooks/useSprintFilter', () => ({ useSprintFilter: () => ({ currentSprint: 'all' }) }));

// Stub do overlay: o que importa aqui é COM QUE config o kiosk subiu, não o
// desenho do telão (que tem cobertura própria em fabricaTv/csTv).
vi.mock('@/components/home/KioskOverlay', () => ({
  default: ({
    activeSectors,
    rotateEnabled,
    onExit,
  }: {
    activeSectors: { slug: string }[];
    rotateEnabled: boolean;
    onExit: () => void;
  }) => (
    <div data-testid="kiosk">
      <span data-testid="rotativo">{String(rotateEnabled)}</span>
      <span data-testid="setores">{activeSectors.map((s) => s.slug).join(',')}</span>
      <button onClick={onExit}>sair</button>
    </div>
  ),
}));

import Home from '@/pages/Home';

const TITULO_CONFIG = 'Configurar Modo Kiosk';

describe('Telão (monitor) — auto-start em rotação', () => {
  beforeEach(() => {
    isMonitorMock = true;
    localStorage.clear();
  });

  it('entra direto em kiosk rotativo, sem pedir configuração', () => {
    render(<Home />);

    expect(screen.getByTestId('kiosk')).toBeInTheDocument();
    expect(screen.getByTestId('rotativo')).toHaveTextContent('true');
    // Todos os painéis por padrão, na ordem dos cards do hub.
    expect(screen.getByTestId('setores')).toHaveTextContent(
      'comercial,customer-service,fabrica,infraestrutura,qualidade,helpdesk',
    );
    // A pergunta não pode aparecer sozinha — ninguém está lá para responder.
    expect(screen.queryByText(TITULO_CONFIG)).not.toBeInTheDocument();
  });

  it('persiste a config para o reboot voltar no mesmo ponto', () => {
    render(<Home />);

    const salvo = JSON.parse(localStorage.getItem(MONITOR_KIOSK_CONFIG_KEY) ?? 'null');
    expect(salvo).toMatchObject({ rotateEnabled: true, intervalSec: 30 });
    expect(salvo.selectedSlugs).toHaveLength(6);
  });

  it('no reload, retoma a config salva em vez do padrão', () => {
    localStorage.setItem(
      MONITOR_KIOSK_CONFIG_KEY,
      JSON.stringify({ selectedSlugs: ['fabrica', 'qualidade'], rotateEnabled: false, intervalSec: 120 }),
    );

    render(<Home />);

    expect(screen.getByTestId('setores')).toHaveTextContent('fabrica,qualidade');
    expect(screen.getByTestId('rotativo')).toHaveTextContent('false');
  });

  it('config corrompida no localStorage cai no padrão em vez de quebrar a TV', () => {
    localStorage.setItem(MONITOR_KIOSK_CONFIG_KEY, '{isso não é json');

    render(<Home />);

    expect(screen.getByTestId('kiosk')).toBeInTheDocument();
    expect(screen.getByTestId('rotativo')).toHaveTextContent('true');
  });

  it('config salva sem nenhum painel cai no padrão (telão vazio não é estado válido)', () => {
    localStorage.setItem(
      MONITOR_KIOSK_CONFIG_KEY,
      JSON.stringify({ selectedSlugs: [], rotateEnabled: true, intervalSec: 30 }),
    );

    render(<Home />);

    expect(screen.getByTestId('setores')).toHaveTextContent('comercial');
  });

  it('ESC é a única porta para a configuração, e não recai no kiosk', () => {
    render(<Home />);
    expect(screen.queryByText(TITULO_CONFIG)).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByText(TITULO_CONFIG)).toBeInTheDocument();
    // Se o auto-start repetisse, o kiosk voltaria por cima do diálogo.
    expect(screen.queryByTestId('kiosk')).not.toBeInTheDocument();
  });

  it('o diálogo do ESC abre refletindo a config em execução', () => {
    localStorage.setItem(
      MONITOR_KIOSK_CONFIG_KEY,
      JSON.stringify({ selectedSlugs: ['fabrica'], rotateEnabled: true, intervalSec: 120 }),
    );

    render(<Home />);
    fireEvent.keyDown(window, { key: 'Escape' });

    // Rotação ligada => o switch aparece marcado e o intervalo salvo é exibido.
    expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'checked');
    expect(screen.getByText('2 minutos')).toBeInTheDocument();
  });
});

describe('Usuário comum — comportamento inalterado', () => {
  beforeEach(() => {
    isMonitorMock = false;
    localStorage.clear();
  });

  it('não entra em kiosk sozinho nem grava config de telão', () => {
    render(<Home />);

    expect(screen.queryByTestId('kiosk')).not.toBeInTheDocument();
    expect(screen.getByText('FLAG Hub')).toBeInTheDocument();
    expect(localStorage.getItem(MONITOR_KIOSK_CONFIG_KEY)).toBeNull();
  });
});
