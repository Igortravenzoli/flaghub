import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { CsIncidentesDeclaradosResponse } from '@/hooks/useCsIncidentesDeclarados';

// INC-2 — o card substitui o antigo "Incidentes com parada · priorização", que
// renderizava 4 itens FICTÍCIOS hardcoded. O último teste deste arquivo é o que
// impede o seed de voltar.

type Q = {
  data?: CsIncidentesDeclaradosResponse;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

let q: Q;
const refetch = vi.fn();

vi.mock('@/hooks/useCsIncidentesDeclarados', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useCsIncidentesDeclarados')>()),
  useCsIncidentesDeclarados: () => q,
}));

import { IncidentesDeclaradosCard } from '@/components/helpdesk/IncidentesDeclaradosCard';

const resp = (over: Partial<CsIncidentesDeclaradosResponse> = {}): CsIncidentesDeclaradosResponse => ({
  estado: 'ok',
  total: 7, totalBase: 120,
  ativos: 2, contornados: 1, resolvidos: 3, naoClassificados: 1,
  pctDentroSla: 86, slaDentro: 6, slaFora: 1,
  porCategoria: [{ name: 'Disponibilidade', value: 4 }, { name: 'Segurança', value: 3 }],
  porPriorizacao: [{ name: 'Alta', value: 5 }],
  porStatus: [{ name: 'Resolvido', value: 3 }],
  downtimeTotalHoras: 6.5, comDowntime: 3,
  recentes: [
    {
      id: 1, protocolo: 'INC-2101', titulo: 'Fila de integração travada no Broker',
      status: 'Resolvido', bucket: 'resolvido', categoria: 'Disponibilidade',
      priorizacao: 'Alta', produto: 'ConnectMerchan', sla: 'Dentro do SLA',
      downtimeHoras: 2.5, criadoEm: '2026-07-28T10:00:00Z',
    },
    {
      id: 2, protocolo: 'INC-2102', titulo: 'Lentidão no FlexxSales',
      status: 'Ativo', bucket: 'ativo', categoria: 'Desempenho',
      priorizacao: 'Média', produto: 'Flexx', sla: '—',
      downtimeHoras: null, criadoEm: '2026-07-27T10:00:00Z',
    },
  ],
  truncado: false, limite: 1000,
  sincronizadoEm: '2026-07-30T06:00:00Z', sincronizadoHaHoras: 6,
  espelhoDesatualizado: false, espelhoCritico: false,
  temCampoEscopo: false,
  ...over,
});

const renderCard = () =>
  render(<IncidentesDeclaradosCard dataInicio={new Date('2026-07-01')} dataFim={new Date('2026-07-31')} />);

beforeEach(() => {
  refetch.mockClear();
  q = { data: resp(), isLoading: false, isError: false, refetch };
});

describe('INC-2 — estados da fonte são DISTINGUÍVEIS', () => {
  it('isLoading: skeleton, nenhum número renderizado, nunca spinner', () => {
    q = { data: undefined, isLoading: true, isError: false, refetch };
    const { container } = renderCard();
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(screen.queryByText('Declarados')).toBeNull();
  });

  it('isError: texto de erro + botão que chama refetch', () => {
    q = { data: undefined, isLoading: false, isError: true, refetch };
    renderCard();
    expect(screen.getByText(/Não foi possível ler o espelho do SharePoint SGSI/)).toBeInTheDocument();
    screen.getByRole('button', { name: /Tentar novamente/i }).click();
    expect(refetch).toHaveBeenCalled();
  });

  it('periodo-vazio: diz que o PERÍODO está vazio e cita o total do espelho', () => {
    q = { data: resp({ estado: 'periodo-vazio', total: 0, totalBase: 120 }), isLoading: false, isError: false, refetch };
    renderCard();
    expect(screen.getByText('Nenhum incidente declarado no período.')).toBeInTheDocument();
    expect(screen.getByText(/120 incidentes declarados no total/)).toBeInTheDocument();
    // e NÃO renderiza os 4 KPIs zerados
    expect(screen.queryByText('Declarados')).toBeNull();
  });

  it('sem-espelho: texto distinto (sync nunca rodou OU sem permissão) — não inventa diagnóstico', () => {
    q = { data: resp({ estado: 'sem-espelho', total: 0, totalBase: 0, sincronizadoEm: null, sincronizadoHaHoras: null }), isLoading: false, isError: false, refetch };
    renderCard();
    expect(screen.getByText('Espelho do SharePoint SGSI indisponível.')).toBeInTheDocument();
    expect(screen.getByText(/a sincronização nunca rodou, ou seu usuário não tem permissão/)).toBeInTheDocument();
  });

  it('espelho-vazio: terceira mensagem, distinta das duas acima', () => {
    q = { data: resp({ estado: 'espelho-vazio', total: 0, totalBase: 0 }), isLoading: false, isError: false, refetch };
    renderCard();
    expect(screen.getByText(/está sincronizada, mas sem nenhum registro/)).toBeInTheDocument();
    expect(screen.queryByText('Nenhum incidente declarado no período.')).toBeNull();
    expect(screen.queryByText('Espelho do SharePoint SGSI indisponível.')).toBeNull();
  });
});

describe('INC-2 — dados', () => {
  it('os 4 KPIs têm RÓTULO visível (modo TV: nada só no hover)', () => {
    renderCard();
    for (const rot of ['Declarados', 'Ativos', 'Contornados', 'Resolvidos']) {
      expect(screen.getByText(rot)).toBeInTheDocument();
    }
  });

  it('protocolo e título dos recentes aparecem, sem truncate', () => {
    const { container } = renderCard();
    expect(screen.getByText('INC-2101')).toBeInTheDocument();
    expect(screen.getByText('Fila de integração travada no Broker')).toBeInTheDocument();
    expect(container.querySelector('.truncate')).toBeNull();
  });

  it('downtime não declarado sai "—", JAMAIS "0,0h"', () => {
    const { container } = renderCard();
    expect(screen.getByText('2,5h')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain('0,0h');
  });

  it('pctDentroSla null → "—" na linha de SLA, com o denominador honesto omitido', () => {
    q = { data: resp({ pctDentroSla: null, slaDentro: 0, slaFora: 0 }), isLoading: false, isError: false, refetch };
    const { container } = renderCard();
    expect(container.textContent).toContain('Dentro do SLA:');
    expect(container.textContent).not.toContain('0%');
  });

  it('naoClassificados > 0 é declarado (o gestor vê que a conta tem sobra)', () => {
    const { container } = renderCard();
    expect(container.textContent).toContain('Status fora dos 3 grupos');
  });

  it('naoClassificados = 0 não mostra a linha', () => {
    q = { data: resp({ naoClassificados: 0 }), isLoading: false, isError: false, refetch };
    const { container } = renderCard();
    expect(container.textContent).not.toContain('Status fora dos 3 grupos');
  });

  it('downtime declara o denominador: "em 3 de 7 registros"', () => {
    const { container } = renderCard();
    expect(container.textContent).toContain('em 3 de 7 registros');
  });

  it('selo de frescor do espelho aparece no header', () => {
    renderCard();
    expect(screen.getByText('sincronizado há 6h')).toBeInTheDocument();
  });

  it('truncado: o rodapé DECLARA que a lista é parcial', () => {
    q = { data: resp({ truncado: true, total: 1200, limite: 1000 }), isLoading: false, isError: false, refetch };
    const { container } = renderCard();
    expect(container.textContent).toContain('Exibindo 1.000 de 1.200 registros do período');
  });
});

describe('INC-2/INC-3 — rodapé honesto e anti-seed', () => {
  it('o rodapé diz "declaração manual" e "não são coletados automaticamente"', () => {
    const { container } = renderCard();
    expect(container.textContent).toContain('declaração manual');
    expect(container.textContent).toContain('não são coletados automaticamente');
  });

  it('o rodapé declara a AUSÊNCIA de Global × Pontual em vez de sintetizar', () => {
    const { container } = renderCard();
    expect(container.textContent).toContain('não tem campo de escopo nem de clientes afetados');
  });

  it('ANTI-SEED: nenhum dos 4 nomes fictícios do card antigo aparece na árvore', () => {
    const { container } = renderCard();
    for (const ficticio of [
      'Trava versão app Merchan',
      'Trava versão banco Merchan',
      'Lentidão digitação de pedidos',
      'Erro componente NFE',
    ]) {
      expect(container.textContent).not.toContain(ficticio);
    }
  });

  it('ANTI-SEED: "Global"/"Pontual" só aparecem na frase que DECLARA a ausência, nunca como valor', () => {
    const { container } = renderCard();
    // nenhum elemento-folha cujo texto INTEIRO seja "Global" ou "Pontual"
    // (é assim que um badge de escopo apareceria)
    const folhas = [...container.querySelectorAll('*')]
      .filter((el) => el.children.length === 0)
      .map((el) => el.textContent?.trim());
    expect(folhas).not.toContain('Global');
    expect(folhas).not.toContain('Pontual');
    // e a única menção está na explicação da ausência
    const mencoes = container.textContent!.match(/Global/g) ?? [];
    expect(mencoes).toHaveLength(1);
    expect(container.textContent).toContain('Global × Pontual');
  });
});
