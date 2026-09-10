import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi } from 'vitest';
import type { BIInfraSgsiResponse } from '@/hooks/useBIInfra';

// Mock do hook de dados — o painel é testado com um snapshot representativo,
// sem Supabase. Validamos a IA refatorada: busca global cross-seção, rótulo da
// seção ativa (troca via dropdown da aba), coluna OS destacada, top-5 de
// ambientes com expandir e o drawer.
const mockData: BIInfraSgsiResponse = {
  success: true,
  message: 'mock',
  atualizadoEm: '2026-07-10T12:00:00Z',
  totalItens: 12,
  totalItensBase: 12,
  diasSem: { incidentes: 5, riscos: 20, naoConformidades: 40, attMalSucedidas: 3, maiorIntervaloIncidentes: 45, maiorIntervaloRiscos: 60 },
  mudancas: {
    total: 4, concluidos: 2, pendentes: 1, aguardandoGestor: 1, aguardandoTI: 0,
    porStatus: [{ name: 'Realizado', value: 2 }, { name: 'Aguardando aprovação Gestores', value: 1 }],
    // 7 ambientes para exercitar o top-5 + expandir
    porAmbiente: ['PROD', 'DEV', 'HML', 'QA', 'DR', 'Sandbox', 'Staging'].map((name, i) => ({ name, value: 7 - i })),
    porRisco: [{ name: 'Alto', value: 1 }], porCategoria: [{ name: 'Infra', value: 3 }],
    // sim + não (3) ≠ total (4): o teste distingue a base certa da base "total de mudanças"
    atualizacoesBemSucedidas: { sim: 2, nao: 1 }, validacaoTestes: { sim: 4, nao: 0 },
    itens: [
      { id: 1, chamado: 'OS-9001', ambiente: 'PROD', tipoMudanca: 'Padrão', categoria: 'Infra', motivo: 'Upgrade cluster', status: 'Realizado', solicitante: 'Ana', aprovadorTI: 'Rodolfo', aprovadorGestor: 'Marcos', risco: 'Alto', atualizacaoBemSucedida: 'Sim', justificativa: '—', criado: '2026-07-01T09:00:00Z', conclusao: '2026-07-09T10:00:00Z', modificado: '2026-07-09T10:00:00Z' },
      { id: 2, chamado: 'OS-9002', ambiente: 'DEV', tipoMudanca: 'Emergencial', categoria: 'Infra', motivo: 'Hotfix', status: 'Aguardando aprovação Gestores', solicitante: 'Bruno', aprovadorTI: '—', aprovadorGestor: '—', risco: 'Baixo', atualizacaoBemSucedida: '—', justificativa: '—', criado: '2026-07-05T09:00:00Z', conclusao: '', modificado: '2026-07-08T10:00:00Z' },
      { id: 3, chamado: 'OS-9003', ambiente: 'HML', tipoMudanca: 'Padrão', categoria: 'Infra', motivo: 'Patch do SO', status: 'Realizado', solicitante: 'Carla', aprovadorTI: 'Tiago', aprovadorGestor: 'Lia', risco: 'Médio', atualizacaoBemSucedida: 'Não', justificativa: 'Timeout no deploy; rollback aplicado', criado: '2026-07-02T09:00:00Z', conclusao: '2026-07-03T10:00:00Z', modificado: '2026-07-03T10:00:00Z' },
    ],
  },
  incidentes: {
    total: 2, ativos: 1, contornados: 0, resolvidos: 1, pctDentroSla: 50,
    porSLA: [{ name: 'Sim', value: 1 }, { name: 'Não', value: 1 }], porCategoria: [{ name: 'Rede', value: 2 }],
    itens: [
      { id: 10, titulo: 'Queda de rede', ativo: 'Switch core', motivo: 'Falha', priorizacao: 'Alta', protocolo: 'INC-500', status: 'Resolvido', tipo: 'Rede', sla: 'Sim', categoria: 'Rede', downtimeHoras: 2, inicio: '2026-07-01T08:00:00Z', produto: 'Datacenter', descricao: 'Switch core parou de responder', solucao: 'Reinício do equipamento e troca da fonte' },
    ],
  },
  riscos: {
    total: 1, abertos: 1, pctResolvido30d: null,
    porStatus: [{ name: 'Em monitoramento TI', value: 1 }], porAmbiente: [{ name: 'PROD', value: 1 }],
    porCID: [{ name: 'Confidencialidade', value: 1 }], porCategoriaAmeaca: [{ name: 'Humana', value: 1 }],
    porTipoAmeaca: [{ name: 'Interna', value: 1 }], porAtivoAfetado: [{ name: 'Banco de dados', value: 1 }],
    tratamentoEficaz: { sim: 0, nao: 1 },
    itens: [
      { id: 20, descricao: 'Vazamento de credenciais', ambiente: 'PROD', cid: 'Confidencialidade', categoriaAmeaca: 'Humana', tipoAmeaca: 'Interna', ativoAfetado: 'Banco de dados', status: 'Em monitoramento TI', responsavelAjuste: 'Igor', dataLimite: '2026-08-01', eficaz: 'Não', solucao: 'Rotacionar credenciais e habilitar MFA' },
    ],
  },
  naoConformidades: {
    total: 1, recorrentes: 0,
    porStatus: [{ name: 'Em análise', value: 1 }], porCausaRaiz: [{ name: 'Processo', value: 1 }],
    tratamentoEficaz: { sim: 0, nao: 1 },
    itens: [
      { id: 30, processo: 'Backup', detalhes: 'Backup não executado', causaRaiz: 'Processo', acao: 'Revisar', recorrente: false, status: 'Em análise', eficaz: 'Não', solicitante: 'Ana', criado: '2026-07-05T10:00:00Z' },
    ],
  },
  melhorias: {
    total: 1, eficazes: 1,
    porStatus: [{ name: 'Implementada', value: 1 }], porAmbiente: [{ name: 'Monitoramento', value: 1 }],
    itens: [
      { id: 40, oportunidade: 'Automatizar deploy', ambiente: 'Monitoramento', processo: 'CI/CD', beneficios: 'Menos erro', status: 'Implementada', eficaz: 'Sim', solicitante: 'Bruno' },
    ],
  },
  acessos: {
    total: 1, pendentes: 1,
    porStatus: [{ name: 'Pendente', value: 1 }], porTipo: [{ name: 'Novo', value: 1 }], porProjeto: [{ name: 'FlagHub', value: 1 }],
    acessoDevOps: { sim: 1, nao: 0 }, acessoTS: { sim: 0, nao: 1 }, permissoesAdmin: { sim: 1, nao: 0 },
    itens: [
      { id: 50, titulo: 'ACS-700', descricao: 'Acesso ao repositório', motivo: 'Onboarding', tipo: 'Novo', projeto: 'FlagHub', solicitante: 'Carla', cargo: '—', status: 'Pendente', acessoDevOps: true, acessoTS: false, permissoesAdmin: true, ultimaRevisao: '2026-07-02' },
    ],
  },
};

vi.mock('@/hooks/useBIInfra', () => ({
  useBIInfraSgsi: () => ({ data: mockData, isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { BIInfraSgsiPanel } from '@/components/infraestrutura/BIInfraSgsiPanel';

describe('BIInfraSgsiPanel — IA refatorada', () => {
  it('renderiza cabeçalho, busca global e rótulo da seção ativa', () => {
    render(<BIInfraSgsiPanel secao="mudancas" />);
    expect(screen.getByText('Gestão SG · Listas SharePoint')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Buscar OS, chamado, protocolo/i)).toBeInTheDocument();
    // rótulo da seção ativa — a troca de seção agora é pelo dropdown ▼ da aba
    expect(screen.getByText('SG-LST-010')).toBeInTheDocument();
  });

  it('coluna OS destacada aparece na tabela de mudanças', () => {
    render(<BIInfraSgsiPanel secao="mudancas" />);
    expect(screen.getByText('OS / Chamado')).toBeInTheDocument();
    expect(screen.getByText('OS-9001')).toBeInTheDocument();
  });

  it('toggle de olho alterna entre visão compacta e completa nas mudanças', () => {
    render(<BIInfraSgsiPanel secao="mudancas" />);
    // compacto (padrão): sem as colunas extras
    expect(screen.queryByText('Aprovador Gestor')).not.toBeInTheDocument();
    expect(screen.queryByText('Data solicitação')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Exibir todas as informações'));
    expect(screen.getByText('Aprovador Gestor')).toBeInTheDocument();
    expect(screen.getByText('Data solicitação')).toBeInTheDocument();
    expect(screen.getByText('Conclusão')).toBeInTheDocument();
    expect(screen.getByText('Marcos')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Exibir visão compacta'));
    expect(screen.queryByText('Aprovador Gestor')).not.toBeInTheDocument();
  });

  it('top-5 de ambientes mostra "Mostrar todos" quando há mais de 5', () => {
    render(<BIInfraSgsiPanel secao="mudancas" />);
    // 7 ambientes → oferece expandir os 2 excedentes
    expect(screen.getByText(/Mostrar todos \(\+2\)/)).toBeInTheDocument();
  });

  it('busca global filtra a tabela e mostra contagem cross-seção', () => {
    render(<BIInfraSgsiPanel secao="mudancas" />);
    const input = screen.getByPlaceholderText(/Buscar OS, chamado, protocolo/i);
    fireEvent.change(input, { target: { value: 'OS-9001' } });
    // barra de resultados cross-seção
    expect(screen.getByText(/1 resultado para/i)).toBeInTheDocument();
    // a linha que casa continua; a que não casa some
    expect(screen.getByText('OS-9001')).toBeInTheDocument();
    expect(screen.queryByText('OS-9002')).not.toBeInTheDocument();
  });

  it('clicar numa linha abre o drawer de detalhes com a OS', () => {
    render(<BIInfraSgsiPanel secao="mudancas" />);
    fireEvent.click(screen.getByText('OS-9001'));
    // Drawer (Sheet) traz a origem e a OS do registro
    expect(screen.getByText('SG-LST-010 · Mudança')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('OS-9001')).toBeInTheDocument();
  });

  it('seção acessos (semeada pelo dropdown da aba) revela a tabela de acessos', () => {
    render(<BIInfraSgsiPanel secao="acessos" />);
    expect(screen.getByText('OS / Solicitação')).toBeInTheDocument();
    expect(screen.getByText('ACS-700')).toBeInTheDocument();
  });

  it('KPI "Atualizações bem sucedidas" fica ao lado de Status, com Sim/Não e percentual', () => {
    render(<BIInfraSgsiPanel secao="mudancas" />);
    // "Status" também é cabeçalho da tabela — o título do card é o <p>
    const cardStatus = screen.getAllByText('Status').find((el) => el.tagName === 'P')!.parentElement!;
    const cardAtt = screen.getByText('Atualizações bem sucedidas').parentElement!;
    expect(cardStatus.nextElementSibling).toBe(cardAtt);
    // mock: 2 sim · 1 não · total 4 → a base é sim + não (3), não o total de mudanças
    const grupo = screen.getByRole('group', { name: 'Atualizações bem sucedidas' });
    expect(within(grupo).getByRole('button', { name: /Sim\s*67%\s*2 de 3 itens/ })).toBeInTheDocument();
    expect(within(grupo).getByRole('button', { name: /Não\s*33%\s*1 de 3 itens/ })).toBeInTheDocument();
    // o tile "Atualização" (o mesmo %, sem clique) saiu do card Status
    expect(screen.queryByText('Atualização')).not.toBeInTheDocument();
  });

  it('percentuais: "—" sem base e Não = 100 − Sim (lado a lado nunca somam 101)', () => {
    const original = mockData.mudancas.atualizacoesBemSucedidas;
    try {
      mockData.mudancas.atualizacoesBemSucedidas = { sim: 0, nao: 0 };
      const { unmount } = render(<BIInfraSgsiPanel secao="mudancas" />);
      const grupo = screen.getByRole('group', { name: 'Atualizações bem sucedidas' });
      expect(within(grupo).getByRole('button', { name: /^Sim\s*—$/ })).toBeInTheDocument();
      expect(within(grupo).getByRole('button', { name: /^Não\s*—$/ })).toBeInTheDocument();
      expect(within(grupo).queryByText(/de 0 itens/)).not.toBeInTheDocument();
      unmount();

      // base 8 com 1 sim: 12,5% e 87,5% arredondados em separado dariam 13% + 88%
      mockData.mudancas.atualizacoesBemSucedidas = { sim: 1, nao: 7 };
      render(<BIInfraSgsiPanel secao="mudancas" />);
      expect(screen.getByRole('button', { name: /Sim\s*13%\s*1 de 8 itens/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Não\s*87%\s*7 de 8 itens/ })).toBeInTheDocument();
    } finally {
      mockData.mudancas.atualizacoesBemSucedidas = original;
    }
  });

  it('clicar em Não/Sim filtra a tabela de mudanças; segundo clique desfaz', () => {
    render(<BIInfraSgsiPanel secao="mudancas" />);
    const nao = () => screen.getByRole('button', { name: /Não\s*33%/ });
    const sim = () => screen.getByRole('button', { name: /Sim\s*67%/ });
    const semFiltro = () => {
      for (const os of ['OS-9001', 'OS-9002', 'OS-9003']) expect(screen.getByText(os)).toBeInTheDocument();
      expect(screen.queryByText(/filtro do KPI ativo/)).not.toBeInTheDocument();
    };

    fireEvent.click(nao());
    expect(screen.getByText('OS-9003')).toBeInTheDocument();
    expect(screen.queryByText('OS-9001')).not.toBeInTheDocument();
    // campo vazio (mudança ainda não executada) não conta como "Não"…
    expect(screen.queryByText('OS-9002')).not.toBeInTheDocument();
    expect(screen.getByText(/filtro do KPI ativo/)).toBeInTheDocument();

    // Não → Sim troca o filtro direto
    fireEvent.click(sim());
    expect(screen.getByText('OS-9001')).toBeInTheDocument();
    expect(screen.queryByText('OS-9003')).not.toBeInTheDocument();
    // …nem como "Sim"
    expect(screen.queryByText('OS-9002')).not.toBeInTheDocument();

    fireEvent.click(sim());
    semFiltro();

    fireEvent.click(nao());
    fireEvent.click(nao());
    semFiltro();
  });

  it('visão completa e drawer mostram se a atualização foi bem sucedida', () => {
    render(<BIInfraSgsiPanel secao="mudancas" />);
    expect(screen.queryByText('Bem sucedida')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Exibir todas as informações'));
    expect(screen.getByText('Bem sucedida')).toBeInTheDocument();
    expect(within(screen.getByText('OS-9003').closest('tr')!).getByText('Não')).toBeInTheDocument();
    expect(within(screen.getByText('OS-9001').closest('tr')!).getByText('Sim')).toBeInTheDocument();
    fireEvent.click(screen.getByText('OS-9003'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Atualização bem sucedida')).toBeInTheDocument();
    expect(within(dialog).getByText('Não')).toBeInTheDocument();
  });

  it('trocar de seção limpa o drill de atualizações', () => {
    const { rerender } = render(<BIInfraSgsiPanel secao="mudancas" />);
    fireEvent.click(screen.getByRole('button', { name: /Não\s*33%/ }));
    expect(screen.queryByText('OS-9001')).not.toBeInTheDocument();
    rerender(<BIInfraSgsiPanel secao="acessos" />);
    expect(screen.queryByText(/filtro do KPI ativo/)).not.toBeInTheDocument();
    rerender(<BIInfraSgsiPanel secao="mudancas" />);
    expect(screen.getByText('OS-9001')).toBeInTheDocument();
    expect(screen.queryByText(/filtro do KPI ativo/)).not.toBeInTheDocument();
  });

  // Consulta por role num DOM de 350 linhas leva segundos no jsdom (estourava o
  // timeout de 5s) — aqui conta-se <tr> direto e o botão é achado pelo texto.
  it('tabela monta até 300 linhas e libera o resto em "Mostrar mais" (contagem usa a lista toda)', () => {
    const original = mockData.mudancas.itens;
    try {
      mockData.mudancas.itens = Array.from({ length: 350 }, (_, k) => ({
        ...original[2], id: 1000 + k, chamado: `OS-${1000 + k}`,
      }));
      const { container } = render(<BIInfraSgsiPanel secao="mudancas" />);
      const linhas = () => container.querySelectorAll('tbody tr').length;
      expect(screen.getByText(/350 itens · exibindo 300/)).toBeInTheDocument();
      expect(linhas()).toBe(300);
      fireEvent.click(screen.getByText('Mostrar mais (+50)'));
      expect(linhas()).toBe(350);
      expect(screen.queryByText(/Mostrar mais/)).not.toBeInTheDocument();
      expect(screen.getByText('350 itens · clique para detalhes')).toBeInTheDocument();
    } finally {
      mockData.mudancas.itens = original;
    }
  }, 15_000);

  it('filtro "Não" traz a coluna Justificativa já na visão compacta', () => {
    render(<BIInfraSgsiPanel secao="mudancas" />);
    // sem filtro, a compacta segue sem a coluna
    expect(screen.queryByText('Justificativa')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Não\s*33%/ }));
    expect(screen.getByText('Justificativa')).toBeInTheDocument();
    const linha = screen.getByText('OS-9003').closest('tr')!;
    expect(within(linha).getByText('Timeout no deploy; rollback aplicado')).toBeInTheDocument();
    // no filtro "Sim" a coluna sai
    fireEvent.click(screen.getByRole('button', { name: /Sim\s*67%/ }));
    expect(screen.queryByText('Justificativa')).not.toBeInTheDocument();
  });

  it('visão completa e drawer mostram a justificativa', () => {
    render(<BIInfraSgsiPanel secao="mudancas" />);
    fireEvent.click(screen.getByLabelText('Exibir todas as informações'));
    expect(screen.getByText('Justificativa')).toBeInTheDocument();
    fireEvent.click(screen.getByText('OS-9003'));
    const dialog = screen.getByRole('dialog');
    // "Justificativa" também é cabeçalho da tabela — o rótulo do drawer fica no dialog
    expect(within(dialog).getByText('Justificativa')).toBeInTheDocument();
    expect(within(dialog).getByText('Timeout no deploy; rollback aplicado')).toBeInTheDocument();
  });

  it('busca global encontra a mudança pelo texto da justificativa e realça o trecho', () => {
    render(<BIInfraSgsiPanel secao="mudancas" />);
    fireEvent.change(screen.getByPlaceholderText(/Buscar OS, chamado, protocolo/i), { target: { value: 'rollback' } });
    expect(screen.getByText(/1 resultado para/i)).toBeInTheDocument();
    expect(screen.getByText('OS-9003')).toBeInTheDocument();
    expect(screen.queryByText('OS-9001')).not.toBeInTheDocument();
    // com o filtro "Não" a coluna aparece e o trecho buscado vem marcado
    fireEvent.click(screen.getByRole('button', { name: /Não\s*33%/ }));
    const linha = screen.getByText('OS-9003').closest('tr')!;
    expect(within(linha).getByText('rollback').tagName).toBe('MARK');
  });

  it('filtro "Não" + visão completa não duplica a coluna Justificativa', () => {
    const { container } = render(<BIInfraSgsiPanel secao="mudancas" />);
    fireEvent.click(screen.getByRole('button', { name: /Não\s*33%/ }));
    fireEvent.click(screen.getByLabelText('Exibir todas as informações'));
    const cabecalhos = Array.from(container.querySelectorAll('thead th'), (th) => th.textContent);
    expect(cabecalhos.filter((t) => t === 'Justificativa')).toHaveLength(1);
    // na completa ela fica ao lado de "Bem sucedida"
    expect(cabecalhos[cabecalhos.indexOf('Bem sucedida') + 1]).toBe('Justificativa');
  });
});
