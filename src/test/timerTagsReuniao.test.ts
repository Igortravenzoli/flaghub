import { describe, expect, it } from 'vitest';
import {
  ehMarcadorKpi,
  nomesDasTags,
  opsDeClassificacao,
  reconciliar,
  sanitizarTags,
  soTagsExistentes,
  tagsDoDevops,
  textoDeCampo,
  validarReuniao,
  valoresPermitidos,
} from '../../supabase/functions/timer-devops/reuniao';
import { CAMPO_CLIENTE, CAMPO_PRODUTO, CAMPOS_ITEM, paraItem } from '../../supabase/functions/timer-devops/tarefas';
import {
  agruparTags,
  avisoTagsDescartadas,
  buscarTags,
  categoriasDasTags,
  classificacaoCompleta,
  classificacaoVazia,
  grafiaExistente,
  herdaveis,
  temProduto,
  tipoDaTag,
} from '@/lib/timerTags';
import { classifyTag } from '@/lib/products';

describe('edge: tags na criação', () => {
  it('limpa, tira repetidas e os marcadores de KPI', () => {
    expect(
      sanitizarTags(['SUITEFLEXX', ' heineken ', 'HEINEKEN', 'PRIORIZACAO', 'Transbordo', 'Avião antigo', 'Retorno QA', 'a;b', 7, '']),
    ).toEqual(['SUITEFLEXX', 'heineken', 'a b']);
    expect(sanitizarTags('SUITEFLEXX')).toEqual([]);
    expect(sanitizarTags(Array.from({ length: 20 }, (_, i) => `T${i}`))).toHaveLength(12);
    expect(tagsDoDevops(['SUITEFLEXX', 'HEINEKEN'])).toBe('SUITEFLEXX; HEINEKEN');
  });

  it('marcadores de KPI reconhecidos', () => {
    for (const t of ['PRIORIZACAO', 'priorização', 'AVIAO', 'avião transbordado', 'TRANSBORDO', 'Retorno de QA', 'BUG', 'ESCOPOPAGO', 'CRITICIDADE']) {
      expect(ehMarcadorKpi(t)).toBe(true);
    }
    expect(ehMarcadorKpi('SUITEFLEXX')).toBe(false);
    expect(ehMarcadorKpi('Bugfix Heineken')).toBe(false);
  });

  it('lê a resposta da API Tags (array ou { value }) sem marcadores', () => {
    expect(nomesDasTags([{ name: 'ZETA' }, { name: 'alfa' }, { name: 'PRIORIZACAO' }, { name: '' }])).toEqual(['alfa', 'ZETA']);
    expect(nomesDasTags({ count: 2, value: [{ name: 'B' }, { name: 'B' }] })).toEqual(['B']);
    expect(nomesDasTags(null)).toEqual([]);
  });
});

describe('edge: Timer em Reunião', () => {
  it('título com prefixo, tag Reunião sempre, cliente e produto do pedido', () => {
    const r = validarReuniao({ tema: '  Segurança do SuiteFlexx ', featureId: 600, tags: ['Evento'], cliente: ' Suporte Flag ', produto: 'Suite Flexx' });
    expect(r).toEqual({
      ok: true,
      titulo: 'Reunião - Segurança do SuiteFlexx',
      featureId: 600,
      projeto: null,
      tags: ['Reunião', 'Evento'],
      cliente: 'Suporte Flag',
      produto: 'Suite Flexx',
    });
  });

  it('na raiz do projeto, sem duplicar o prefixo', () => {
    const r = validarReuniao({ tema: 'Reunião - Kickoff', featureId: null, projeto: ' Flag.Planejamento ', tags: ['FLEXXGO'] });
    expect(r.ok && r.titulo).toBe('Reunião - Kickoff');
    expect(r.ok && r.featureId).toBeNull();
    expect(r.ok && r.projeto).toBe('Flag.Planejamento');
  });

  it('recusa tema curto, Feature inválida e sem destino', () => {
    expect(validarReuniao({ tema: 'ab', projeto: 'P', tags: ['X'] }).ok).toBe(false);
    expect(validarReuniao({ tema: 'Kickoff', featureId: -3, tags: ['X'] }).ok).toBe(false);
    expect(validarReuniao({ tema: 'Kickoff', tags: ['X'] })).toMatchObject({ ok: false, motivo: 'sem_destino' });
  });
});

describe('edge: Cliente e Produto são campos de lista (nomes trocados no DevOps)', () => {
  const permitidos = { clientes: ['5 S Distribuidora', 'Aguas Minerais', 'Suporte Flag'], produtos: ['Flexx', 'Flexx Gps', 'Suite Flexx'] };

  it('o mapeamento da Mode.IA: PRODUTOSS = cliente, CLIENTESS = produto', () => {
    expect(CAMPO_CLIENTE).toBe('Custom.PRODUTOSS');
    expect(CAMPO_PRODUTO).toBe('Custom.CLIENTESS');
    expect(CAMPOS_ITEM).toEqual(expect.arrayContaining(['Custom.PRODUTOSS', 'Custom.CLIENTESS']));
    const item = paraItem({ id: 7, fields: { 'System.TeamProject': 'P', 'Custom.PRODUTOSS': 'Aguas Minerais', 'Custom.CLIENTESS': ' Flexx ' } });
    expect(item?.cliente).toBe('Aguas Minerais');
    expect(item?.produto).toBe('Flexx');
  });

  it('lê os valores permitidos (sem $expand a lista some)', () => {
    expect(valoresPermitidos({ allowedValues: ['Flexx', ' Suite Flexx ', 'Flexx', ''] })).toEqual(['Flexx', 'Suite Flexx']);
    expect(valoresPermitidos({ referenceName: 'Custom.CLIENTESS' })).toEqual([]);
  });

  it('reconcilia sem caixa e recusa fora da lista', () => {
    expect(reconciliar('aguas minerais', permitidos.clientes)).toBe('Aguas Minerais');
    expect(reconciliar('INFRA', permitidos.clientes)).toBeNull();
    expect(textoDeCampo('  Suite\nFlexx ')).toBe('Suite Flexx');
  });

  it('grava cliente em PRODUTOSS, produto em CLIENTESS e as tags', () => {
    const r = opsDeClassificacao({ cliente: 'suporte flag', produto: 'suite flexx', tags: ['Evento'] }, permitidos);
    expect(r).toEqual({
      ok: true,
      cliente: 'Suporte Flag',
      produto: 'Suite Flexx',
      ops: [
        { op: 'add', path: '/fields/Custom.PRODUTOSS', value: 'Suporte Flag' },
        { op: 'add', path: '/fields/Custom.CLIENTESS', value: 'Suite Flexx' },
        { op: 'add', path: '/fields/System.Tags', value: 'Evento' },
      ],
    });
  });

  it('cliente e produto obrigatórios quando o tipo tem o campo', () => {
    expect(opsDeClassificacao({ cliente: null, produto: 'Flexx', tags: [] }, permitidos)).toMatchObject({ ok: false, motivo: 'sem_cliente' });
    expect(opsDeClassificacao({ cliente: 'Suporte Flag', produto: null, tags: [] }, permitidos)).toMatchObject({ ok: false, motivo: 'sem_produto' });
    expect(opsDeClassificacao({ cliente: 'INFRA', produto: 'Flexx', tags: [] }, permitidos)).toMatchObject({ ok: false, motivo: 'cliente_fora_da_lista' });
    // tipo sem os campos: nada a exigir nem a gravar
    expect(opsDeClassificacao({ cliente: null, produto: null, tags: [] }, { clientes: [], produtos: [] })).toEqual({ ok: true, ops: [], cliente: null, produto: null });
  });

  it('um clique (herdado): fora da lista é descartado, mas ainda exige os dois', () => {
    expect(opsDeClassificacao({ cliente: 'INFRA', produto: 'Flexx', tags: [] }, permitidos, true, true)).toMatchObject({ ok: false, motivo: 'sem_cliente' });
    expect(opsDeClassificacao({ cliente: 'Suporte Flag', produto: 'Flexx', tags: [] }, permitidos, true, true)).toMatchObject({ ok: true });
  });
});

describe('app: classificação', () => {
  const campos = { clientes: ['Aguas Minerais'], produtos: ['Flexx'] };
  it('herda só o que está no campo do pai e exige os dois', () => {
    const c = classificacaoVazia({ cliente: 'Aguas Minerais', produto: null });
    expect(c).toEqual({ cliente: 'Aguas Minerais', produto: null, tags: [] });
    expect(classificacaoCompleta(c, campos)).toBe(false);
    expect(classificacaoCompleta({ ...c, produto: 'flexx' }, campos)).toBe(true);
    expect(classificacaoCompleta({ ...c, produto: 'Flexx' }, undefined)).toBe(false);
    expect(classificacaoCompleta(classificacaoVazia(), { clientes: [], produtos: [] })).toBe(true);
  });

  it('categoria = tags sem os marcadores de KPI', () => {
    expect(categoriasDasTags(['Evento', 'PRIORIZACAO', 'IA', 'HEINEKEN', 'TRANSBORDO'])).toEqual(['Evento', 'IA', 'HEINEKEN']);
  });
});

describe('app: tags', () => {
  it('classifica produto, cliente, categoria, marcador e KPI', () => {
    expect(tipoDaTag('SuiteFlexx')).toBe('produto');
    expect(tipoDaTag('HEINEKEN')).toBe('cliente');
    expect(tipoDaTag('Evento')).toBe('categoria');
    expect(tipoDaTag('Reunião')).toBe('categoria');
    expect(tipoDaTag('IA')).toBe('marcador');
    expect(tipoDaTag('TRANSBORDO')).toBe('kpi');
  });

  it('herda do pai só produto e cliente', () => {
    expect(herdaveis('SUITEFLEXX; HEINEKEN; PRIORIZACAO; Evento; IA')).toEqual(['SUITEFLEXX', 'HEINEKEN']);
    expect(herdaveis(null)).toEqual([]);
  });

  it('busca sem acento e acha a grafia existente', () => {
    const lista = ['HEINEKEN', 'HEINEKEN SP', 'NESTLÉ', 'RIONORTE'];
    expect(buscarTags(lista, 'hein')).toEqual(['HEINEKEN', 'HEINEKEN SP']);
    expect(buscarTags(lista, 'nestle')).toEqual(['NESTLÉ']);
    expect(grafiaExistente('heineken', lista)).toBe('HEINEKEN');
    expect(grafiaExistente('Heinekem', lista)).toBeNull();
  });

  it('separa a lista do DevOps e confere produto', () => {
    expect(agruparTags(['SUITEFLEXX', 'HEINEKEN', 'PRIORIZACAO', 'Evento', 'IA'])).toEqual({
      produtos: ['SUITEFLEXX'],
      clientes: ['HEINEKEN'],
      categorias: ['Evento', 'IA'],
    });
    expect(temProduto(['Reunião', 'HEINEKEN'])).toBe(false);
    expect(temProduto(['Reunião', 'FLEXXGO'])).toBe(true);
  });
});

describe('FlagHub: Evento, Risco e Reunião não viram cliente', () => {
  it('são marcadores na classificação da Fábrica', () => {
    for (const t of ['Evento', 'Risco', 'Reunião', 'REUNIAO']) expect(classifyTag(t)).toBe('marcador');
    expect(classifyTag('HEINEKEN')).toBe('cliente');
  });
});

describe('tags: só as que já existem (o token do Timer não cria tag, 403 em 19/11)', () => {
  it('mantém as existentes com a grafia de lá e descarta as novas', () => {
    expect(soTagsExistentes(['evento', 'Reunião', 'IA', 'NovaTag'], ['Evento', 'IA', 'BI'])).toEqual({
      mantidas: ['Evento', 'IA'],
      descartadas: ['Reunião', 'NovaTag'],
    });
    expect(soTagsExistentes(['X'], [])).toEqual({ mantidas: [], descartadas: ['X'] });
  });

  it('o aviso cita as descartadas, menos a Reunião', () => {
    expect(avisoTagsDescartadas(['Reunião', 'NovaTag'])).toBe(' Tags que não existem no DevOps e ficaram de fora: NovaTag.');
    expect(avisoTagsDescartadas(['Reunião'])).toBe('');
    expect(avisoTagsDescartadas(undefined)).toBe('');
  });
});
