import { describe, expect, it } from 'vitest';
import {
  ehMarcadorKpi,
  nomesDasTags,
  sanitizarTags,
  tagsDoDevops,
  tituloGuardaChuva,
  validarReuniao,
} from '../../supabase/functions/timer-devops/reuniao';
import { agruparTags, buscarTags, grafiaExistente, herdaveis, temProduto, tipoDaTag } from '@/lib/timerTags';
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

describe('edge: Rec reunião', () => {
  it('título com prefixo, tag Reunião sempre, produto obrigatório', () => {
    const r = validarReuniao({ tema: '  Segurança do SuiteFlexx ', featureId: 600, tags: ['SUITEFLEXX'] });
    expect(r).toEqual({ ok: true, titulo: 'Reunião - Segurança do SuiteFlexx', featureId: 600, tags: ['Reunião', 'SUITEFLEXX'] });
  });

  it('não duplica o prefixo e aceita sem Feature', () => {
    const r = validarReuniao({ tema: 'Reunião - Kickoff', featureId: null, tags: ['FLEXXGO'] });
    expect(r.ok && r.titulo).toBe('Reunião - Kickoff');
    expect(r.ok && r.featureId).toBeNull();
  });

  it('recusa tema curto, Feature inválida e sem produto', () => {
    expect(validarReuniao({ tema: 'ab', tags: ['X'] }).ok).toBe(false);
    expect(validarReuniao({ tema: 'Kickoff', featureId: -3, tags: ['X'] }).ok).toBe(false);
    expect(validarReuniao({ tema: 'Kickoff', tags: [] })).toMatchObject({ ok: false, motivo: 'sem_produto' });
    expect(validarReuniao({ tema: 'Kickoff', tags: ['PRIORIZACAO'] })).toMatchObject({ ok: false, motivo: 'sem_produto' });
  });

  it('guarda-chuva por sprint', () => {
    expect(tituloGuardaChuva('S23-2026')).toBe('[REUNIÕES] S23-2026');
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
    expect(agruparTags(['SUITEFLEXX', 'HEINEKEN', 'PRIORIZACAO', 'Evento', 'IA'])).toEqual({ produtos: ['SUITEFLEXX'], outras: ['HEINEKEN', 'IA'] });
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
