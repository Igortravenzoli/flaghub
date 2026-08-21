import { fireEvent, render, screen } from '@testing-library/react';
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
const doisDiasIso = new Date(Date.now() - 2 * 86400000).toISOString();
const tresDiasIso = new Date(Date.now() - 3 * 86400000).toISOString();

const vazioNV = { sim: 0, nao: 0 };

const mockSgsi: BIInfraSgsiResponse = {
  success: true,
  message: 'mock',
  atualizadoEm: ontemIso,
  totalItens: 5,
  totalItensBase: 5,
  // maiorIntervaloIncidentes empata com a sequência atual (1) → "recorde atual".
  diasSem: { incidentes: 1, riscos: 141, naoConformidades: 10, attMalSucedidas: 3, maiorIntervaloIncidentes: 1, maiorIntervaloRiscos: 141 },
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
    total: 4, ativos: 0, contornados: 0, resolvidos: 4, pctDentroSla: 98,
    porSLA: [], porCategoria: [],
    itens: [
      // Antigo (2023) com data em texto livre — NÃO pode ser o "último".
      { id: 10, titulo: 'FlagCloud', ativo: 'Servidor', motivo: 'Falha', priorizacao: 'Alta', protocolo: 'INC-1', status: 'Resolvido', tipo: 'Infra', sla: 'Sim', categoria: 'Cloud', downtimeHoras: 1, inicio: 'Dia: 09/10/2023 - 06h27', produto: 'FlagCloud', descricao: 'Queda do ambiente FlagCloud', solucao: 'Reinício do cluster' },
      // Ontem, ISO — este é o último e é recente (30d).
      { id: 11, titulo: 'Inc Broker', ativo: 'Broker', motivo: 'Fila travada', priorizacao: 'Alta', protocolo: 'INC-2', status: 'Resolvido', tipo: 'Infra', sla: 'Sim', categoria: 'Broker', downtimeHoras: 0.5, inicio: ontemIso, produto: 'ConnectMerchan', descricao: 'Fila de integração travada no Broker', solucao: 'Reprocessamento da fila e ajuste do job' },
      // 12/03 em pt-BR = 12 de março (o parser nativo leria 3 de dezembro,
      // futuro, e este item roubaria o "último").
      { id: 12, titulo: 'Ambiente FlexxPromo', ativo: 'Promo', motivo: 'Config', priorizacao: 'Média', protocolo: 'INC-3', status: 'Resolvido', tipo: 'Infra', sla: 'Sim', categoria: 'Promo', downtimeHoras: 0, inicio: '12/03/2026 as 10:00', produto: '—', descricao: '—', solucao: '—' },
      // Mais 2 recentes → 3 nos últimos 30d; o TV mostra 2 e o 3º vira "+1".
      { id: 13, titulo: 'Inc Firewall', ativo: 'Rede', motivo: 'Regra', priorizacao: 'Média', protocolo: 'INC-4', status: 'Resolvido', tipo: 'Infra', sla: 'Sim', categoria: 'Rede', downtimeHoras: 0, inicio: doisDiasIso, produto: '—', descricao: 'Regra de firewall bloqueou a integração', solucao: 'Ajuste da regra' },
      { id: 14, titulo: 'Inc VPN', ativo: 'Rede', motivo: 'Queda', priorizacao: 'Baixa', protocolo: 'INC-5', status: 'Resolvido', tipo: 'Infra', sla: 'Sim', categoria: 'Rede', downtimeHoras: 0, inicio: tresDiasIso, produto: '—', descricao: 'Queda pontual da VPN', solucao: 'Reinício do túnel' },
    ],
  },
  riscos: {
    total: 59, abertos: 2, pctResolvido30d: 9,
    porStatus: [], porAmbiente: [], porCID: [], porCategoriaAmeaca: [], porTipoAmeaca: [], porAtivoAfetado: [],
    tratamentoEficaz: vazioNV,
    itens: [
      { id: 20, descricao: 'Emails falsos (eng. social)', ambiente: 'Corp', cid: 'Confidencialidade', categoriaAmeaca: 'Humana', tipoAmeaca: 'Externa', ativoAfetado: 'Pessoas', status: 'Em monitoramento TI', responsavelAjuste: 'Igor', dataLimite: '', eficaz: '—', solucao: 'Campanha de conscientização e bloqueio de domínios' },
      // Descrição LONGA sem solução: expansível pelo comprimento (21/08) — o
      // clique solta o título truncado em várias linhas.
      { id: 21, descricao: 'Acesso indevido a diretórios compartilhados sem revisão periódica de permissões', ambiente: 'Corp', cid: 'Confidencialidade', categoriaAmeaca: 'Humana', tipoAmeaca: 'Interna', ativoAfetado: 'Dados', status: 'Plano de Tratamento Definido', responsavelAjuste: '—', dataLimite: '', eficaz: '—', solucao: '—' },
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

// Repos com pipelines criadas AGORA (sempre dentro do trimestre corrente):
// 2 projetos, 3 pipelines — base do par "projetos × pipelines" e do
// agrupamento por projeto no card Meta · Pipelines (pedido 21/08).
const { repoTv } = vi.hoisted(() => ({
  repoTv: (projeto: string, nome: string, nPipelines: number) => ({
    id: nome, project_id: 'p1', project_name: projeto, name: nome,
    default_branch: 'main', size_bytes: 0, web_url: null, is_disabled: false,
    last_commit_date: null, pipeline_count: nPipelines, active_pipeline_count: nPipelines,
    release_count: 0, aplicavel: true, classificacao_obs: null, classificado_em: null,
    synced_at: new Date().toISOString(),
    pipelines: Array.from({ length: nPipelines }, (_, i) => ({
      id: i + 1, name: `pipe-${i + 1}`, path: '\\', queueStatus: 'enabled',
      createdDate: new Date().toISOString(), webUrl: null,
    })),
  }),
}));

vi.mock('@/hooks/useDevopsCobertura', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useDevopsCobertura')>()),
  useDevopsRepos: () => ({
    data: [
      repoTv('Flag.Decision', 'Flag.NovoDecision.BackEnd', 2),
      repoTv('Flag.Vdesk.Integracao', 'Flag-Gerenciador-Task-Api', 1),
    ],
    isLoading: false,
  }),
}));

import { InfraExecutivoTab } from '@/components/infraestrutura/InfraExecutivoTab';
import { TooltipProvider } from '@/components/ui/tooltip';

// O app envolve tudo em TooltipProvider (App.tsx) — replicamos aqui p/ o olhinho.
const renderTv = (ui: React.ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>);

const kpis = {
  total: 10, concluidos: 5, emAndamento: 3, pendentes: 2,
  melhorias: 1, iso27001: 1, sprintMigracoes: 0, transbordo: 0,
  doneBySprint: [],
  riscoItens: [{ id: 16164, title: 'Emails Falsos Engenharia Social', state: 'To Do', created_date: ontemIso }],
  isLoading: false,
};

describe('InfraExecutivoTab — modo TV (layout aprovado)', () => {
  it('"último" usa a data PARSEADA pt-BR — ontem ganha de texto livre 2023 e de dd/mm ambíguo', () => {
    renderTv(<InfraExecutivoTab kpis={kpis} tvMode periodLabel="S14-2026" />);
    expect(screen.getByText(new RegExp(`último: ${ontemLabel} · Inc Broker`))).toBeInTheDocument();
    expect(screen.queryByText(/último: 09\/10/)).not.toBeInTheDocument();
    // "12/03/2026" NÃO pode virar 3 de dezembro (parse americano)
    expect(screen.queryByText(/último: 03\/12/)).not.toBeInTheDocument();
  });

  it('exibe texto do incidente, solução e produto afetado no card de incidentes', () => {
    renderTv(<InfraExecutivoTab kpis={kpis} tvMode />);
    // abreviado (21/08): causa · solução numa linha truncada sob o título
    expect(screen.getByText(/Fila de integração travada no Broker · /)).toBeInTheDocument();
    expect(screen.getByText(/Reprocessamento da fila/)).toBeInTheDocument();
    // título + produto afetado na linha
    expect(screen.getByText('Inc Broker · ConnectMerchan')).toBeInTheDocument();
  });

  it('exibe solução no card de riscos e a quebra SG + DevOps', () => {
    renderTv(<InfraExecutivoTab kpis={kpis} tvMode />);
    expect(screen.getByText(/Campanha de conscientização/)).toBeInTheDocument();
    expect(screen.getByText(/2 SG \+ 1 DevOps/)).toBeInTheDocument();
  });

  it('riscos: descrição longa expande no clique revelando o título completo', () => {
    renderTv(<InfraExecutivoTab kpis={kpis} tvMode />);
    const desc = 'Acesso indevido a diretórios compartilhados sem revisão periódica de permissões';
    const span = screen.getByTitle(desc);
    expect(span.className).toContain('truncate');
    const item = span.closest('[role="button"]');
    expect(item).not.toBeNull();
    fireEvent.click(item!);
    expect(item!.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTitle(desc).className).toContain('whitespace-normal');
  });

  it('"dias sem riscos novos" pondera a task #Risco mais recente do DevOps', () => {
    renderTv(<InfraExecutivoTab kpis={kpis} tvMode />);
    // SG diz 141 dias, mas a task DevOps foi criada ontem → contador = 1
    const bloco = screen.getByText('dias sem riscos novos').parentElement;
    expect(bloco?.textContent).toMatch(/^1\s*dias sem riscos novos/);
  });

  it('renderiza o card Gestão de Mudanças com KPIs e amostra no TV', () => {
    renderTv(<InfraExecutivoTab kpis={kpis} tvMode periodLabel="S14-2026" />);
    expect(screen.getByText('Gestão de Mudanças · S14-2026')).toBeInTheDocument();
    expect(screen.getByText('770188')).toBeInTheDocument();
    expect(screen.getByText('Rejeitadas')).toBeInTheDocument();
  });

  // ── Ajuste aprovado 20/08: recorde lado a lado + KPIs sempre visíveis +
  //    ocorrências por extenso com rodapé "+N" (sem olhinho/scroll no telão) ──

  it('mostra o recorde de intervalo lado a lado com o contador', () => {
    renderTv(<InfraExecutivoTab kpis={kpis} tvMode />);
    // incidentes: sequência atual (1) empata com o recorde → selo verde
    expect(screen.getByText('recorde atual')).toBeInTheDocument();
    // riscos: recorde histórico 141 segue como referência (contador combinado = 1)
    expect(screen.getByText('maior intervalo')).toBeInTheDocument();
    expect(screen.getByText('141')).toBeInTheDocument();
  });

  it('exibe os KPIs que o overflow do card cortava no telão', () => {
    renderTv(<InfraExecutivoTab kpis={kpis} tvMode />);
    expect(screen.getByText('últimos 30 dias')).toBeInTheDocument();
    expect(screen.getByText('ativos agora')).toBeInTheDocument();
    expect(screen.getByText('riscos mapeados')).toBeInTheDocument();
  });

  it('Meta · Pipelines em 3 blocos: meta de PROJETOS, alvos e pipelines por projeto', () => {
    renderTv(<InfraExecutivoTab kpis={kpis} tvMode />);
    // bloco 1 — a meta é de projetos (2/3 no mock); pipelines é contador sem teto
    expect(screen.getByText('projetos automatizados')).toBeInTheDocument();
    expect(screen.getByText('pipelines novas')).toBeInTheDocument();
    const numProjetos = screen.getByText('projetos automatizados').previousElementSibling;
    expect(numProjetos?.textContent).toBe(`2 / 3`);
    const numPipelines = screen.getByText('pipelines novas').previousElementSibling;
    expect(numPipelines?.textContent).toBe('3'); // sem "/ meta"
    // bloco 2 — alvos do planejamento com título próprio (Flag.Decision entrou
    // como alvo Concluído em 21/08 — por isso aparece 2x: alvo + grupo)
    expect(screen.getByText('Projetos · status')).toBeInTheDocument();
    expect(screen.getByText('Broker 3')).toBeInTheDocument();
    // bloco 3 — agrupamento por projeto DevOps, repos como detalhe
    expect(screen.getByText('Pipelines por projeto · feito no trimestre')).toBeInTheDocument();
    expect(screen.getAllByText('Flag.Decision')).toHaveLength(2);
    expect(screen.getByText('2 pipelines')).toBeInTheDocument();
    expect(screen.getByText('Flag.Vdesk.Integracao')).toBeInTheDocument();
    expect(screen.getByText('1 pipeline')).toBeInTheDocument();
    expect(screen.getByText('Flag.NovoDecision.BackEnd')).toBeInTheDocument();
  });

  it('TV sem olhinho: item abreviado em 2 linhas que EXPANDE no clique', () => {
    renderTv(<InfraExecutivoTab kpis={kpis} tvMode />);
    // nenhum popover no telão — o resumo é visível e o clique expande
    expect(screen.queryByLabelText('Ver texto completo')).not.toBeInTheDocument();
    // a lista mantém TODOS os incidentes recentes (scroll, decisão de 20/08)
    expect(screen.getByText('Inc Firewall')).toBeInTheDocument();
    expect(screen.getByText('Inc VPN')).toBeInTheDocument();

    // recolhido: causa e solução dividem UMA linha; expandido: parágrafos próprios
    const item = screen.getByText('Inc Broker · ConnectMerchan').closest('[role="button"]')!;
    expect(item.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(item);
    expect(item.getAttribute('aria-expanded')).toBe('true');
    // exato = parágrafo próprio da causa (no compacto o texto vem composto)
    expect(screen.getByText('Fila de integração travada no Broker')).toBeInTheDocument();
    fireEvent.click(item);
    expect(item.getAttribute('aria-expanded')).toBe('false');
  });
});
