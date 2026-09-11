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
    item('010', 11, { Status: 'Realizado', 'Título': ['Broker PROD'], Risco: 'Baixo', 'Atualizações bem sucedidas': 'Sim', 'Número do chamado': 'MUD-0011', 'Criado por': 'Ana', 'Aprovador TI': 'Rodolfo', 'Aprovador Gestor': 'Marcos', 'Data e Hora conclusão': '2026-05-02T10:00:00Z' }, '2026-05-01T08:00:00Z'),
    item('010', 12, { Status: 'Aguardando aprovação TI', 'Título': ['Broker PA', 'Broker PROD'], Risco: 'Alto', 'Atualizações bem sucedidas': 'Não', 'Solicitante atualização': 'Paula', 'Criado por': 'Bruno' }, '2026-06-01T08:00:00Z'),
    item('010', 13, { Status: 'Aguardando aprovação Gestores', 'Título': ['Staging Área PROD'] }, '2026-06-05T08:00:00Z'),
    item('010', 14, { Status: 'Rejeitado' }, '2026-04-10T08:00:00Z'),
    // "Título" pode chegar como STRING JSON de array (visto em prod: ["Froneri"])
    item('010', 15, { Status: 'Rejeitado', 'Título': '["Froneri"]' }, '2026-03-02T08:00:00Z'),
    // 017 — incidentes (último criado em 06/06 → 5 dias sem incidentes em 11/06;
    // o campo "Data e hora inicio Incidente" é texto livre e não conta p/ diasSem)
    item('017', 21, { Status: 'Resolvido', SLA: 'Dentro do SLA', Categoria: 'Disponibilidade', Protocolo: 'INC-21', 'Data e hora inicio Incidente': 'Dia: 06/06/2026 - Horário: 03h00', 'Tempo Downtime': '2,5' }, '2026-06-06T03:00:00Z'),
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
    expect(r.totalItens).toBe(15);
    expect(r.mudancas.total).toBe(5);
    // string JSON de array vira valor limpo (sem colchetes/aspas)
    expect(r.mudancas.itens.find(i => i.id === 15)?.ambiente).toBe('Froneri');
    expect(r.mudancas.concluidos).toBe(1);          // Realizado
    expect(r.mudancas.pendentes).toBe(2);           // exclui Realizado e Rejeitado
    expect(r.mudancas.aguardandoTI).toBe(1);
    expect(r.mudancas.aguardandoGestor).toBe(1);
    expect(r.mudancas.atualizacoesBemSucedidas).toEqual({ sim: 1, nao: 1 });
    // valor por item alimenta o drill do KPI (vazio vira '—', não 'Não')
    expect(r.mudancas.itens.find(i => i.id === 11)?.atualizacaoBemSucedida).toBe('Sim');
    expect(r.mudancas.itens.find(i => i.id === 12)?.atualizacaoBemSucedida).toBe('Não');
    expect(r.mudancas.itens.find(i => i.id === 13)?.atualizacaoBemSucedida).toBe('—');
    // itens ordenados do mais recente para o mais antigo
    expect(r.mudancas.itens[0].id).toBe(13);
    expect(r.mudancas.itens.find(i => i.id === 11)?.chamado).toBe('MUD-0011');
  });

  it('mudanças: solicitante cai para "Criado por" e expõe datas/aprovadores', () => {
    const m11 = r.mudancas.itens.find(i => i.id === 11)!;
    expect(m11.solicitante).toBe('Ana');            // fallback: quem criou o item
    expect(m11.aprovadorTI).toBe('Rodolfo');
    expect(m11.aprovadorGestor).toBe('Marcos');
    expect(m11.criado).toBe('2026-05-01T08:00:00Z');
    expect(m11.conclusao).toBe('2026-05-02T10:00:00Z');

    const m12 = r.mudancas.itens.find(i => i.id === 12)!;
    expect(m12.solicitante).toBe('Paula');          // campo explícito vence o fallback
    expect(m12.conclusao).toBe('');                 // sem conclusão registrada
    expect(m12.aprovadorGestor).toBe('—');
  });

  it('mudanças: lista sem teto — drill Sim/Não bate com o KPI mesmo acima de 300 itens', () => {
    // 350 mudanças no período, com texto, boolean e vazio misturados. Com o teto
    // antigo (300) a lista perdia as 50 mais antigas e o drill contava menos.
    const valores: unknown[] = ['Sim', 'Não', true, false, '', undefined, 'Yes', 'nao'];
    const muitas = Array.from({ length: 350 }, (_, k) => {
      const v = valores[k % valores.length];
      return item('010', 1000 + k, v === undefined ? {} : { 'Atualizações bem sucedidas': v },
        new Date(Date.UTC(2026, 0, 1) + k * 3600000).toISOString());
    });
    const m = buildSgsiResponse(muitas, null, NOW).mudancas;
    // 43 ciclos completos (3 sim · 3 não · 2 vazios) + 6 sobras (2 sim · 2 não)
    expect(m.atualizacoesBemSucedidas).toEqual({ sim: 131, nao: 131 });
    expect(m.itens).toHaveLength(350);
    expect(m.itens.filter(i => i.atualizacaoBemSucedida === 'Sim')).toHaveLength(131);
    expect(m.itens.filter(i => i.atualizacaoBemSucedida === 'Não')).toHaveLength(131);
    // por item: o boolean nativo do SharePoint não pode inverter (contagem simétrica não pegaria)
    expect(m.itens.find(i => i.id === 1002)?.atualizacaoBemSucedida).toBe('Sim'); // k=2 → true
    expect(m.itens.find(i => i.id === 1003)?.atualizacaoBemSucedida).toBe('Não'); // k=3 → false
    expect(m.itens.find(i => i.id === 1004)?.atualizacaoBemSucedida).toBe('—');   // k=4 → ''
  });

  it('mudanças: justificativa vem só da coluna "Comentário atualizações"', () => {
    const j = buildSgsiResponse([
      item('010', 91, { 'Atualizações bem sucedidas': 'Não', 'Comentário atualizações': 'Rollback: pacote quebrou o login' }),
      // os outros comentários da lista (aprovação TI/Gestor) não entram no lugar dele
      item('010', 92, { 'Atualizações bem sucedidas': 'Não', 'Comentário TI Aprovação': 'Aprovado com ressalva', 'Comentário Gestor Aprovação': 'Ok' }),
      item('010', 93, { 'Atualizações bem sucedidas': 'Sim' }),
    ], null, NOW).mudancas.itens;
    expect(j.find(i => i.id === 91)?.justificativa).toBe('Rollback: pacote quebrou o login');
    expect(j.find(i => i.id === 92)?.justificativa).toBe('—');
    expect(j.find(i => i.id === 93)?.justificativa).toBe('—');
  });

  it('acessos: solicitante, aprovadores (TI é pessoa resolvida pelo sync; Gestor é texto) e link do item', () => {
    const LINK = 'https://flagcom.sharepoint.com/sites/PORTALSGSI/Lists/SGLST014/DispForm.aspx?ID=71';
    const a = buildSgsiResponse([
      item('014', 71, { 'Status solicitação': 'Realizado', Solicitante: 'Carla Souza', 'Solicitante (lookupId)': '41', 'Aprovador TI': 'Rodolfo Lima', 'Aprovador TI (lookupId)': '19', 'Aprovador Gestor': 'Marta Gestora', _sharepoint_url: LINK }),
      // nome não resolvido (só o lookupId) → traço, nunca o número; link fora de https é descartado
      item('014', 72, { 'Status solicitação': 'Aprovado', 'Solicitante (lookupId)': '51', 'Aprovador TI (lookupId)': '19', _sharepoint_url: 'javascript:alert(1)' }),
    ], null, NOW).acessos.itens;
    const a71 = a.find(i => i.id === 71)!;
    expect([a71.solicitante, a71.aprovadorTI, a71.aprovadorGestor]).toEqual(['Carla Souza', 'Rodolfo Lima', 'Marta Gestora']);
    expect(a71.link).toBe(LINK);
    const a72 = a.find(i => i.id === 72)!;
    expect([a72.solicitante, a72.aprovadorTI, a72.aprovadorGestor]).toEqual(['—', '—', '—']);
    expect(a72.link).toBe('');
  });

  it('acessos: revisão TI, liberação e evidência de revogação dos provisórios (NOW = 11/06/2026)', () => {
    const PTI = '<---Preenchimento TI--->';
    const REV = 'Data ultima revisão';
    const FIM = 'Data fim liberação provisória';
    const a = buildSgsiResponse([
      item('014', 81, { 'Tipo liberação': 'Definitiva', [PTI]: true, [REV]: '2026-06-01T10:00:00Z' }),
      item('014', 82, { 'Tipo liberação': 'Definitiva', [PTI]: true }),                                   // marcado sem data
      item('014', 83, { 'Tipo liberação': 'Provisória', [PTI]: 'Sim', [REV]: '2026-06-06T10:00:00Z', [FIM]: '2026-06-05T00:00:00Z' }),
      item('014', 84, { 'Tipo liberação': 'Provisória', [PTI]: false, [REV]: '2026-05-01T10:00:00Z', [FIM]: '2026-06-05T00:00:00Z' }), // vencido
      item('014', 85, { 'Tipo liberação': 'Provisória', [PTI]: false, [FIM]: '2026-06-11T00:00:00Z' }),  // vence hoje: ainda no prazo
      item('014', 86, { 'Tipo liberação': 'Provisória', [PTI]: true, [FIM]: '2026-06-01T00:00:00Z' }),   // marcado sem data não é evidência
      item('014', 87, { 'Tipo liberação': 'Provisória' }),                                                // sem caixa e sem data fim
      item('014', 88, { 'Status solicitação': 'Aprovado' }),                                              // sem tipo de liberação
      // nunca liberaram acesso: não entram na conta de evidência
      item('014', 89, { 'Tipo liberação': 'Provisória', 'Status solicitação': 'Rejeitado', [PTI]: false, [FIM]: '2026-06-01T00:00:00Z' }),
      item('014', 90, { 'Tipo liberação': 'Provisória', 'Status solicitação': 'Aguardando Gestor', [FIM]: '2026-06-01T00:00:00Z' }),
    ], null, NOW).acessos;

    const por = (id: number) => a.itens.find(i => i.id === id)!;
    expect(por(81)).toMatchObject({ revisaoTI: 'Acesso Revisado', revisadoSemData: false, tipoLiberacao: 'Definitiva', evidenciaRevogacao: null });
    expect(por(82)).toMatchObject({ revisaoTI: 'Acesso Revisado', revisadoSemData: true });
    expect(por(83)).toMatchObject({ revisaoTI: 'Acesso Revisado', tipoLiberacao: 'Provisória', evidenciaRevogacao: 'Com evidência', fimLiberacao: '2026-06-05T00:00:00Z' });
    expect(por(84)).toMatchObject({ revisaoTI: 'A revisar', evidenciaRevogacao: 'Sem evidência' });
    expect(por(85)).toMatchObject({ revisaoTI: 'A revisar', evidenciaRevogacao: 'No prazo' });
    expect(por(86)).toMatchObject({ revisadoSemData: true, evidenciaRevogacao: 'Sem evidência' });
    expect(por(87)).toMatchObject({ revisaoTI: 'A revisar', evidenciaRevogacao: 'Sem evidência' });
    expect(por(88)).toMatchObject({ tipoLiberacao: '—', evidenciaRevogacao: null });
    expect(por(89)).toMatchObject({ tipoLiberacao: 'Provisória', evidenciaRevogacao: 'Não se aplica' });
    expect(por(90)).toMatchObject({ evidenciaRevogacao: 'Não se aplica' });

    expect(a).toMatchObject({
      total: 10, revisados: 4, aRevisar: 6, revisadosSemData: 2,
      definitivos: 2, provisorios: 7, provisoriosComEvidencia: 1, provisoriosNoPrazo: 1, provisoriosSemEvidencia: 3, provisoriosNaoAplica: 2,
    });
  });

  it('acessos: tipo de acesso vem de "Categoria Liberação" (multi-escolha, JSON aninhado e sinônimos)', () => {
    const a = buildSgsiResponse([
      item('014', 91, { 'Categoria Liberação': ['Banco de dados', 'Acesso a servidor'] }),
      item('014', 92, { 'Categoria Liberação': ['["Acesso DevOps ","Acesso Banco de dados","Vpn Flag Local"]'] }), // JSON dentro do array (visto em prod)
      item('014', 93, { 'Categoria Liberação': '["Acesso Servidor"]' }),
      item('014', 94, { 'Categoria Liberação': ['Acesso pastas', 'Acesso Pastas'] }),                             // repetido com outra caixa
      item('014', 95, { 'Categoria Liberação': ['Fiddler ou Wireshark'] }),                                       // fora do vocabulário: mantém
      item('014', 96, {}),
    ], null, NOW).acessos;
    const por = (id: number) => a.itens.find(i => i.id === id)!;
    expect(por(91).categorias).toEqual(['Banco de dados', 'Acesso a servidor']);
    expect(por(92).categorias).toEqual(['DevOps', 'Banco de dados', 'Acesso VPN']);
    expect(por(93).categorias).toEqual(['Acesso a servidor']);
    expect(por(94).categorias).toEqual(['Acesso pastas']);
    expect(por(95).categorias).toEqual(['Fiddler ou Wireshark']);
    expect(por(96).categorias).toEqual([]);
    expect(a.porCategoria).toEqual([
      { name: 'Acesso a servidor', value: 2 },
      { name: 'Banco de dados', value: 2 },
      { name: 'Acesso pastas', value: 1 },
      { name: 'Acesso VPN', value: 1 },
      { name: 'DevOps', value: 1 },
      { name: 'Fiddler ou Wireshark', value: 1 },
    ]);
    expect(a.semCategoria).toBe(1);
    // o texto da lista não se perde no agrupamento (VPN IBM Cloud ≠ VPN local)
    expect(por(92).categoriasLista).toEqual(['Acesso DevOps', 'Acesso Banco de dados', 'Vpn Flag Local']);
    expect(por(94).categoriasLista).toEqual(['Acesso pastas']);
  });

  it('acessos: a auditoria usa a base inteira — o recorte da sprint não esconde o provisório vencido e parado', () => {
    const range = { from: new Date('2026-06-01T00:00:00Z'), to: new Date('2026-06-10T23:59:59Z') };
    const a = buildSgsiResponse([
      // criado em março e nunca mais tocado: vencido e sem revisão
      item('014', 301, { 'Tipo liberação': 'Provisória', 'Status solicitação': 'Realizado', '<---Preenchimento TI--->': false, 'Data fim liberação provisória': '2026-05-20T00:00:00Z' }, '2026-03-01T10:00:00Z'),
      // revisado dentro do período
      item('014', 302, { 'Tipo liberação': 'Provisória', 'Status solicitação': 'Revogado', '<---Preenchimento TI--->': true, 'Data ultima revisão': '2026-06-05T10:00:00Z', 'Data fim liberação provisória': '2026-06-01T00:00:00Z' }, '2026-03-01T10:00:00Z', '2026-06-05T10:00:00Z'),
    ], null, NOW, range).acessos;
    expect(a.itens.map(i => i.id).sort()).toEqual([301, 302]);
    expect(a).toMatchObject({ total: 2, provisorios: 2, provisoriosComEvidencia: 1, provisoriosSemEvidencia: 1 });
  });

  it('acessos: data fim é dia de calendário — vale até o fim do dia em Brasília', () => {
    const provisorio = (fimIso: string) => ({ 'Tipo liberação': 'Provisória', 'Status solicitação': 'Realizado', 'Data fim liberação provisória': fimIso });
    const situacao = (fimIso: string, agora: string) =>
      buildSgsiResponse([item('014', 400, provisorio(fimIso))], null, new Date(agora)).acessos.itens[0].evidenciaRevogacao;
    // gravado como meia-noite UTC (formato visto em produção)
    expect(situacao('2026-06-11T00:00:00Z', '2026-06-12T01:00:00Z')).toBe('No prazo');      // 22:00 de 11/06 em Brasília
    expect(situacao('2026-06-11T00:00:00Z', '2026-06-12T03:30:00Z')).toBe('Sem evidência'); // 00:30 de 12/06
    // gravado como meia-noite de Brasília (03:00Z): mesmo dia
    expect(situacao('2026-06-11T03:00:00Z', '2026-06-12T01:00:00Z')).toBe('No prazo');
  });

  it('acessos: lista sem teto — o drill da tabela bate com os KPIs acima de 300 itens', () => {
    const muitos = Array.from({ length: 320 }, (_, k) => item('014', 2000 + k,
      { 'Tipo liberação': k % 2 ? 'Provisória' : 'Definitiva', '<---Preenchimento TI--->': k % 3 === 0 },
      new Date(Date.UTC(2026, 0, 1) + k * 3600000).toISOString()));
    const a = buildSgsiResponse(muitos, null, NOW).acessos;
    expect(a.itens).toHaveLength(320);
    expect(a.itens.filter(i => i.revisaoTI === 'A revisar')).toHaveLength(a.aRevisar);
    expect(a.itens.filter(i => i.tipoLiberacao === 'Provisória')).toHaveLength(a.provisorios);
    expect(a.aRevisar).toBe(213); // 320 − 107 múltiplos de 3
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

  it('recorde = maior intervalo entre registros consecutivos, incluindo o em curso', () => {
    // 017: 20/05 → 06/06 = 17 dias (o intervalo em curso, 5, não supera)
    expect(r.diasSem.maiorIntervaloIncidentes).toBe(17);
    // 012: 01/03 → 01/04 = 31; 01/04 → 09/06 = 69 (em curso, 2, não supera)
    expect(r.diasSem.maiorIntervaloRiscos).toBe(69);
  });

  it('com um único registro o recorde é o próprio intervalo em curso (= dias sem)', () => {
    const soUm = buildSgsiResponse([item('017', 99, {}, '2026-06-01T12:00:00Z')], null, NOW);
    expect(soUm.diasSem.incidentes).toBe(10);
    expect(soUm.diasSem.maiorIntervaloIncidentes).toBe(10); // sequência atual É o recorde
    expect(soUm.diasSem.maiorIntervaloRiscos).toBeNull();   // 012 sem registros
  });

  it('sem dados sincronizados retorna tudo zerado com diasSem nulos', () => {
    const vazio = buildSgsiResponse([], null, NOW);
    expect(vazio.totalItens).toBe(0);
    expect(vazio.totalItensBase).toBe(0);
    expect(vazio.mudancas.total).toBe(0);
    expect(vazio.diasSem.incidentes).toBeNull();
    expect(vazio.diasSem.maiorIntervaloIncidentes).toBeNull();
  });

  it('filtro de período (sprint) limita os blocos mas não os "dias sem"', () => {
    const range = { from: new Date('2026-06-01T00:00:00Z'), to: new Date('2026-06-10T23:59:59Z') };
    const f = buildSgsiResponse(rows, '2026-06-11T11:00:00Z', NOW, range);

    // 010 no período: itens 12 (01/06) e 13 (05/06); fora: 11 (01/05) e 14 (10/04)
    expect(f.mudancas.total).toBe(2);
    expect(f.mudancas.concluidos).toBe(0);
    expect(f.totalItensBase).toBe(15);
    expect(f.totalItens).toBeLessThan(15);

    // "dias sem" continua atemporal: último incidente 06/06 → 5 dias
    expect(f.diasSem.incidentes).toBe(5);
    expect(f.diasSem.naoConformidades).toBe(90); // NC de 13/03, fora do período
  });
});
