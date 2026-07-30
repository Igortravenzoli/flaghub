import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type {
  TechLeadConsultorResponse, TechLeadPorDiaResponse, PorDiaItem, ConsultorItem,
} from '@/hooks/useTechLeadKpis';

// PRD-1 — a coluna "Média" passa a vir de /resumo-consultor{,-infra} (dias ÚTEIS)
// em vez da média aritmética dos dias COM lançamento do /por-dia.

type Q<T> = { data?: T; isLoading: boolean; isError: boolean; refetch: () => void };

let qPorDia: Q<TechLeadPorDiaResponse>;
let qSis: Q<TechLeadConsultorResponse>;
let qInf: Q<TechLeadConsultorResponse>;

const rfPorDia = vi.fn();
const rfSis = vi.fn();
const rfInf = vi.fn();

vi.mock('@/hooks/useTechLeadKpis', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useTechLeadKpis')>()),
  useTechLeadPorDia: () => qPorDia,
  useTechLeadConsultorSistemas: () => qSis,
  useTechLeadConsultorInfra: () => qInf,
}));

import { ProdutividadeConsultoresCard } from '@/components/helpdesk/ProdutividadeConsultoresCard';

const dia = (consultor: string, data: string, pct: number): PorDiaItem => ({
  consultor, dataRegistro: data, diaSemana: '', totalRegistros: 5,
  totalTempoSegundos: Math.round(pct / 100 * 28800), produtividadeDia: pct,
});

const cons = (consultor: string, produtividade: number): ConsultorItem => ({
  consultor, totalRegistros: 50, totalTempoSegundos: 100000, produtividade,
});

const porDia = (registros: PorDiaItem[]): TechLeadPorDiaResponse => ({
  success: true, dataInicio: '2026-07-01', dataFim: '2026-07-31', registros,
});

const resumo = (consultores: ConsultorItem[]): TechLeadConsultorResponse => ({
  success: true, dataInicio: '2026-07-01', dataFim: '2026-07-31',
  consultores, totalRegistros: 0, totalTempoSegundos: 0,
});

const ok = <T,>(data: T, refetch: () => void): Q<T> => ({ data, isLoading: false, isError: false, refetch });

const renderCard = () =>
  render(<ProdutividadeConsultoresCard dataInicio={new Date('2026-07-01')} dataFim={new Date('2026-07-31')} />);

beforeEach(() => {
  rfPorDia.mockClear(); rfSis.mockClear(); rfInf.mockClear();
  qPorDia = ok(porDia([]), rfPorDia);
  qSis = ok(resumo([]), rfSis);
  qInf = ok(resumo([]), rfInf);
});

describe('PRD-1 — a média é a de DIAS ÚTEIS, não a aritmética dos dias com lançamento', () => {
  it('prova central: 3 dias ~90% + 1 sábado 12% (aritmética ≈ 70%) mostra 87%, o número da planilha', () => {
    qPorDia = ok(porDia([
      dia('Ailton', '2026-07-06', 91),
      dia('Ailton', '2026-07-07', 89),
      dia('Ailton', '2026-07-08', 90),
      dia('Ailton', '2026-07-11', 12),   // sábado
    ]), rfPorDia);
    qSis = ok(resumo([cons('Ailton', 87.4)]), rfSis);

    renderCard();
    expect(screen.getByText('87%')).toBeInTheDocument();
    expect(screen.queryByText('71%')).toBeNull();
    expect(screen.queryByText('70%')).toBeNull();
  });

  it('o cabeçalho da coluna diz "Média · dias úteis" e o rodapé afirma a base', () => {
    qSis = ok(resumo([cons('Ailton', 87.4)]), rfSis);
    const { container } = renderCard();
    expect(screen.getByText('Média · dias úteis')).toBeInTheDocument();
    expect(container.textContent).toContain('Média = produtividade sobre dias úteis');
    expect(container.textContent).toContain('exclui fim de semana e feriados');
  });
});

describe('PRD-1 — união das três populações, lista única com equipe em texto', () => {
  it('consultor só em resumo-consultor-infra aparece com a tag infra', () => {
    qInf = ok(resumo([cons('Bruna', 78.2)]), rfInf);
    const { container } = renderCard();
    // escopo na tbody: "sis"/"infra" também aparecem na legenda do rodapé
    const linha = container.querySelector('tbody tr')!;
    expect(linha.textContent).toContain('Bruna');
    expect(linha.textContent).toContain('infra');
    expect(linha.textContent).toContain('78%');
  });

  it('sistemas e infra na MESMA tabela, com as tags corretas por linha', () => {
    qSis = ok(resumo([cons('Ailton', 91)]), rfSis);
    qInf = ok(resumo([cons('Ronaldo', 63)]), rfInf);
    const { container } = renderCard();
    const linhas = [...container.querySelectorAll('tbody tr')];
    expect(linhas.length).toBe(2);
    const ailton = linhas.find((l) => l.textContent?.includes('Ailton'))!;
    const ronaldo = linhas.find((l) => l.textContent?.includes('Ronaldo'))!;
    expect(ailton.textContent).toContain('sis');
    expect(ailton.textContent).not.toContain('infra');
    expect(ronaldo.textContent).toContain('infra');
  });

  it('consultor só no por-dia mostra média "—", NUNCA 0%', () => {
    qPorDia = ok(porDia([dia('Fulano', '2026-07-06', 55)]), rfPorDia);
    renderCard();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('nome com acento/caixa divergente casa na MESMA linha (junção por normalização)', () => {
    qPorDia = ok(porDia([dia('Leandrofaria', '2026-07-06', 88)]), rfPorDia);
    qSis = ok(resumo([cons('leandroFaria', 88.3)]), rfSis);
    const { container } = renderCard();
    expect(container.querySelectorAll('tbody tr').length).toBe(1);
    expect(screen.getByText('88%')).toBeInTheDocument();
  });

  it('ordena por média desc com "—" no FIM (com ?? 0 o sem-base viria antes de um 0% real)', () => {
    qPorDia = ok(porDia([dia('SemBase', '2026-07-06', 40)]), rfPorDia);
    qSis = ok(resumo([cons('Alto', 91), cons('Medio', 87), cons('Zero', 0)]), rfSis);
    const { container } = renderCard();
    const medias = [...container.querySelectorAll('tbody tr')].map(
      (tr) => tr.querySelector('td:last-child')!.textContent
    );
    expect(medias).toEqual(['91%', '87%', '0%', '—']);
  });
});

describe('PRD-1 — acima de 100%', () => {
  it('o NÚMERO exibido é o real (112%) e o clamp fica só na largura da barra', () => {
    qSis = ok(resumo([cons('Bruna', 112)]), rfSis);
    const { container } = renderCard();
    expect(screen.getByText('112%')).toBeInTheDocument();
    const barra = container.querySelector('tbody .rounded-full .rounded-full') as HTMLElement;
    expect(barra.style.width).toBe('100%');
  });

  it('aviso amarelo aparece quando há linha > 100%', () => {
    qSis = ok(resumo([cons('Bruna', 112)]), rfSis);
    const { container } = renderCard();
    expect(container.textContent).toContain('Acima de 100%');
  });

  it('aviso NÃO aparece quando ninguém passa de 100%', () => {
    qSis = ok(resumo([cons('Ailton', 91)]), rfSis);
    const { container } = renderCard();
    expect(container.textContent).not.toContain('Acima de 100%');
  });
});

describe('PRD-1 — 3 estados obrigatórios', () => {
  it('isLoading: skeleton, nenhum spinner com role="status"', () => {
    qPorDia = { data: undefined, isLoading: true, isError: false, refetch: rfPorDia };
    const { container } = renderCard();
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('os 3 em erro: mensagem citando a VPN + botão que chama os 3 refetch', () => {
    qPorDia = { data: undefined, isLoading: false, isError: true, refetch: rfPorDia };
    qSis = { data: undefined, isLoading: false, isError: true, refetch: rfSis };
    qInf = { data: undefined, isLoading: false, isError: true, refetch: rfInf };
    renderCard();
    expect(screen.getByText(/Confirme a VPN da Flag/)).toBeInTheDocument();
    screen.getByRole('button', { name: /Tentar novamente/i }).click();
    expect(rfPorDia).toHaveBeenCalled();
    expect(rfSis).toHaveBeenCalled();
    expect(rfInf).toHaveBeenCalled();
  });

  it('só a média em erro (por-dia ok): tabela renderiza + link de retry parcial', () => {
    qPorDia = ok(porDia([dia('Ailton', '2026-07-06', 88)]), rfPorDia);
    qSis = { data: undefined, isLoading: false, isError: true, refetch: rfSis };
    renderCard();
    expect(screen.getByText(/Ailton/)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /Média por dias úteis indisponível/i });
    btn.click();
    expect(rfSis).toHaveBeenCalled();
  });

  it('listas vazias: empty state COM instrução (amplie o filtro)', () => {
    renderCard();
    expect(screen.getByText(/amplie o filtro de período/)).toBeInTheDocument();
  });
});
