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
    eficaciaCobertura: { elegiveis: 1, respondidos: 1, emTratamento: 1, proximoLimite: '2026-08-01' },
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
    total: 6, pendentes: 1,
    porStatus: [{ name: 'Pendente', value: 1 }], porTipo: [{ name: 'Novo', value: 1 }], porProjeto: [{ name: 'FlagHub', value: 1 }],
    acessoDevOps: { sim: 1, nao: 0 }, acessoTS: { sim: 0, nao: 1 }, permissoesAdmin: { sim: 1, nao: 0 },
    // coerente com os itens abaixo: 3 revisados (1 sem data) e 3 a revisar; 2 definitivos e
    // 4 provisórios (com evidência, sem evidência, no prazo e rejeitado = não se aplica)
    revisados: 3, aRevisar: 3, revisadosSemData: 1,
    definitivos: 2, provisorios: 4, provisoriosComEvidencia: 1, provisoriosNoPrazo: 1, provisoriosSemEvidencia: 1, provisoriosNaoAplica: 1,
    porCategoria: [{ name: 'Acesso a servidor', value: 2 }, { name: 'Banco de dados', value: 2 }, { name: 'Acesso pastas', value: 1 }, { name: 'Acesso VPN', value: 1 }],
    semCategoria: 1,
    itens: [
      { id: 50, titulo: 'ACS-700', descricao: 'Acesso ao repositório', motivo: 'Onboarding', tipo: 'Novo', projeto: 'FlagHub', solicitante: 'Carla', aprovadorTI: 'Otávio', aprovadorGestor: 'Marta', cargo: '—', status: 'Pendente', acessoDevOps: true, acessoTS: false, permissoesAdmin: true, ultimaRevisao: '2026-07-02', link: 'https://flagcom.sharepoint.com/sites/PORTALSGSI/Lists/SGLST014/DispForm.aspx?ID=50', revisaoTI: 'Acesso Revisado', revisadoSemData: false, tipoLiberacao: 'Definitiva', fimLiberacao: '', evidenciaRevogacao: null, categorias: [], categoriasLista: [] },
      { id: 51, titulo: 'ACS-701', descricao: 'Banco de produção', motivo: 'Suporte', tipo: 'Novas permissões', projeto: 'Heineken', solicitante: 'Bruna', aprovadorTI: 'Paulo', aprovadorGestor: 'Rita', cargo: '—', status: 'Revogado', acessoDevOps: false, acessoTS: false, permissoesAdmin: false, ultimaRevisao: '2026-07-05T12:00:00Z', link: '', revisaoTI: 'Acesso Revisado', revisadoSemData: false, tipoLiberacao: 'Provisória', fimLiberacao: '2026-07-04T00:00:00Z', evidenciaRevogacao: 'Com evidência', categorias: ['Banco de dados'], categoriasLista: ['Banco de dados'] },
      { id: 52, titulo: 'ACS-702', descricao: 'Servidor de homologação', motivo: 'Teste', tipo: 'Novas permissões', projeto: 'Nespresso', solicitante: 'Caio', aprovadorTI: 'Paulo', aprovadorGestor: 'Rita', cargo: '—', status: 'Realizado', acessoDevOps: false, acessoTS: false, permissoesAdmin: false, ultimaRevisao: '2026-06-20T12:00:00Z', link: '', revisaoTI: 'A revisar', revisadoSemData: false, tipoLiberacao: 'Provisória', fimLiberacao: '2026-06-30T00:00:00Z', evidenciaRevogacao: 'Sem evidência', categorias: ['Banco de dados', 'Acesso a servidor'], categoriasLista: ['Banco de dados', 'Acesso a servidor'] },
      { id: 53, titulo: 'ACS-703', descricao: 'Pasta financeira', motivo: 'Rotina', tipo: 'Novas permissões', projeto: 'VDesk', solicitante: 'Dora', aprovadorTI: 'Paulo', aprovadorGestor: 'Rita', cargo: '—', status: 'Realizado', acessoDevOps: false, acessoTS: false, permissoesAdmin: false, ultimaRevisao: '', link: '', revisaoTI: 'Acesso Revisado', revisadoSemData: true, tipoLiberacao: 'Definitiva', fimLiberacao: '', evidenciaRevogacao: null, categorias: ['Acesso pastas'], categoriasLista: ['Acesso Pastas'] },
      { id: 54, titulo: 'ACS-704', descricao: 'VPN do cliente', motivo: 'Projeto', tipo: 'Novas permissões', projeto: 'SuiteFlexx', solicitante: 'Enzo', aprovadorTI: 'Paulo', aprovadorGestor: 'Rita', cargo: '—', status: 'Aprovado', acessoDevOps: false, acessoTS: false, permissoesAdmin: false, ultimaRevisao: '', link: '', revisaoTI: 'A revisar', revisadoSemData: false, tipoLiberacao: 'Provisória', fimLiberacao: '2026-12-31T00:00:00Z', evidenciaRevogacao: 'No prazo', categorias: ['Acesso VPN'], categoriasLista: ['Vpn IBM Cloud'] },
      { id: 55, titulo: 'ACS-705', descricao: 'Servidor de testes', motivo: 'Teste de carga', tipo: 'Novas permissões', projeto: 'Heineken', solicitante: 'Fábio', aprovadorTI: 'Paulo', aprovadorGestor: 'Rita', cargo: '—', status: 'Rejeitado', acessoDevOps: false, acessoTS: false, permissoesAdmin: false, ultimaRevisao: '2026-06-02T12:00:00Z', link: '', revisaoTI: 'A revisar', revisadoSemData: false, tipoLiberacao: 'Provisória', fimLiberacao: '2026-06-15T00:00:00Z', evidenciaRevogacao: 'Não se aplica', categorias: ['Acesso a servidor'], categoriasLista: ['Acesso Servidor'] },
    ],
  },
};

// Argumentos de cada chamada do hook: o painel decide se Acessos é recortado.
const mockChamadasHook: unknown[][] = [];
vi.mock('@/hooks/useBIInfra', () => ({
  useBIInfraSgsi: (...args: unknown[]) => {
    mockChamadasHook.push(args);
    return { data: mockData, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

import { BIInfraSgsiPanel } from '@/components/infraestrutura/BIInfraSgsiPanel';

describe('BIInfraSgsiPanel — IA refatorada', () => {
  // Grid analítico: funil por coluna (filtro multi-valor) + ordenação A→Z.
  it('grid: o funil filtra a coluna e "A a Z" ordena o que sobrou', () => {
    const original = { ...mockData.riscos };
    const risco = (id: number, descricao: string, status: string, responsavel: string) => ({
      id, descricao, ambiente: 'PROD', cid: 'Confidencialidade', categoriaAmeaca: 'Humana',
      tipoAmeaca: 'Interna', ativoAfetado: 'Dados', status, responsavelAjuste: responsavel,
      dataLimite: '', eficaz: '—', solucao: '—',
    });
    Object.assign(mockData.riscos, {
      itens: [risco(10, 'Charlie', 'Encerrado', 'Ana'), risco(9, 'Alfa', 'Rejeitado', 'Bruno'), risco(2, 'Bravo', 'Encerrado', 'Ana')],
    });
    try {
      const { container } = render(<BIInfraSgsiPanel secao="riscos" />);
      const corpo = () => [...container.querySelectorAll('tbody tr')];
      const primeiroRisco = () => corpo()[0].querySelectorAll('td')[1].textContent;
      expect(corpo()).toHaveLength(3);

      // ── funil: desmarcar "Rejeitado" na coluna Status tira a linha da Alfa
      fireEvent.click(screen.getByLabelText('Ordenar e filtrar por Status'));
      fireEvent.click(within(screen.getByRole('dialog')).getByText('Rejeitado'));
      expect(corpo()).toHaveLength(2);
      expect(corpo().map((tr) => tr.querySelectorAll('td')[1].textContent)).toEqual(['Charlie', 'Bravo']);

      // ── ordenação: A→Z na coluna Risco reordena o conjunto JÁ filtrado
      fireEvent.click(screen.getByLabelText('Ordenar e filtrar por Risco'));
      fireEvent.click(within(screen.getByRole('dialog')).getByText('Ordenar de A a Z'));
      expect(primeiroRisco()).toBe('Bravo');
      expect(corpo()).toHaveLength(2); // ordenar não desfaz o filtro

      // ── o cabeçalho confessa o recorte e oferece desfazer
      fireEvent.click(screen.getByText(/limpar 1 filtro/));
      expect(corpo()).toHaveLength(3);
      expect(primeiroRisco()).toBe('Alfa'); // ordenação A→Z sobrevive à limpeza

      // ── identificador também tem funil (a ordenação mora nele), e a ordem é
      //    NUMÉRICA: #2, #9, #10 — a lexicográfica daria #10, #2, #9.
      //    Último dialog = o menu aberto por último (o portal anexa ao fim do body).
      fireEvent.click(screen.getByLabelText('Ordenar e filtrar por ID'));
      const menus = screen.getAllByRole('dialog');
      fireEvent.click(within(menus[menus.length - 1]).getByText('Ordenar de A a Z'));
      expect(corpo().map((tr) => tr.querySelectorAll('td')[0].textContent)).toEqual(['#2', '#9', '#10']);
    } finally {
      Object.assign(mockData.riscos, original);
    }
  });

  // Auditoria (16/09/2026): três coisas que o auditor procura e o card escondia
  // — por qual campo de data a conta foi feita, contra que meta, e quantos
  // DEVERIAM ter respondido a eficácia. Os números espelham a SG-LST-012 de
  // produção: 12 no recorte, 8 encerrados, 4 avaliados, 2 ainda em tratamento.
  it('riscos: o card declara filtro, meta e cobertura da avaliação', () => {
    const original = { ...mockData.riscos };
    Object.assign(mockData.riscos, {
      total: 12,
      abertos: 2,
      tratamentoEficaz: { sim: 4, nao: 0 },
      eficaciaCobertura: { elegiveis: 8, respondidos: 4, emTratamento: 2, proximoLimite: '2026-10-10' },
    });
    try {
      render(<BIInfraSgsiPanel secao="riscos" dateFrom={new Date(2025, 8, 15)} dateTo={new Date(2026, 8, 15)} />);

      // 1. o critério de data — no próprio card e ao lado do título da seção
      expect(screen.getByText('SG-LST-012 · criados de 15/09/25 a 15/09/26')).toBeInTheDocument();
      expect(screen.getByText(/recorte por data de CRIAÇÃO/)).toBeInTheDocument();
      expect(screen.getByText(/reproduza filtrando .Criado. na SG-LST-012/)).toBeInTheDocument();

      // 2. a régua: meta no rótulo + selo de conformidade
      expect(screen.getByText(/Plano de tratamento eficaz · meta ≥ 80%/)).toBeInTheDocument();
      expect(screen.getByText('✓ conforme')).toBeInTheDocument();

      // 3. o denominador aberto: 4 de 8 encerrados, e os 2 em tratamento COM prazo
      expect(screen.getByText('4 de 8')).toBeInTheDocument();
      expect(screen.getByText(/encerrados avaliados · 50%/)).toBeInTheDocument();
      expect(screen.getByText(/2 em tratamento, fora do cálculo — prazo em aberto · limite 10\/10\/26/)).toBeInTheDocument();
    } finally {
      Object.assign(mockData.riscos, original);
    }
  });

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

  it('acessos: tabela e drawer mostram solicitante, aprovações TI/Gestor e o link do SharePoint', () => {
    const LINK = 'https://flagcom.sharepoint.com/sites/PORTALSGSI/Lists/SGLST014/DispForm.aspx?ID=50';
    render(<BIInfraSgsiPanel secao="acessos" />);
    for (const cabecalho of ['Solicitante', 'Aprovação TI', 'Aprovação Gestor', 'SharePoint']) {
      expect(screen.getByText(cabecalho)).toBeInTheDocument();
    }
    const linha = screen.getByText('ACS-700').closest('tr')!;
    for (const nome of ['Carla', 'Otávio', 'Marta']) expect(within(linha).getByText(nome)).toBeInTheDocument();
    const link = within(linha).getByRole('link', { name: 'Abrir' });
    expect(link).toHaveAttribute('href', LINK);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(screen.getByText('ACS-700'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Aprovação TI')).toBeInTheDocument();
    expect(within(dialog).getByText('Otávio')).toBeInTheDocument();
    expect(within(dialog).getByText('Marta')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Abrir item na lista' })).toHaveAttribute('href', LINK);
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

  // Linhas da tabela de acessos visíveis agora (mock com ACS-700 a ACS-705).
  const visiveis = () => ['ACS-700', 'ACS-701', 'ACS-702', 'ACS-703', 'ACS-704', 'ACS-705'].filter((os) => screen.queryByText(os));

  it('acessos: cards de Revisão TI e de liberação com contagem e percentual', () => {
    render(<BIInfraSgsiPanel secao="acessos" />);
    const revisao = screen.getByRole('group', { name: 'Revisão TI' });
    // A revisar = 100 − revisados: lado a lado nunca somam 101%
    expect(within(revisao).getByRole('button', { name: /Acesso revisado\s*3\s*50% do total/ })).toBeInTheDocument();
    expect(within(revisao).getByRole('button', { name: /A revisar\s*3\s*50% do total/ })).toBeInTheDocument();
    expect(within(revisao).getByRole('button', { name: /Revisado sem data\s*1/ })).toBeInTheDocument();
    const liberacao = screen.getByRole('group', { name: 'Liberação · evidência de revogação' });
    expect(within(liberacao).getByRole('button', { name: /Definitivos\s*2\s*33% do total/ })).toBeInTheDocument();
    // % sobre os que já exigiam revogação (com + sem evidência) = 1 de 2. Sobre o total
    // daria 25%; descontando só os não liberados, 33%.
    expect(within(liberacao).getByRole('button', { name: /Provisórios\s*4\s*50% com evidência/ })).toBeInTheDocument();
    expect(within(liberacao).getByRole('button', { name: /Sem evidência\s*1\s*1 no prazo · 1 não liberados/ })).toBeInTheDocument();
  });

  it('acessos: sem período a seção avisa que mostra a base completa', () => {
    render(<BIInfraSgsiPanel secao="acessos" />);
    expect(screen.getByText('· base completa')).toBeInTheDocument();
  });

  it('acessos: com a sprint a seção usa a base completa e aponta o calendário', () => {
    mockChamadasHook.length = 0;
    render(<BIInfraSgsiPanel secao="acessos" dateFrom={new Date(2026, 6, 1)} dateTo={new Date(2026, 6, 10)} />);
    expect(screen.getByText(/base completa — a sprint não recorta os acessos; use o calendário/i)).toBeInTheDocument();
    expect(mockChamadasHook.length).toBeGreaterThan(0);
    expect(mockChamadasHook.every((args) => args[2] === false)).toBe(true);
  });

  it('acessos: com o calendário a seção mostra os vigentes do período e pede o recorte ao hook', () => {
    mockChamadasHook.length = 0;
    render(<BIInfraSgsiPanel secao="acessos" dateFrom={new Date(2026, 6, 1)} dateTo={new Date(2026, 6, 10)} periodoDoCalendario />);
    expect(screen.getByText(/vigentes de 01\/07\/26 a 10\/07\/26/)).toBeInTheDocument();
    expect(screen.queryByText(/base completa/i)).not.toBeInTheDocument();
    expect(mockChamadasHook.length).toBeGreaterThan(0);
    expect(mockChamadasHook.every((args) => args[2] === true)).toBe(true);
  });

  it('período do calendário sem atividade SG sugere trocar o período (a sprint já está em "Todas as Sprints")', () => {
    const totalOriginal = mockData.totalItens;
    try {
      mockData.totalItens = 0;
      render(<BIInfraSgsiPanel secao="mudancas" dateFrom={new Date(2026, 6, 1)} dateTo={new Date(2026, 6, 10)} periodoDoCalendario />);
      expect(screen.getByText(/Nenhuma atividade SG de 01\/07\/26 a 10\/07\/26 \(12 itens no histórico\)\. Escolha outro período no calendário/)).toBeInTheDocument();
      expect(screen.queryByText(/Selecione "Todas as Sprints"/)).not.toBeInTheDocument();
    } finally {
      mockData.totalItens = totalOriginal;
    }
  });

  it('acessos: barra "Tipo de acesso" lista as categorias, filtra a tabela e marca o filtro ativo', () => {
    render(<BIInfraSgsiPanel secao="acessos" />);
    // substituiu a barra "Acesso DevOps / Acesso TS"
    expect(screen.queryByText('Acesso DevOps')).not.toBeInTheDocument();
    const barra = screen.getByRole('group', { name: 'Tipo de acesso' });
    expect(within(barra).getByRole('button', { name: /Acesso a servidor\s*2/ })).toBeInTheDocument();
    expect(within(barra).getByRole('button', { name: /Banco de dados\s*2/ })).toBeInTheDocument();
    expect(within(barra).getByRole('button', { name: /Acesso VPN\s*1/ })).toBeInTheDocument();
    expect(within(barra).getByRole('button', { name: /Sem categoria\s*1/ })).toBeInTheDocument();
    fireEvent.click(within(barra).getByRole('button', { name: /Banco de dados/ }));
    expect(visiveis()).toEqual(['ACS-701', 'ACS-702']);
    expect(within(barra).getByRole('button', { name: /Banco de dados/, pressed: true })).toBeInTheDocument();
    fireEvent.click(within(barra).getByRole('button', { name: /Sem categoria/ }));
    expect(visiveis()).toEqual(['ACS-700']);
    fireEvent.click(within(barra).getByRole('button', { name: /Sem categoria/ }));
    expect(visiveis()).toHaveLength(6);
  });

  it('acessos: clicar nos cards filtra a tabela com os mesmos critérios das contagens', () => {
    render(<BIInfraSgsiPanel secao="acessos" />);
    const clica = (nome: RegExp) => fireEvent.click(screen.getByRole('button', { name: nome }));
    clica(/A revisar\s*3/);
    expect(visiveis()).toEqual(['ACS-702', 'ACS-704', 'ACS-705']);
    // o rejeitado não entra em "Sem evidência": nunca liberou acesso
    clica(/Sem evidência\s*1/);
    expect(visiveis()).toEqual(['ACS-702']);
    clica(/Revisado sem data/);
    expect(visiveis()).toEqual(['ACS-703']);
    clica(/Acesso revisado\s*3/);
    expect(visiveis()).toEqual(['ACS-700', 'ACS-701', 'ACS-703']);
    clica(/Definitivos\s*2/);
    expect(visiveis()).toEqual(['ACS-700', 'ACS-703']);
    clica(/Provisórios\s*4/);
    expect(visiveis()).toEqual(['ACS-701', 'ACS-702', 'ACS-704', 'ACS-705']);
    clica(/Provisórios\s*4/);
    expect(visiveis()).toHaveLength(6);
  });

  it('acessos: tabela mostra liberação e revisão TI; drawer traz o fim da liberação e a categoria da lista', () => {
    render(<BIInfraSgsiPanel secao="acessos" />);
    for (const cabecalho of ['Liberação', 'Revisão TI']) {
      // `closest('th')` e não `tagName`: o texto do cabeçalho vive num <span>
      // dentro do <th>, ao lado do funil de ordenar/filtrar da coluna.
      expect(screen.getAllByText(cabecalho).some((el) => el.closest('th') !== null)).toBe(true);
    }
    const linha = (os: string) => screen.getByText(os).closest('tr')!;
    expect(within(linha('ACS-701')).getByText('Com evidência')).toBeInTheDocument();
    expect(within(linha('ACS-701')).getByText('Acesso Revisado')).toBeInTheDocument();
    expect(within(linha('ACS-702')).getByText('Sem evidência')).toBeInTheDocument();
    expect(within(linha('ACS-702')).getByText('A revisar')).toBeInTheDocument();
    expect(within(linha('ACS-705')).getByText('Não se aplica')).toBeInTheDocument();
    // marcado sem data: o badge avisa e a coluna da data também
    expect(within(linha('ACS-703')).getByText('Revisado sem data')).toBeInTheDocument();
    expect(within(linha('ACS-703')).getByText('sem data')).toBeInTheDocument();
    fireEvent.click(screen.getByText('ACS-704'));
    const dialog = screen.getByRole('dialog');
    // "2026-12-31T00:00:00Z" é dia de calendário: 31/12 em qualquer fuso
    expect(within(dialog).getByText('31/12/26')).toBeInTheDocument();
    expect(within(dialog).getByText('No prazo')).toBeInTheDocument();
    expect(within(dialog).getByText('Acesso VPN')).toBeInTheDocument();
    expect(within(dialog).getByText('Vpn IBM Cloud')).toBeInTheDocument();
  });

  it('acessos: a busca acha o que a tela mostra — "sem data" e o texto original da categoria', () => {
    render(<BIInfraSgsiPanel secao="acessos" />);
    const busca = screen.getByPlaceholderText(/Buscar OS, chamado, protocolo/i);
    fireEvent.change(busca, { target: { value: 'sem data' } });
    expect(visiveis()).toEqual(['ACS-703']);
    fireEvent.change(busca, { target: { value: 'IBM' } });
    expect(visiveis()).toEqual(['ACS-704']);
  });
});
