// ── Config ────────────────────────────────────────────────────────────
const GATEWAY_URL = (import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? '';
const SERVICE_SECRET = (import.meta.env.VITE_GATEWAY_SERVICE_SECRET as string | undefined) ?? '';
const MOCK_MODE =
  !GATEWAY_URL || (import.meta.env.VITE_GATEWAY_MOCK as string | undefined) === 'true';

// ── Mock data registry ────────────────────────────────────────────────

function buildMocks(): Record<string, unknown> {
  const SISTEMAS = ['Ailton', 'Italo', 'Leandrofaria', 'Guimaraes', 'Ricardo', 'Vagner', 'Wilker'];
  const INFRA = ['Bruna', 'Ronaldo'];
  const ALL = [...SISTEMAS, ...INFRA];

  const now = new Date('2026-05-21');
  const ini = '2026-05-01';
  const fim = '2026-05-21';

  /* Weekdays in May 2026 (without holidays) */
  const weekdays: string[] = [];
  for (let d = new Date('2026-05-01'); d <= now; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) {
      weekdays.push(d.toISOString().slice(0, 10));
    }
  }
  const diasUteis = weekdays.length; // ~15 dias

  /* Produtividade base por consultor (varia por dia) */
  const baseProd: Record<string, number> = {
    Ailton: 0.785, Italo: 0.821, Leandrofaria: 0.883,
    Guimaraes: 0.724, Ricardo: 0.912, Vagner: 0.798, Wilker: 0.846,
    Bruna: 0.763, Ronaldo: 0.689,
  };

  const consultorSistemas = SISTEMAS.map((c) => {
    const prod = baseProd[c];
    const totalRegistros = Math.round(prod * diasUteis * 9.5 + Math.random() * 10);
    const totalTempoSegundos = Math.round(totalRegistros * (60 * 22 + Math.random() * 300));
    return {
      consultor: c,
      totalRegistros,
      totalTempoSegundos,
      produtividade: +(prod * 100).toFixed(1),
    };
  });

  const consultorInfra = INFRA.map((c) => {
    const prod = baseProd[c];
    const totalRegistros = Math.round(prod * diasUteis * 5.5 + Math.random() * 5);
    const totalTempoSegundos = Math.round(totalRegistros * (60 * 25 + Math.random() * 300));
    return {
      consultor: c,
      totalRegistros,
      totalTempoSegundos,
      produtividade: +(prod * 100).toFixed(1),
    };
  });

  const totalRegistros = consultorSistemas.reduce((s, c) => s + c.totalRegistros, 0)
    + consultorInfra.reduce((s, c) => s + c.totalRegistros, 0);
  const totalTempoSegundos = consultorSistemas.reduce((s, c) => s + c.totalTempoSegundos, 0)
    + consultorInfra.reduce((s, c) => s + c.totalTempoSegundos, 0);

  /* Por Dia */
  const registrosPorDia: unknown[] = [];
  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  for (const dia of weekdays) {
    const dt = new Date(dia + 'T00:00:00');
    const diaSemanaNome = diasSemana[dt.getDay()];
    for (const c of ALL) {
      const prod = baseProd[c] * (0.8 + Math.random() * 0.4);
      const sumMinutos = Math.round(prod * 480);
      const totalReg = Math.round(prod * 9 + Math.random() * 3);
      registrosPorDia.push({
        consultor: c,
        dataRegistro: dia,
        diaSemana: diaSemanaNome,
        totalRegistros: totalReg,
        totalTempoSegundos: sumMinutos * 60,
        produtividadeDia: +(prod * 100).toFixed(1),
      });
    }
  }

  /* Por Cliente */
  const clientes = [
    { cliente: 'Nestlé Brás', bandeira: 'Nestlé', totalRegistros: 234 },
    { cliente: 'Nestlé Caçapava', bandeira: 'Nestlé', totalRegistros: 187 },
    { cliente: 'Nestlé Marília', bandeira: 'Nestlé', totalRegistros: 156 },
    { cliente: 'Heineken SP', bandeira: 'Heineken', totalRegistros: 134 },
    { cliente: 'Nestlé Feira', bandeira: 'Nestlé', totalRegistros: 98 },
    { cliente: 'Heineken RJ', bandeira: 'Heineken', totalRegistros: 87 },
    { cliente: 'Nestlé Palmeiras', bandeira: 'Nestlé', totalRegistros: 76 },
    { cliente: 'Nestlé Uberlândia', bandeira: 'Nestlé', totalRegistros: 64 },
    { cliente: 'BRF Vitória', bandeira: 'BRF', totalRegistros: 58 },
    { cliente: 'Nestlé Goiânia', bandeira: 'Nestlé', totalRegistros: 47 },
    { cliente: 'Ambev MG', bandeira: 'Ambev', totalRegistros: 43 },
    { cliente: 'BRF Curitiba', bandeira: 'BRF', totalRegistros: 39 },
  ];

  /* Por Sistema */
  const sistemas = [
    { nomeSistema: 'FlexxSales', totalRegistros: 312, totalMinutos: 8450, tempoMedioMinutos: 27.1 },
    { nomeSistema: 'Datacenter', totalRegistros: 245, totalMinutos: 5340, tempoMedioMinutos: 21.8 },
    { nomeSistema: 'AvanteSales', totalRegistros: 198, totalMinutos: 4230, tempoMedioMinutos: 21.4 },
    { nomeSistema: 'QuickOne', totalRegistros: 167, totalMinutos: 3120, tempoMedioMinutos: 18.7 },
    { nomeSistema: 'FlexxGPS', totalRegistros: 143, totalMinutos: 2890, tempoMedioMinutos: 20.2 },
    { nomeSistema: 'AvanteShelf', totalRegistros: 128, totalMinutos: 2640, tempoMedioMinutos: 20.6 },
    { nomeSistema: 'SmartSales', totalRegistros: 95, totalMinutos: 1980, tempoMedioMinutos: 20.8 },
    { nomeSistema: 'FlexxPromo', totalRegistros: 82, totalMinutos: 1560, tempoMedioMinutos: 19.0 },
    { nomeSistema: 'Decision', totalRegistros: 67, totalMinutos: 1230, tempoMedioMinutos: 18.4 },
    { nomeSistema: 'OlaPDV', totalRegistros: 54, totalMinutos: 980, tempoMedioMinutos: 18.1 },
    { nomeSistema: 'EstoqueCheck', totalRegistros: 43, totalMinutos: 780, tempoMedioMinutos: 18.1 },
    { nomeSistema: 'FlexxTools', totalRegistros: 38, totalMinutos: 690, tempoMedioMinutos: 18.2 },
  ];

  /* SLA Flag */
  const slaFlag = {
    success: true,
    message: '[MOCK] Dados simulados',
    dataReferencia: new Date().toISOString(),
    tipo: 'Flag',
    metas: { metaTTRDias: 3.9, metaTTR24hPct: 48.0 },
    kpis: {
      totalAbertos: 87,
      ttrMedioAbertoDias: 4.2,
      abertos5Dias: 23,
      abertos30Dias: 8,
      abertos180Dias: 5,
      totalFechados60Dias: 312,
      ttrMedioFechadoDias: 3.1,
      pctEncerrados24h: 51.3,
    },
    status: { ttr: 'ALERT', pct24h: 'OK' },
  };

  /* Nestlé Histórico */
  const meses = ['05/2025','06/2025','07/2025','08/2025','09/2025','10/2025','11/2025','12/2025','01/2026','02/2026','03/2026','04/2026','05/2026'];
  const slaNestleHistorico = {
    success: true,
    message: '[MOCK]',
    metas: { metaTTRDias: 3.9, metaTTR24hPct: 48.0 },
    series: meses.map((mes, i) => ({
      mes,
      totalFechados: Math.round(120 + Math.sin(i * 0.7) * 30 + Math.random() * 20),
      ttrMedioDias: +(4.5 + Math.sin(i * 0.5) * 1.5 + Math.random() * 0.5).toFixed(2),
      pctEncerrados24h: +(45 + Math.sin(i * 0.8) * 10 + Math.random() * 5).toFixed(1),
    })),
  };

  /* BI Customer — KPIs (espelho SLA Flag x Outros: 2 segmentos) */
  const biCustomerKpis = {
    success: true,
    message: '[MOCK] Dados simulados',
    nestle: {
      unidade: 'ticket',
      mesAtual:    { total: 135, inc: 99, prb: 1, ritm: 35 },
      mesAnterior: { total: 549, inc: 393, prb: 8, ritm: 148 },
      abertos:     { incAberto: 61, prbAberto: 3, ritmAberto: 15, inc5Dias: 53, prb10Dias: 2, ritm30Dias: 4 },
      metricas:    { fechadosMes: 131, ttrMedioDias: 4.99, pctEncerrados24h: 68.7 },
    },
    outras: {
      unidade: 'os',
      mesAtual:    { total: 286, inc: 10, prb: 20, ritm: 111 },
      mesAnterior: { total: 914, inc: 34, prb: 87, ritm: 352 },
      abertos:     { incAberto: 24, prbAberto: 60, ritmAberto: 226, inc5Dias: 24, prb10Dias: 52, ritm30Dias: 175 },
      metricas:    { fechadosMes: 284, ttrMedioDias: 4.89, pctEncerrados24h: 81.69 },
    },
  };

  /* BI Customer — Detalhe (genérico para mock) */
  const biCustomerDetalhe = {
    success: true,
    message: '[MOCK]',
    segmento: 'nestle',
    tipo: 'INC',
    diasMin: 5,
    total: 21,
    items: Array.from({ length: 21 }, (_, i) => ({
      os: 30000 + i,
      ticket: `INC${String(7000 + i).padStart(7, '0')}`,
      cliente: ['Nestlé Brás', 'Nestlé Caçapava', 'Heineken SP', 'BRF Vitória', 'Ambev MG'][i % 5],
      sistema: ['FlexxSales', 'AvanteSales', 'QuickOne', 'Decision'][i % 4],
      consultor: ALL[i % ALL.length],
      tipoChamado: ['Incidente', 'Problema', 'Requisição'][i % 3],
      bandeira: ['Nestlé', 'Heineken', 'Danone', 'Outros'][i % 4],
      dataRegistro: new Date(Date.now() - (6 + i * 2) * 86400000).toISOString(),
      diasAberto: 6 + i * 2,
      criticidade: ['Alta', 'Média', 'Baixa'][i % 3],
    })),
  };

  /* Detalhe OS Flag */
  const mockFlagOs = Array.from({ length: 87 }, (_, i) => ({
    os: 10000 + i,
    apelido: ['Nestlé Brás','Nestlé Caçapava','Heineken SP','BRF Vitória','Ambev MG'][i % 5],
    codigoPuxada: null,
    erroPadrao: ['Erro de acesso','Lentidão','Crash sistema',null][i % 4],
    dtOs: new Date(Date.now() - (i * 1.5 + Math.random() * 2) * 86400000).toISOString(),
    dtBaixaOs: null,
    diasAberto: Math.round(i * 1.5 + Math.random() * 2),
    ticket: i % 3 === 0 ? `INC${String(i).padStart(7,'0')}` : null,
    sistema: ['FlexxSales','Datacenter','AvanteSales','QuickOne'][i % 4],
    criticidade: ['Alta','Média','Baixa'][i % 3],
    desvioLancamento: i * 1.5 > 180,
  }));

  /* Detalhe OS Nestlé */
  const mockNestleOs = Array.from({ length: 45 }, (_, i) => ({
    os: 20000 + i,
    apelido: ['Nestlé Brás','Nestlé Caçapava','Nestlé Marília','Nestlé Goiânia'][i % 4],
    codigoPuxada: null,
    erroPadrao: ['Erro de acesso','Lentidão',null][i % 3],
    dtOs: new Date(Date.now() - (i * 1.2 + Math.random() * 3) * 86400000).toISOString(),
    dtBaixaOs: null,
    diasAberto: Math.round(i * 1.2 + Math.random() * 3),
    ticket: `INC${String(i + 100).padStart(7,'0')}`,
    sistema: ['FlexxSales','AvanteSales','QuickOne','Decision'][i % 4],
    criticidade: ['Alta','Média'][i % 2],
    desvioLancamento: false,
  }));

  /* BI Infra — SGSI (espelho do PBIX SG-LST Usecase 1.04: listas SharePoint SG) */
  const AMBIENTES = ['Produção', 'Homologação', 'Datacenter', 'Cloud Azure', 'Rede Corporativa'];
  const PESSOAS_INFRA = ['Bruna', 'Ronaldo', 'Igor', 'Henrique', 'Marcos'];

  const biInfraSgsi = {
    success: true,
    message: '[MOCK] Dados simulados',
    atualizadoEm: new Date().toISOString(),
    diasSem: { incidentes: 41, riscos: 12, naoConformidades: 87, attMalSucedidas: 26 },
    mudancas: {
      total: 86, concluidos: 71, pendentes: 9, aguardandoGestor: 4, aguardandoTI: 2,
      porStatus: [
        { name: 'Concluído', value: 71 }, { name: 'Pendente', value: 9 },
        { name: 'Aguardando Gestor', value: 4 }, { name: 'Aguardando TI', value: 2 },
      ],
      porAmbiente: [
        { name: 'Produção', value: 38 }, { name: 'Homologação', value: 21 },
        { name: 'Datacenter', value: 14 }, { name: 'Cloud Azure', value: 9 }, { name: 'Rede Corporativa', value: 4 },
      ],
      porRisco: [{ name: 'Baixo', value: 52 }, { name: 'Médio', value: 27 }, { name: 'Alto', value: 7 }],
      porCategoria: [
        { name: 'Normal', value: 49 }, { name: 'Padrão', value: 24 }, { name: 'Emergencial', value: 13 },
      ],
      atualizacoesBemSucedidas: { sim: 79, nao: 7 },
      validacaoTestes: { sim: 74, nao: 12 },
      itens: Array.from({ length: 10 }, (_, i) => ({
        id: 860 - i,
        chamado: `MUD-${String(860 - i).padStart(4, '0')}`,
        ambiente: AMBIENTES[i % AMBIENTES.length],
        tipoMudanca: ['Atualização de versão', 'Patch de segurança', 'Configuração', 'Hotfix'][i % 4],
        categoria: ['Normal', 'Padrão', 'Emergencial'][i % 3],
        motivo: ['Atualização programada', 'Correção de vulnerabilidade', 'Ajuste de performance', 'Solicitação de cliente'][i % 4],
        status: i < 7 ? 'Concluído' : ['Pendente', 'Aguardando Gestor', 'Aguardando TI'][i % 3],
        solicitante: PESSOAS_INFRA[i % PESSOAS_INFRA.length],
        aprovadorTI: PESSOAS_INFRA[(i + 2) % PESSOAS_INFRA.length],
        risco: ['Baixo', 'Médio', 'Alto'][i % 3],
        modificado: new Date(Date.now() - i * 3 * 86400000).toISOString(),
      })),
    },
    incidentes: {
      total: 23, ativos: 2, contornados: 4, resolvidos: 17,
      porSLA: [{ name: 'Dentro do SLA', value: 19 }, { name: 'Fora do SLA', value: 4 }],
      porCategoria: [
        { name: 'Disponibilidade', value: 9 }, { name: 'Performance', value: 6 },
        { name: 'Segurança', value: 4 }, { name: 'Acesso', value: 4 },
      ],
      itens: Array.from({ length: 8 }, (_, i) => ({
        id: 230 - i,
        titulo: ['Indisponibilidade VPN', 'Lentidão storage', 'Alerta antivírus', 'Queda link MPLS', 'Falha backup noturno', 'Certificado expirado', 'Disco crítico SQL', 'Phishing reportado'][i],
        ativo: ['FW-Edge01', 'STG-NetApp', 'SRV-AV', 'LINK-MPLS-SP', 'BKP-Veeam', 'SRV-WEB02', 'SQL-PROD01', 'M365'][i],
        motivo: ['Falha de hardware', 'Saturação de uso', 'Assinatura desatualizada', 'Rompimento operadora', 'Job travado', 'Renovação não programada', 'Crescimento de base', 'Engenharia social'][i],
        priorizacao: ['Alta', 'Média', 'Baixa'][i % 3],
        protocolo: `INC-${String(230 - i).padStart(4, '0')}`,
        status: i < 2 ? 'Ativo' : i < 6 ? 'Resolvido' : 'Contornado',
        tipo: ['Infraestrutura', 'Segurança'][i % 2],
        sla: i % 5 === 0 ? 'Fora do SLA' : 'Dentro do SLA',
        categoria: ['Disponibilidade', 'Performance', 'Segurança', 'Acesso'][i % 4],
        downtimeHoras: [4.5, 1.2, 0, 6.8, 2.1, 0.5, 3.2, 0][i],
        inicio: new Date(Date.now() - (i * 11 + 2) * 86400000).toISOString(),
      })),
    },
    riscos: {
      total: 31, abertos: 6,
      porStatus: [
        { name: 'Tratado', value: 21 }, { name: 'Em tratamento', value: 6 },
        { name: 'Aceito', value: 3 }, { name: 'Novo', value: 1 },
      ],
      porAmbiente: [
        { name: 'Datacenter', value: 11 }, { name: 'Cloud Azure', value: 8 },
        { name: 'Rede Corporativa', value: 7 }, { name: 'Produção', value: 5 },
      ],
      porCID: [
        { name: 'Disponibilidade', value: 14 }, { name: 'Confidencialidade', value: 10 }, { name: 'Integridade', value: 7 },
      ],
      porCategoriaAmeaca: [
        { name: 'Técnica', value: 13 }, { name: 'Humana', value: 9 },
        { name: 'Física', value: 5 }, { name: 'Ambiental', value: 4 },
      ],
      porTipoAmeaca: [
        { name: 'Intencional', value: 9 }, { name: 'Acidental', value: 14 }, { name: 'Natural', value: 8 },
      ],
      porAtivoAfetado: [
        { name: 'Servidores', value: 10 }, { name: 'Rede', value: 8 },
        { name: 'Dados', value: 7 }, { name: 'Pessoas', value: 4 }, { name: 'Instalações', value: 2 },
      ],
      tratamentoEficaz: { sim: 24, nao: 7 },
      itens: Array.from({ length: 8 }, (_, i) => ({
        id: 310 - i,
        descricao: ['Ransomware via e-mail', 'Falha climatização DC', 'Acesso indevido a backups', 'Obsolescência hypervisor', 'Dependência de fornecedor único', 'Perda de chaves de criptografia', 'Shadow IT em SaaS', 'Queda de energia prolongada'][i],
        ambiente: AMBIENTES[i % AMBIENTES.length],
        cid: ['Disponibilidade', 'Confidencialidade', 'Integridade'][i % 3],
        categoriaAmeaca: ['Técnica', 'Humana', 'Física', 'Ambiental'][i % 4],
        tipoAmeaca: ['Intencional', 'Acidental', 'Natural'][i % 3],
        ativoAfetado: ['Servidores', 'Rede', 'Dados', 'Pessoas', 'Instalações'][i % 5],
        status: i < 2 ? 'Em tratamento' : i < 7 ? 'Tratado' : 'Aceito',
        responsavelAjuste: PESSOAS_INFRA[i % PESSOAS_INFRA.length],
        dataLimite: new Date(Date.now() + (30 - i * 8) * 86400000).toISOString(),
        eficaz: i % 4 === 3 ? 'Não' : 'Sim',
      })),
    },
    naoConformidades: {
      total: 12, recorrentes: 3,
      porStatus: [
        { name: 'Encerrada', value: 8 }, { name: 'Em análise', value: 3 }, { name: 'Aberta', value: 1 },
      ],
      porCausaRaiz: [
        { name: 'Processo não seguido', value: 5 }, { name: 'Falta de treinamento', value: 3 },
        { name: 'Documentação desatualizada', value: 2 }, { name: 'Falha de comunicação', value: 2 },
      ],
      tratamentoEficaz: { sim: 9, nao: 3 },
      itens: Array.from({ length: 6 }, (_, i) => ({
        id: 120 - i,
        processo: ['Gestão de mudanças', 'Backup e restauração', 'Controle de acessos', 'Gestão de incidentes', 'Inventário de ativos', 'Gestão de patches'][i],
        detalhes: ['Mudança sem aprovação registrada', 'Teste de restore fora do prazo', 'Revisão de acessos atrasada', 'Incidente sem lição aprendida', 'CMDB divergente do ambiente', 'Patch crítico fora da janela'][i],
        causaRaiz: ['Processo não seguido', 'Falta de treinamento', 'Documentação desatualizada', 'Falha de comunicação'][i % 4],
        acao: ['Reforço do fluxo de aprovação', 'Agenda automática de testes', 'Alerta de revisão trimestral', 'Template de pós-incidente', 'Sincronização automática CMDB', 'Janela emergencial documentada'][i],
        recorrente: i % 4 === 0,
        status: i < 4 ? 'Encerrada' : i === 4 ? 'Em análise' : 'Aberta',
        eficaz: i < 4 ? 'Sim' : '—',
        solicitante: PESSOAS_INFRA[i % PESSOAS_INFRA.length],
        criado: new Date(Date.now() - (i * 25 + 10) * 86400000).toISOString(),
      })),
    },
    melhorias: {
      total: 18, eficazes: 11,
      porStatus: [
        { name: 'Implementada', value: 11 }, { name: 'Em andamento', value: 4 },
        { name: 'Avaliação', value: 2 }, { name: 'Backlog', value: 1 },
      ],
      porAmbiente: [
        { name: 'Datacenter', value: 6 }, { name: 'Cloud Azure', value: 5 },
        { name: 'Rede Corporativa', value: 4 }, { name: 'Produção', value: 3 },
      ],
      itens: Array.from({ length: 6 }, (_, i) => ({
        id: 180 - i,
        oportunidade: ['Automação de provisionamento', 'Dashboard de capacidade', 'MFA em ativos legados', 'Padronização de nomenclatura', 'Alertas proativos de certificado', 'Runbooks de incidentes'][i],
        ambiente: AMBIENTES[i % AMBIENTES.length],
        processo: ['Provisionamento', 'Capacity planning', 'Segurança', 'Governança', 'Monitoração', 'Operação'][i],
        beneficios: ['Redução de 60% no tempo de entrega', 'Visibilidade antecipada de saturação', 'Redução de superfície de ataque', 'Menos erros operacionais', 'Zero expiração não programada', 'Resposta padronizada'][i],
        status: i < 4 ? 'Implementada' : 'Em andamento',
        eficaz: i < 4 ? 'Sim' : '—',
        solicitante: PESSOAS_INFRA[i % PESSOAS_INFRA.length],
      })),
    },
    acessos: {
      total: 64, pendentes: 5,
      porStatus: [
        { name: 'Concedido', value: 49 }, { name: 'Revogado', value: 10 }, { name: 'Pendente', value: 5 },
      ],
      porTipo: [
        { name: 'Novo acesso', value: 31 }, { name: 'Alteração', value: 17 },
        { name: 'Revogação', value: 10 }, { name: 'Revisão', value: 6 },
      ],
      porProjeto: [
        { name: 'FlexxSales', value: 18 }, { name: 'Datacenter', value: 14 },
        { name: 'AvanteSales', value: 12 }, { name: 'QuickOne', value: 11 }, { name: 'Decision', value: 9 },
      ],
      acessoDevOps: { sim: 27, nao: 37 },
      acessoTS: { sim: 22, nao: 42 },
      permissoesAdmin: { sim: 8, nao: 56 },
      itens: Array.from({ length: 8 }, (_, i) => ({
        id: 640 - i,
        titulo: `ACS-${String(640 - i).padStart(4, '0')}`,
        descricao: ['Acesso repositório DevOps', 'Acesso TS produção', 'Pasta compartilhada projetos', 'Instância SQL homolog', 'Portal de BI', 'VPN terceiros', 'Admin local estação', 'Acesso cofre de senhas'][i],
        motivo: ['Novo colaborador', 'Mudança de função', 'Projeto temporário', 'Suporte a cliente', 'Auditoria', 'Fornecedor externo', 'Desenvolvimento', 'Operação NOC'][i],
        tipo: ['Novo acesso', 'Alteração', 'Revogação', 'Revisão'][i % 4],
        projeto: ['FlexxSales', 'Datacenter', 'AvanteSales', 'QuickOne', 'Decision'][i % 5],
        solicitante: PESSOAS_INFRA[i % PESSOAS_INFRA.length],
        cargo: ['Analista Infra', 'DevOps', 'Consultor', 'Tech Lead', 'Suporte'][i % 5],
        status: i < 6 ? 'Concedido' : i === 6 ? 'Pendente' : 'Revogado',
        acessoDevOps: i % 2 === 0,
        acessoTS: i % 3 === 0,
        permissoesAdmin: i === 6,
        ultimaRevisao: new Date(Date.now() - (i * 14 + 5) * 86400000).toISOString(),
      })),
    },
  };

  /* SLA Nestlé */
  const slaNestle = {
    success: true,
    message: '[MOCK] Dados simulados',
    dataReferencia: new Date().toISOString(),
    tipo: 'Nestle',
    metas: { metaTTRDias: 3.9, metaTTR24hPct: 48.0 },
    kpis: {
      totalAbertos: 45,
      ttrMedioAbertoDias: 3.6,
      abertos5Dias: 12,
      abertos30Dias: 3,
      totalFechados60Dias: 178,
      ttrMedioFechadoDias: 2.8,
      pctEncerrados24h: 42.1,
    },
    status: { ttr: 'OK', pct24h: 'ALERT' },
  };

  /* HelpDesk Dashboard mock */
  const hdConsultores = ALL.map(c => {
    const prod = baseProd[c];
    const totalRegistros = Math.round(prod * diasUteis * 8 + Math.random() * 10);
    const totalMinutos = Math.round(totalRegistros * (18 + Math.random() * 12));
    return { consultor: c, totalRegistros, totalMinutos };
  });
  const hdTotalRegistros = hdConsultores.reduce((s, c) => s + c.totalRegistros, 0);
  const hdTotalMinutos   = hdConsultores.reduce((s, c) => s + c.totalMinutos, 0);
  const hdPorDia = weekdays.map(dia => ({
    dataRegistro: dia,
    totalRegistros: Math.round(hdTotalRegistros / diasUteis * (0.8 + Math.random() * 0.4)),
    totalMinutos:   Math.round(hdTotalMinutos   / diasUteis * (0.8 + Math.random() * 0.4)),
  }));

  const helpdeskDashboard = {
    success: true,
    message: '[MOCK] Dados simulados',
    timestamp: new Date().toISOString(),
    periodo: { dataInicio: ini, dataFim: fim, tipo: 'custom', dias: diasUteis },
    registrosPorConsultor: hdConsultores,
    tipoChamadoTempoMedio: [
      { tipoChamado: 'Dúvida',   totalRegistros: Math.round(hdTotalRegistros * 0.38), tempoMedioMinutos: 16.2 },
      { tipoChamado: 'Suporte',  totalRegistros: Math.round(hdTotalRegistros * 0.29), tempoMedioMinutos: 22.7 },
      { tipoChamado: 'Bug',      totalRegistros: Math.round(hdTotalRegistros * 0.19), tempoMedioMinutos: 31.4 },
      { tipoChamado: 'Melhoria', totalRegistros: Math.round(hdTotalRegistros * 0.09), tempoMedioMinutos: 45.1 },
      { tipoChamado: 'Outros',   totalRegistros: Math.round(hdTotalRegistros * 0.05), tempoMedioMinutos: 18.0 },
    ],
    registrosPorSistema: sistemas.map(s => ({ nomeSistema: s.nomeSistema, totalRegistros: s.totalRegistros })),
    registrosPorBandeira: [
      { bandeira: 'Nestlé',   totalRegistros: Math.round(hdTotalRegistros * 0.52) },
      { bandeira: 'Heineken', totalRegistros: Math.round(hdTotalRegistros * 0.21) },
      { bandeira: 'BRF',      totalRegistros: Math.round(hdTotalRegistros * 0.15) },
      { bandeira: 'Ambev',    totalRegistros: Math.round(hdTotalRegistros * 0.12) },
    ],
    registrosPorCliente: clientes.map(c => ({ cliente: c.apelido, totalRegistros: c.totalRegistros })),
    horasTotaisPorDia: hdPorDia,
    acumulado: { totalRegistros: hdTotalRegistros, totalMinutos: hdTotalMinutos },
    ocorrenciasPorTipo: [
      { tipo: 'Dúvida',   total: Math.round(hdTotalRegistros * 0.38) },
      { tipo: 'Suporte',  total: Math.round(hdTotalRegistros * 0.29) },
      { tipo: 'Bug',      total: Math.round(hdTotalRegistros * 0.19) },
      { tipo: 'Melhoria', total: Math.round(hdTotalRegistros * 0.09) },
      { tipo: 'Outros',   total: Math.round(hdTotalRegistros * 0.05) },
    ],
  };

  return {
    '/api/helpdesk/dashboard': helpdeskDashboard,
    '/api/techlead/acumulado': {
      success: true,
      message: '[MOCK] Dados simulados',
      dataInicio: ini,
      dataFim: fim,
      totalRegistros,
      totalTempoSegundos,
      mediaDiariaRegistros: +(totalRegistros / diasUteis).toFixed(1),
      tmaSegundos: Math.round(totalTempoSegundos / totalRegistros),
      diasUteis,
    },
    '/api/techlead/resumo-consultor': {
      success: true,
      message: '[MOCK]',
      dataInicio: ini,
      dataFim: fim,
      consultores: consultorSistemas,
      totalRegistros: consultorSistemas.reduce((s, c) => s + c.totalRegistros, 0),
      totalTempoSegundos: consultorSistemas.reduce((s, c) => s + c.totalTempoSegundos, 0),
    },
    '/api/techlead/resumo-consultor-infra': {
      success: true,
      message: '[MOCK]',
      dataInicio: ini,
      dataFim: fim,
      consultores: consultorInfra,
      totalRegistros: consultorInfra.reduce((s, c) => s + c.totalRegistros, 0),
      totalTempoSegundos: consultorInfra.reduce((s, c) => s + c.totalTempoSegundos, 0),
    },
    '/api/techlead/por-dia': {
      success: true,
      message: '[MOCK]',
      dataInicio: ini,
      dataFim: fim,
      registros: registrosPorDia,
    },
    '/api/techlead/por-cliente': {
      success: true,
      message: '[MOCK]',
      dataInicio: ini,
      dataFim: fim,
      clientes,
    },
    '/api/techlead/por-sistema': {
      success: true,
      message: '[MOCK]',
      dataInicio: ini,
      dataFim: fim,
      sistemas,
    },
    '/api/bi-customer/kpis': biCustomerKpis,
    '/api/bi-customer/detalhe': biCustomerDetalhe,
    '/api/bi-infra/sgsi': biInfraSgsi,
    '/api/gestao/sla-flag': slaFlag,
    '/api/gestao/sla-nestle': slaNestle,
    '/api/gestao/sla-nestle-historico': slaNestleHistorico,
    '/api/gestao/sla-flag-detalhe': { success: true, message: '[MOCK]', filtro: 'aberto', total: mockFlagOs.length, items: mockFlagOs },
    '/api/gestao/sla-nestle-detalhe': { success: true, message: '[MOCK]', filtro: 'aberto', total: mockNestleOs.length, items: mockNestleOs },
  };
}

let _mocks: Record<string, unknown> | null = null;
function getMocks() {
  if (!_mocks) _mocks = buildMocks();
  return _mocks;
}

// ── Auth ──────────────────────────────────────────────────────────────

const TOKEN_KEY = 'gw_service_token';
const EXPIRES_KEY = 'gw_service_token_expires';

async function acquireToken(): Promise<string> {
  const res = await fetch(`${GATEWAY_URL}/api/client-auth/service-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceName: 'flaghub', serviceSecret: SERVICE_SECRET }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gateway auth failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.sessionToken as string;
}

async function getToken(): Promise<string> {
  const cached = sessionStorage.getItem(TOKEN_KEY);
  const expires = sessionStorage.getItem(EXPIRES_KEY);
  if (cached && expires && new Date(expires) > new Date(Date.now() + 60_000)) {
    return cached;
  }
  const token = await acquireToken();
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(EXPIRES_KEY, new Date(Date.now() + 110 * 60 * 1000).toISOString());
  return token;
}

// ── Public API ────────────────────────────────────────────────────────

/** Returns true when running against mock data (no real Gateway) */
export const isMockMode = MOCK_MODE;

export async function gatewayGet<T>(path: string): Promise<T> {
  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 300)); // simula latência
    const key = path.split('?')[0];
    const mock = getMocks()[key];
    if (mock !== undefined) return mock as T;
    throw new Error(`[mock] sem dados para ${key}`);
  }
  const token = await getToken();
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gateway ${res.status}: ${text}`);
  }
  return res.json();
}

export async function gatewayPost<T>(path: string, body: FormData | object): Promise<T> {
  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 500));
    if (path.includes('/central/upload')) {
      return { success: true, message: '[MOCK] Upload simulado — 0 registros inseridos em modo mock.', inserted: 0 } as T;
    }
    throw new Error('[mock] POST não suportado neste endpoint');
  }
  const token = await getToken();
  const isFormData = body instanceof FormData;
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: 'POST',
    headers: isFormData
      ? { Authorization: `Bearer ${token}` }
      : { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: isFormData ? body : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gateway ${res.status}: ${text}`);
  }
  return res.json();
}
