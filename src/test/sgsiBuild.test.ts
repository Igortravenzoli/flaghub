import { buildSgsiResponse, countBy, simNaoOf, SgsiRawItem } from '@/hooks/useBIInfra';

// Testa a montagem da visão SGSI a partir das linhas espelhadas das listas
// SharePoint do site PORTALSGSI (fields jsonb chaveado por displayName).

function item(listKey: string, id: number, fields: Record<string, unknown>, created = '2026-06-01T10:00:00Z', modified?: string): SgsiRawItem {
  return { list_key: listKey, item_id: id, fields, created_sp: created, modified_sp: modified ?? created };
}

const NOW = new Date('2026-06-11T12:00:00Z');

describe('countBy / simNaoOf', () => {
  const rows = [
    item('010', 1, { Status: 'Concluído' }),
    item('010', 2, { Status: 'Concluído' }),
    item('010', 3, { Status: 'Pendente' }),
    item('010', 4, {}),
  ];

  it('conta por valor do campo, ignorando vazios, ordenado desc', () => {
    expect(countBy(rows, 'Status')).toEqual([
      { name: 'Concluído', value: 2 },
      { name: 'Pendente', value: 1 },
    ]);
  });

  it('interpreta Sim/Não como texto ou boolean', () => {
    const sn = [
      item('010', 1, { 'Atualizações bem sucedidas': 'Sim' }),
      item('010', 2, { 'Atualizações bem sucedidas': true }),
      item('010', 3, { 'Atualizações bem sucedidas': 'Não' }),
      item('010', 4, { 'Atualizações bem sucedidas': false }),
      item('010', 5, {}),
    ];
    expect(simNaoOf(sn, 'Atualizações bem sucedidas')).toEqual({ sim: 2, nao: 2 });
  });
});

describe('buildSgsiResponse', () => {
  const rows: SgsiRawItem[] = [
    // 010 — mudanças (status reais: Realizado/Aprovado/Rejeitado/Aguardando...;
    // "Título" carrega os ambientes como multi-escolha)
    item('010', 11, { Status: 'Realizado', 'Título': ['Broker PROD'], Risco: 'Baixo', 'Atualizações bem sucedidas': 'Sim', 'Número do chamado': 'MUD-0011' }, '2026-05-01T08:00:00Z'),
    item('010', 12, { Status: 'Aguardando aprovação TI', 'Título': ['Broker PA', 'Broker PROD'], Risco: 'Alto', 'Atualizações bem sucedidas': 'Não' }, '2026-06-01T08:00:00Z'),
    item('010', 13, { Status: 'Aguardando aprovação Gestores', 'Título': ['Staging Área PROD'] }, '2026-06-05T08:00:00Z'),
    item('010', 14, { Status: 'Rejeitado' }, '2026-04-10T08:00:00Z'),
    // 017 — incidentes (último em 06/06 → 5 dias sem incidentes em 11/06)
    item('017', 21, { Status: 'Resolvido', SLA: 'Dentro do SLA', Categoria: 'Disponibilidade', Protocolo: 'INC-21', 'Data e hora inicio Incidente': '2026-06-06T03:00:00Z', 'Tempo Downtime': '2,5' }),
    item('017', 22, { Status: 'Ativo', SLA: 'Fora do SLA', Categoria: 'Segurança' }, '2026-05-20T03:00:00Z'),
    // 012 — riscos (status reais: Encerrado/Rejeitado/Plano de Tratamento
    // Definido/Em monitoramento TI; ativo = "O que este risco afeta")
    item('012', 31, { 'Status solicitação': 'Encerrado', 'CID afetado': 'Disponibilidade', 'O plano de tratamento de risco foi eficaz?': 'Sim', 'O que este risco afeta': 'Servidores' }, '2026-06-09T00:00:00Z'),
    item('012', 32, { 'Status solicitação': 'Em monitoramento TI', 'CID afetado': 'Integridade', 'O que este risco afeta': 'Dados' }, '2026-04-01T00:00:00Z'),
    item('012', 33, { 'Status solicitação': 'Rejeitado' }, '2026-03-01T00:00:00Z'),
    // 018 — NC
    item('018', 41, { 'Status Análise': 'Encerrada', 'Não conformidade recorrente': 'Sim', 'Causa Raiz': 'Processo não seguido', 'Tratamento eficaz': 'Sim' }, '2026-03-13T00:00:00Z'),
    // 011 — OM
    item('011', 51, { 'Status Análise': 'Implementada', 'Melhoria foi eficaz?': 'Sim', 'Ambiente afetado': 'Datacenter' }),
    item('011', 52, { 'Status Análise': 'Em andamento' }),
    // 014 — acessos
    item('014', 61, { 'Status solicitação': 'Concedido', 'Tipo solicitação': 'Novo acesso', 'Acesso ao DevOps': 'Sim', 'Permissões administrativas': 'Não', Projeto: 'FlexxSales' }),
    item('014', 62, { 'Status solicitação': 'Pendente', 'Tipo solicitação': 'Revisão', 'Acesso ao DevOps': 'Não' }),
  ];

  const r = buildSgsiResponse(rows, '2026-06-11T11:00:00Z', NOW);

  it('separa os blocos por lista e calcula os KPIs de mudanças', () => {
    expect(r.totalItens).toBe(14);
    expect(r.mudancas.total).toBe(4);
    expect(r.mudancas.concluidos).toBe(1);          // Realizado
    expect(r.mudancas.pendentes).toBe(2);           // exclui Realizado e Rejeitado
    expect(r.mudancas.aguardandoTI).toBe(1);
    expect(r.mudancas.aguardandoGestor).toBe(1);
    expect(r.mudancas.atualizacoesBemSucedidas).toEqual({ sim: 1, nao: 1 });
    // itens ordenados do mais recente para o mais antigo
    expect(r.mudancas.itens[0].id).toBe(13);
    expect(r.mudancas.itens.find(i => i.id === 11)?.chamado).toBe('MUD-0011');
  });

  it('ambiente das mudanças vem do Título multi-escolha (cada valor conta)', () => {
    expect(r.mudancas.porAmbiente).toContainEqual({ name: 'Broker PROD', value: 2 }); // itens 11 e 12
    expect(r.mudancas.porAmbiente).toContainEqual({ name: 'Broker PA', value: 1 });
    expect(r.mudancas.itens.find(i => i.id === 12)?.ambiente).toBe('Broker PA, Broker PROD');
  });

  it('classifica incidentes por status e converte downtime com vírgula', () => {
    expect(r.incidentes.total).toBe(2);
    expect(r.incidentes.ativos).toBe(1);
    expect(r.incidentes.resolvidos).toBe(1);
    expect(r.incidentes.porSLA).toContainEqual({ name: 'Fora do SLA', value: 1 });
    expect(r.incidentes.itens.find(i => i.id === 21)?.downtimeHoras).toBe(2.5);
  });

  it('riscos: abertos exclui encerrados/tratados e rejeitados', () => {
    expect(r.riscos.total).toBe(3);
    expect(r.riscos.abertos).toBe(1); // só "Em monitoramento TI"
    expect(r.riscos.tratamentoEficaz.sim).toBe(1);
    expect(r.riscos.porAtivoAfetado).toContainEqual({ name: 'Servidores', value: 1 });
  });

  it('NC recorrentes, OM eficazes e acessos pendentes', () => {
    expect(r.naoConformidades.recorrentes).toBe(1);
    expect(r.melhorias.eficazes).toBe(1);
    expect(r.acessos.pendentes).toBe(1);
    expect(r.acessos.acessoDevOps).toEqual({ sim: 1, nao: 1 });
  });

  it('calcula os contadores "dias sem" a partir das datas', () => {
    expect(r.diasSem.incidentes).toBe(5);     // último incidente 06/06
    expect(r.diasSem.riscos).toBe(2);         // último risco criado 09/06
    expect(r.diasSem.naoConformidades).toBe(90); // NC criada 13/03
    expect(r.diasSem.attMalSucedidas).toBe(10);  // mudança malsucedida 01/06
  });

  it('sem dados sincronizados retorna tudo zerado com diasSem nulos', () => {
    const vazio = buildSgsiResponse([], null, NOW);
    expect(vazio.totalItens).toBe(0);
    expect(vazio.mudancas.total).toBe(0);
    expect(vazio.diasSem.incidentes).toBeNull();
  });
});
