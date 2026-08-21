import { render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';

/**
 * Visão Executiva da Qualidade no telão — layout da faixa inferior.
 *
 * O que estes testes travam (decisões de 20–21/08/2026, com o Igor):
 *  • a RECONCILIAÇÃO (encerrados / sem retorno / com retorno) mora dentro do
 *    card de retornos por nº de ciclos — os dois falam da mesma base, e juntá-los
 *    devolveu a coluna esquerda inteira para a tabela de versões, que era o
 *    aperto reclamado no telão;
 *  • a faixa inferior do TV tem DUAS metades — controle de versão e distribuição
 *    de entradas — e nenhum card de reconciliação solto;
 *  • na MESA nada disso vale: lá a reconciliação segue card próprio, com a nota
 *    de conferência e a lista de itens com ≥ 3 retornos.
 */

const retornos = {
  itens_com_retorno: 156,
  itens_1x: 113,
  itens_2x: 24,
  itens_3x_mais: 19,
  ciclos_total: 220,
  top_3x_mais: [
    { work_item_id: 1, title: 'OS 745077 - Importacao Arquivo Padrao OFX', work_item_type: 'Bug', sprint_code: 'S11-2026', ciclos: 7 },
  ],
  reconc: { total_encerrados: 856, sem_retorno: 700, com_retorno: 156 },
};

const fila = {
  sprint_atual: 'S17-2026', total_qa: 97, em_teste: 71, aguardando_deploy: 26,
  no_prazo: 45, atraso: 26, sem_sprint: 0,
  por_origem: [{ sprint_origem: 'S14-2026', age_sprints: 3, n: 12, atraso: true }],
};

vi.mock('@/hooks/useQaExecutivo', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useQaExecutivo')>()),
  useQaExecFilaAging: () => ({ data: fila, isLoading: false }),
  useQaExecRetornosDistribuicao: () => ({ data: retornos, isLoading: false }),
  useQualidadeSistemaVersions: () => ({
    data: [
      { id: 's1', sistema_nome: 'Flexx', versao_anterior: '1.84', versao_atual: '1.85', versao_nova: null, data_nova_versao: null, ambientes: ['PROD'], ordem: 10, notas: null },
    ],
    isLoading: false,
  }),
  useSistemaVersaoMutations: () => ({
    create: { mutateAsync: vi.fn(), isPending: false },
    update: { mutateAsync: vi.fn(), isPending: false },
    remove: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock('@/hooks/useGerencialQa', () => ({
  useQaEncerramentosPorUsuario: () => ({ data: [] }),
  useQaHandoffHistogram: () => ({ data: [{ dia: '2026-08-01', entradas: 12 }] }),
}));

vi.mock('@/hooks/useHubAreas', () => ({ useHubAreas: () => ({ isOwner: () => false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ isAdmin: false }) }));

import { ExecutivoTab } from '@/components/qualidade/ExecutivoTab';

describe('ExecutivoTab · Qualidade — faixa inferior do telão', () => {
  it('TV: reconciliação mora no card de retornos por nº de ciclos', () => {
    render(<ExecutivoTab tvMode periodLabel="T3/2026" />);
    const card = screen.getByText('Qualidade · retornos por nº de ciclos').closest('div.p-4')!;
    const dentro = within(card);
    // a distribuição por ciclos continua lá...
    expect(dentro.getByText('113')).toBeInTheDocument();
    expect(dentro.getByText('≥ 3x ⚠')).toBeInTheDocument();
    // ...e a reconciliação entrou como rodapé do MESMO card
    expect(dentro.getByText('856')).toBeInTheDocument();
    expect(dentro.getByText('700')).toBeInTheDocument();
    expect(dentro.getByText(/encerrados 2026/)).toBeInTheDocument();
    expect(dentro.getByText('sem retorno')).toBeInTheDocument();
    expect(dentro.getByText('com retorno')).toBeInTheDocument();
    // 156 aparece 2x no card e isso é a COERÊNCIA da base: o total de itens com
    // retorno (113+24+19) é o mesmo "com retorno" da reconciliação.
    expect(dentro.getAllByText('156')).toHaveLength(2);
  });

  it('TV: nenhum card de reconciliação solto — a faixa é versões + distribuição', () => {
    render(<ExecutivoTab tvMode periodLabel="T3/2026" />);
    expect(screen.queryByText('Retorno QA · reconciliação')).not.toBeInTheDocument();
    expect(screen.getByText('Controle de versão · sistemas')).toBeInTheDocument();
    expect(screen.getByText("Distribuição de entradas em 'Em Teste'")).toBeInTheDocument();
    // a lista de ≥3x é detalhe de mesa: no telão o resumo é o "≥ 3x ⚠" da linha 1
    expect(screen.queryByText('Itens com ≥ 3 retornos')).not.toBeInTheDocument();
  });

  it('mesa: reconciliação segue card próprio, com nota de conferência e lista ≥3x', () => {
    render(<ExecutivoTab periodLabel="T3/2026" />);
    const card = screen.getByText('Retorno QA · reconciliação').closest('div.p-4')!;
    for (const n of ['856', '700', '156']) expect(within(card).getByText(n)).toBeInTheDocument();
    expect(within(card).getByText(/Mesma base da aba/)).toBeInTheDocument();
    expect(within(card).getByText('Itens com ≥ 3 retornos')).toBeInTheDocument();
    // e o card de retornos por ciclos NÃO repete a reconciliação
    const ciclos = screen.getByText('Qualidade · retornos por nº de ciclos').closest('div.p-4')!;
    expect(within(ciclos).queryByText('856')).not.toBeInTheDocument();
  });
});
