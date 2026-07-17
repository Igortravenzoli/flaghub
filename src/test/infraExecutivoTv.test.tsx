import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { BIInfraSgsiResponse } from '@/hooks/useBIInfra';

// Reproduz os bugs do modo TV reportados em 17/07:
//  1. "último: 09/10 · FlagCloud" — incidente de 2023 com data em TEXTO LIVRE
//     ("Dia: 09/10/2023 - 06h27") ganhava de datas ISO na ordenação por string.
//  2. Descritivos (texto do incidente / solução) sumindo do card.
//  3. Card "Gestão de Mudanças" precisa existir no modo TV.

const ontem = new Date(Date.now() - 86400000);
const ontemIso = ontem.toISOString();
const ontemLabel = ontem.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

const vazioNV = { sim: 0, nao: 0 };

const mockSgsi: BIInfraSgsiResponse = {
  success: true,
  message: 'mock',
  atualizadoEm: ontemIso,
  totalItens: 5,
  totalItensBase: 5,
  diasSem: { incidentes: 1, riscos: 141, naoConformidades: 10, attMalSucedidas: 3 },
  mudancas: {
    total: 3, concluidos: 2, pendentes: 1, aguardandoGestor: 1, aguardandoTI: 0,
    porStatus: [], porAmbiente: [], porRisco: [], porCategoria: [],
    atualizacoesBemSucedidas: vazioNV, validacaoTestes: vazioNV,
    itens: [
      { id: 1, chamado: '770188', ambiente: 'Froneri', tipoMudanca: 'Padrão', categoria: 'Infra', motivo: 'Ajuste CNPJs inativos', status: 'Realizado', solicitante: 'Ana', aprovadorTI: 'Rodolfo', aprovadorGestor: 'Marcos', risco: 'Médio', criado: ontemIso, conclusao: '', modificado: ontemIso },
      { id: 2, chamado: '769846', ambiente: 'Staging Área PROD', tipoMudanca: 'Padrão', categoria: 'Infra', motivo: 'Liberar envio de estoque', status: 'Aprovado', solicitante: 'Bruno', aprovadorTI: '—', aprovadorGestor: '—', risco: 'Baixo', criado: ontemIso, conclusao: '', modificado: ontemIso },
    ],
  },
  incidentes: {
    total: 2, ativos: 0, contornados: 0, resolvidos: 2, pctDentroSla: 98,
    porSLA: [], porCategoria: [],
    itens: [
      // Antigo (2023) com data em texto livre — NÃO pode ser o "último".
      { id: 10, titulo: 'FlagCloud', ativo: 'Servidor', motivo: 'Falha', priorizacao: 'Alta', protocolo: 'INC-1', status: 'Resolvido', tipo: 'Infra', sla: 'Sim', categoria: 'Cloud', downtimeHoras: 1, inicio: 'Dia: 09/10/2023 - 06h27', descricao: 'Queda do ambiente FlagCloud', solucao: 'Reinício do cluster' },
      // Ontem, ISO — este é o último e é recente (30d).
      { id: 11, titulo: 'Inc Broker', ativo: 'Broker', motivo: 'Fila travada', priorizacao: 'Alta', protocolo: 'INC-2', status: 'Resolvido', tipo: 'Infra', sla: 'Sim', categoria: 'Broker', downtimeHoras: 0.5, inicio: ontemIso, descricao: 'Fila de integração travada no Broker', solucao: 'Reprocessamento da fila e ajuste do job' },
    ],
  },
  riscos: {
    total: 59, abertos: 2, pctResolvido30d: 9,
    porStatus: [], porAmbiente: [], porCID: [], porCategoriaAmeaca: [], porTipoAmeaca: [], porAtivoAfetado: [],
    tratamentoEficaz: vazioNV,
    itens: [
      { id: 20, descricao: 'Emails falsos (eng. social)', ambiente: 'Corp', cid: 'Confidencialidade', categoriaAmeaca: 'Humana', tipoAmeaca: 'Externa', ativoAfetado: 'Pessoas', status: 'Em monitoramento TI', responsavelAjuste: 'Igor', dataLimite: '', eficaz: '—', solucao: 'Campanha de conscientização e bloqueio de domínios' },
    ],
  },
  naoConformidades: { total: 0, recorrentes: 0, porStatus: [], porCausaRaiz: [], tratamentoEficaz: vazioNV, itens: [] },
  melhorias: { total: 0, eficazes: 0, porStatus: [], porAmbiente: [], itens: [] },
  acessos: { total: 0, pendentes: 0, porStatus: [], porTipo: [], porProjeto: [], acessoDevOps: vazioNV, acessoTS: vazioNV, permissoesAdmin: vazioNV, itens: [] },
};

vi.mock('@/hooks/useBIInfra', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useBIInfra')>()),
  useBIInfraSgsi: () => ({ data: mockSgsi, isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/useDevopsCobertura', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useDevopsCobertura')>()),
  useDevopsRepos: () => ({ data: [], isLoading: false }),
}));

import { InfraExecutivoTab } from '@/components/infraestrutura/InfraExecutivoTab';

const kpis = {
  total: 10, concluidos: 5, emAndamento: 3, pendentes: 2,
  melhorias: 1, iso27001: 1, sprintMigracoes: 0, transbordo: 0,
  doneBySprint: [],
  riscoItens: [{ id: 16164, title: 'Emails Falsos Engenharia Social', state: 'To Do' }],
  isLoading: false,
};

describe('InfraExecutivoTab — modo TV (layout aprovado)', () => {
  it('"último" usa a data PARSEADA — incidente de ontem ganha do texto livre de 2023', () => {
    render(<InfraExecutivoTab kpis={kpis} tvMode periodLabel="S14-2026" />);
    expect(screen.getByText(new RegExp(`último: ${ontemLabel} · Inc Broker`))).toBeInTheDocument();
    expect(screen.queryByText(/último: 09\/10/)).not.toBeInTheDocument();
  });

  it('exibe texto do incidente e solução no card de incidentes', () => {
    render(<InfraExecutivoTab kpis={kpis} tvMode />);
    expect(screen.getByText('Fila de integração travada no Broker')).toBeInTheDocument();
    expect(screen.getByText(/Reprocessamento da fila/)).toBeInTheDocument();
  });

  it('exibe solução no card de riscos e a quebra SG + DevOps', () => {
    render(<InfraExecutivoTab kpis={kpis} tvMode />);
    expect(screen.getByText(/Campanha de conscientização/)).toBeInTheDocument();
    expect(screen.getByText(/1 SG \+ 1 DevOps/)).toBeInTheDocument();
  });

  it('renderiza o card Gestão de Mudanças com KPIs e amostra no TV', () => {
    render(<InfraExecutivoTab kpis={kpis} tvMode periodLabel="S14-2026" />);
    expect(screen.getByText('Gestão de Mudanças · S14-2026')).toBeInTheDocument();
    expect(screen.getByText('770188')).toBeInTheDocument();
    expect(screen.getByText('Rejeitadas')).toBeInTheDocument();
  });
});
