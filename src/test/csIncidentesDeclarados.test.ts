import {
  buildCsIncidentesDeclarados,
  classificaSla,
  classificaStatus017,
  RECENTES_MAX,
} from '@/hooks/useCsIncidentesDeclarados';
import type { SgsiRawItem } from '@/lib/sgsiFields';

// Builder puro do card de Incidentes Declarados (INC-1/INC-3), a partir das
// linhas cruas de `sgsi_items` (list_key '017' = SG-LST-016/017 do SGSI).

const NOW = new Date('2026-07-30T12:00:00Z');

function item(id: number, fs: Record<string, unknown>, created = '2026-07-10T10:00:00Z'): SgsiRawItem {
  return { list_key: '017', item_id: id, fields: fs, created_sp: created, modified_sp: created };
}

const build = (rows: SgsiRawItem[], over: Partial<Parameters<typeof buildCsIncidentesDeclarados>[0]> = {}) =>
  buildCsIncidentesDeclarados({
    rows,
    totalNoPeriodo: rows.length,
    totalBase: 120,
    sincronizadoEm: '2026-07-30T06:00:00Z',
    now: NOW,
    ...over,
  });

describe('classificaStatus017 — buckets EXCLUSIVOS', () => {
  it('resolvido ganha de contornado e de ativo (precedência)', () => {
    expect(classificaStatus017(item(1, { Status: 'Contornado e resolvido' }))).toBe('resolvido');
    expect(classificaStatus017(item(2, { Status: 'Encerrado' }))).toBe('resolvido');
  });

  it('contornado quando não há sinal de resolução', () => {
    expect(classificaStatus017(item(3, { Status: 'Contornado' }))).toBe('contornado');
    expect(classificaStatus017(item(4, { Status: 'Workaround aplicado' }))).toBe('contornado');
  });

  it('ativo para aberto/em andamento/em tratamento', () => {
    expect(classificaStatus017(item(5, { Status: 'Ativo' }))).toBe('ativo');
    expect(classificaStatus017(item(6, { 'Status atual': 'Em andamento' }))).toBe('ativo');
  });

  it('status desconhecido cai em "outro" — não em zero silencioso', () => {
    expect(classificaStatus017(item(7, { Status: 'Backlog' }))).toBe('outro');
    expect(classificaStatus017(item(8, {}))).toBe('outro');
  });
});

describe('buildCsIncidentesDeclarados — a conta FECHA', () => {
  const rows = [
    item(1, { Status: 'Resolvido' }),
    item(2, { Status: 'Contornado e resolvido' }),   // conta 1×, como resolvido
    item(3, { Status: 'Contornado' }),
    item(4, { Status: 'Ativo' }),
    item(5, { Status: 'Backlog' }),
  ];

  it('ativos + contornados + resolvidos + naoClassificados === total', () => {
    const d = build(rows);
    expect(d.total).toBe(5);
    expect(d.ativos + d.contornados + d.resolvidos + d.naoClassificados).toBe(d.total);
    expect(d).toMatchObject({ resolvidos: 2, contornados: 1, ativos: 1, naoClassificados: 1 });
  });
});

describe('pctDentroSla — aceita as duas grafias e nunca chuta', () => {
  it('reconhece Sim/Não', () => {
    expect(classificaSla('Sim')).toBe('dentro');
    expect(classificaSla('Não')).toBe('fora');
  });

  it('reconhece "Dentro do SLA" / "Fora do SLA"', () => {
    expect(classificaSla('Dentro do SLA')).toBe('dentro');
    expect(classificaSla('Fora do SLA')).toBe('fora');
  });

  it('valor fora do vocabulário NÃO vira "dentro"', () => {
    expect(classificaSla('Sem informação')).toBeNull();
    expect(classificaSla('')).toBeNull();
  });

  it('calcula o % sobre quem TEM o campo', () => {
    const d = build([
      item(1, { Status: 'Resolvido', SLA: 'Dentro do SLA' }),
      item(2, { Status: 'Resolvido', SLA: 'Sim' }),
      item(3, { Status: 'Resolvido', SLA: 'Fora do SLA' }),
      item(4, { Status: 'Resolvido' }),  // sem SLA: fora do denominador
    ]);
    expect(d.slaDentro).toBe(2);
    expect(d.slaFora).toBe(1);
    expect(d.pctDentroSla).toBe(67);
  });

  it('NENHUM item com SLA → null (não 0): ausência de base não é 0% dentro do SLA', () => {
    const d = build([item(1, { Status: 'Resolvido' })]);
    expect(d.pctDentroSla).toBeNull();
    expect(d.pctDentroSla).not.toBe(0);
  });
});

describe('downtime — null nunca vira 0', () => {
  it('campo ausente → downtimeHoras null no item', () => {
    const d = build([item(1, { Status: 'Resolvido', Protocolo: 'INC-1' })]);
    expect(d.recentes[0].downtimeHoras).toBeNull();
  });

  it("'2,5' → 2.5 e a soma arredonda a 1 decimal", () => {
    const d = build([
      item(1, { Status: 'Resolvido', 'Tempo Downtime': '2,5' }),
      item(2, { Status: 'Resolvido', 'Tempo Downtime': '1,25' }),
    ]);
    expect(d.recentes.find((i) => i.id === 1)!.downtimeHoras).toBe(2.5);
    expect(d.downtimeTotalHoras).toBe(3.8);
    expect(d.comDowntime).toBe(2);
  });

  it('ninguém declarou → downtimeTotalHoras null e comDowntime 0', () => {
    const d = build([item(1, { Status: 'Resolvido' })]);
    expect(d.downtimeTotalHoras).toBeNull();
    expect(d.comDowntime).toBe(0);
  });
});

describe('máquina de estado da fonte', () => {
  it('sem-espelho: totalBase null E sincronizadoEm null (sync nunca rodou / sem permissão)', () => {
    expect(build([], { totalBase: null, sincronizadoEm: null, totalNoPeriodo: 0 }).estado).toBe('sem-espelho');
  });

  it('espelho-vazio: lista sincronizada mas com 0 itens', () => {
    expect(build([], { totalBase: 0, totalNoPeriodo: 0 }).estado).toBe('espelho-vazio');
  });

  it('periodo-vazio: espelho tem itens, o período não', () => {
    const d = build([], { totalBase: 12, totalNoPeriodo: 0 });
    expect(d.estado).toBe('periodo-vazio');
    expect(d.totalBase).toBe(12);
  });

  it('ok: itens no período', () => {
    expect(build([item(1, { Status: 'Ativo' })]).estado).toBe('ok');
  });
});

describe('truncamento e recentes', () => {
  it('truncado quando o count do filtro é maior que as linhas devolvidas', () => {
    const d = build([item(1, { Status: 'Ativo' })], { totalNoPeriodo: 1200, limite: 1000 });
    expect(d.truncado).toBe(true);
    expect(d.limite).toBe(1000);
    expect(d.total).toBe(1200);
  });

  it('não truncado quando count === linhas', () => {
    expect(build([item(1, { Status: 'Ativo' })]).truncado).toBe(false);
  });

  it('recentes ordenados por created_sp desc e limitados a RECENTES_MAX', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      item(i + 1, { Status: 'Ativo', Protocolo: `INC-${i + 1}` }, `2026-07-${String(i + 1).padStart(2, '0')}T10:00:00Z`)
    );
    const d = build(rows);
    expect(d.recentes).toHaveLength(RECENTES_MAX);
    expect(d.recentes.map((r) => r.protocolo)).toEqual(['INC-10', 'INC-9', 'INC-8', 'INC-7']);
  });

  it('título cai para Produto quando Título/Title vêm vazios', () => {
    const d = build([item(1, { Status: 'Ativo', 'Título': '', Produto: 'ConnectMerchan' })]);
    expect(d.recentes[0].titulo).toBe('ConnectMerchan');
  });

  it('sem protocolo cai para #id — nunca string vazia', () => {
    const d = build([item(42, { Status: 'Ativo' })]);
    expect(d.recentes[0].protocolo).toBe('#42');
  });
});

describe('frescor do espelho', () => {
  it('6h atrás: saudável', () => {
    const d = build([item(1, { Status: 'Ativo' })], { sincronizadoEm: '2026-07-30T06:00:00Z' });
    expect(d.sincronizadoHaHoras).toBe(6);
    expect(d.espelhoDesatualizado).toBe(false);
    expect(d.espelhoCritico).toBe(false);
  });

  it('acima de 48h: desatualizado (amarelo), ainda não crítico', () => {
    const d = build([item(1, { Status: 'Ativo' })], { sincronizadoEm: '2026-07-27T06:00:00Z' });
    expect(d.espelhoDesatualizado).toBe(true);
    expect(d.espelhoCritico).toBe(false);
  });

  it('acima de 7 dias: crítico', () => {
    const d = build([item(1, { Status: 'Ativo' })], { sincronizadoEm: '2026-07-10T06:00:00Z' });
    expect(d.espelhoCritico).toBe(true);
  });

  it('sem sincronizadoEm: horas null, nenhum alerta falso', () => {
    const d = build([item(1, { Status: 'Ativo' })], { sincronizadoEm: null });
    expect(d.sincronizadoHaHoras).toBeNull();
    expect(d.espelhoDesatualizado).toBe(false);
    expect(d.espelhoCritico).toBe(false);
  });
});

describe('anti-INC-3 — Global × Pontual não pode ser sintetizado', () => {
  it('temCampoEscopo é SEMPRE false: a lista 017 não tem coluna de escopo nem de clientes afetados', () => {
    expect(build([item(1, { Status: 'Ativo', 'Priorização': 'Alta', Produto: 'Flexx' })]).temCampoEscopo).toBe(false);
  });

  it('Priorização é severidade, não escopo — vai para porPriorizacao, e nada mais', () => {
    const d = build([
      item(1, { Status: 'Ativo', 'Priorização': 'Alta' }),
      item(2, { Status: 'Ativo', 'Priorização': 'Alta' }),
      item(3, { Status: 'Ativo', 'Priorização': 'Média' }),
    ]);
    expect(d.porPriorizacao).toEqual([
      { name: 'Alta', value: 2 },
      { name: 'Média', value: 1 },
    ]);
    expect(Object.keys(d)).not.toContain('escopoGlobal');
    expect(Object.keys(d)).not.toContain('pontual');
  });
});
