import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  CODIGOS_FABRICA, FABRICAS, GRUPOS, ehFabricaDeEntrega, fabricasDoGrupo,
  grupoDaFabrica, rotuloFabrica, rotuloFabricaLongo,
} from '@/lib/fabricaOrganograma';
import {
  AREAS, EPICOS_FORMATO_ANTERIOR, GRUPOS_HORAS, buildAlocacaoMap, buildHomeSquadMap, buildNaoContaSet, casasDe, ehArea, homeSquadOf,
  DESTINO_NENHUM, destinoIdDoItem, horasDiaNaCasa, lerDestino, marcaDaHora, repartirHoraPorPessoa, segmentoArea,
} from '@/lib/fabricaRoster';
import { fabricaColor } from '@/lib/chartColors';

/**
 * Organograma Fábricas / Produto (11/2026): grupo › fábrica › pessoa.
 *
 * O arquivo `fabricaOrganograma.ts` é a fonte única dos nomes. O que este teste
 * guarda é justamente o que já deu errado antes: listas paralelas que precisam
 * concordar (código × CHECK do banco) e pessoa em duas fábricas contada em dobro.
 */

describe('estrutura do organograma', () => {
  it('tem os três grupos de fábrica, na ordem de leitura, e as oito fábricas', () => {
    expect(GRUPOS.slice(0, 3).map((g) => g.rotulo)).toEqual(['Sustentação', 'Evolução', 'Híbrida']);
    expect(fabricasDoGrupo('SUSTENTACAO').map((f) => f.codigo)).toEqual(['GPS_GO', 'APP', 'PROMO_SUITE', 'ERP_SUST']);
    expect(fabricasDoGrupo('EVOLUCAO').map((f) => f.codigo)).toEqual(['ERP_EVOL', 'IR', 'LAB']);
    // Infra sustenta todas as fábricas: é área de apoio (22/11/2026).
    expect(fabricasDoGrupo('APOIO').map((f) => f.codigo)).toEqual(['INFRA', 'QUALIDADE', 'DESIGN', 'PRODUTOS']);
    expect(fabricasDoGrupo('HIBRIDA').map((f) => f.codigo)).toEqual(['STAGING']);
  });

  it('não repete código, e toda fábrica pertence a um grupo que existe', () => {
    expect(new Set(CODIGOS_FABRICA).size).toBe(CODIGOS_FABRICA.length);
    for (const f of FABRICAS) expect(GRUPOS.some((g) => g.id === f.grupo)).toBe(true);
  });

  it('"ERP" existe nos dois grupos: o nome longo diz de qual está falando', () => {
    expect(rotuloFabrica('ERP_SUST')).toBe('ERP');
    expect(rotuloFabrica('ERP_EVOL')).toBe('ERP');
    expect(rotuloFabricaLongo('ERP_SUST')).toBe('ERP · Sustentação');
    expect(rotuloFabricaLongo('ERP_EVOL')).toBe('ERP · Evolução');
    // Quem não se repete não ganha sufixo.
    expect(rotuloFabricaLongo('GPS_GO')).toBe('GPS / GO');
    // Código fora do organograma volta como veio (ex.: o balde "Sem squad").
    expect(rotuloFabricaLongo('Sem squad')).toBe('Sem squad');
    expect(grupoDaFabrica('Sem squad')).toBeNull();
  });

  it('áreas de apoio e Infra contam só horas; o resto é fábrica de entrega', () => {
    expect(AREAS).toEqual(['INFRA', 'QUALIDADE', 'DESIGN', 'PRODUTOS']);
    expect(ehArea('INFRA')).toBe(true);
    expect(ehArea('LAB')).toBe(false);
    expect(ehFabricaDeEntrega('LAB')).toBe(true);
    // Código desconhecido não é área nem fábrica.
    expect(ehArea('Sem squad')).toBe(false);
    expect(ehFabricaDeEntrega('Sem squad')).toBe(false);
  });

  it('K8 e FLEXX saíram do organograma (F4): o Épico deles só marca a hora como formato anterior', () => {
    for (const c of EPICOS_FORMATO_ANTERIOR) {
      expect(CODIGOS_FABRICA).not.toContain(c);
      expect(FABRICAS.some((f) => f.devops?.epicos?.includes(c))).toBe(false);
    }
  });

  it('cada fábrica tem cor própria, e STAGING e APP mantêm a de sempre', () => {
    expect(new Set(GRUPOS_HORAS.map((c) => fabricaColor(c))).size).toBe(GRUPOS_HORAS.length);
    expect(fabricaColor('STAGING')).toBe('hsl(205,55%,47%)');
    expect(fabricaColor('APP')).toBe('hsl(160,55%,42%)');
  });

  it('o CHECK da migration aceita exatamente os códigos do organograma', () => {
    // A migration MAIS RECENTE que redefine o CHECK é a que vale no banco.
    const dir = resolve(__dirname, '../../supabase/migrations');
    const ultima = readdirSync(dir).filter((n) => n.endsWith('.sql')).sort().reverse()
      .find((n) => readFileSync(resolve(dir, n), 'utf8').includes('check (squad in ('));
    const sql = readFileSync(resolve(dir, ultima!), 'utf8');
    const check = sql.slice(sql.indexOf('check (squad in ('));
    const noBanco = [...check.slice(0, check.indexOf('));')).matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1]);
    expect([...noBanco].sort()).toEqual([...CODIGOS_FABRICA].sort());
  });
});

describe('alocação parcial (pessoa em duas fábricas)', () => {
  const roster = [
    { colaborador: 'Ana Souza', squad: 'APP', alocacao_pct: 50 },
    { colaborador: 'Ana Souza', squad: 'IR', alocacao_pct: 50 },
    { colaborador: 'Bruno Lima', squad: 'GPS_GO', alocacao_pct: 50 },
    { colaborador: 'Caio Reis', squad: 'LAB' },
    { colaborador: 'Dora Paz', squad: 'IR', alocacao_pct: 70 },
    { colaborador: 'Dora Paz', squad: 'LAB', alocacao_pct: 30 },
  ];
  const mapa = buildAlocacaoMap(roster);

  it('rateia as horas pelo percentual, somando 1 por pessoa', () => {
    expect(casasDe(mapa, 'ana souza')).toEqual([
      { squad: 'APP', pct: 50, peso: 0.5 },
      { squad: 'IR', pct: 50, peso: 0.5 },
    ]);
    expect(casasDe(mapa, 'Dora Paz').map((c) => [c.squad, c.peso])).toEqual([['IR', 0.7], ['LAB', 0.3]]);
    for (const casas of mapa.values()) expect(casas.reduce((s, c) => s + c.peso, 0)).toBeCloseTo(1);
  });

  it('quem tem UMA fábrica a 50% leva todas as horas para ela: o percentual corta capacidade, não hora', () => {
    expect(casasDe(mapa, 'Bruno Lima')).toEqual([{ squad: 'GPS_GO', pct: 50, peso: 1 }]);
    // Sem percentual informado = 100.
    expect(casasDe(mapa, 'Caio Reis')).toEqual([{ squad: 'LAB', pct: 100, peso: 1 }]);
  });

  it('a casa principal é a de maior alocação; no empate, a primeira do organograma', () => {
    const principal = buildHomeSquadMap(roster);
    expect(homeSquadOf(principal, 'Dora Paz')).toBe('IR');
    expect(homeSquadOf(principal, 'Ana Souza')).toBe('APP');
    expect(homeSquadOf(principal, 'Ninguém')).toBeNull();
    expect(casasDe(mapa, 'Ninguém')).toEqual([]);
  });

  it('gestor numa fábrica e executor na outra continua contando hora', () => {
    const misto = [
      { colaborador: 'Eva Luz', squad: 'STAGING', conta_horas: false },
      { colaborador: 'Eva Luz', squad: 'PROMO_SUITE', conta_horas: true },
      { colaborador: 'Gil Sá', squad: 'PRODUTOS', conta_horas: false },
    ];
    expect([...buildNaoContaSet(misto)]).toEqual(['gil sa']);
  });
});

describe('jornada e atribuição de quem divide o tempo', () => {
  it('7 h/dia a 50% são 3,5 h/dia na fábrica; sem percentual vale 100%', () => {
    expect(horasDiaNaCasa({ capacidade_h_dia: 7, alocacao_pct: 50 })).toBe(3.5);
    expect(horasDiaNaCasa({ capacidade_h_dia: 7 })).toBe(7);
  });

  const casas = (linhas: Array<[string, number]>) =>
    casasDe(buildAlocacaoMap(linhas.map(([squad, pct]) => ({ colaborador: 'X', squad, alocacao_pct: pct }))), 'X');

  const d = (areaPath: string | null, epico: string | null) => lerDestino(destinoIdDoItem(areaPath, epico));
  const soPeso = (r: ReturnType<typeof repartirHoraPorPessoa>) => r.map(({ squad, peso }) => ({ squad, peso }));

  it('fábrica + Infra: hora no Épico [INFRA] vai para a Infra, hora na área LAB para o LAB, o resto 50/50', () => {
    const lab = casas([['LAB', 50], ['INFRA', 50]]);
    expect(soPeso(repartirHoraPorPessoa(lab, d('Flag.Planejamento', '[INFRA] - Squad')))).toEqual([{ squad: 'INFRA', peso: 1 }]);
    expect(soPeso(repartirHoraPorPessoa(lab, d('Flag.Planejamento\\LAB', null)))).toEqual([{ squad: 'LAB', peso: 1 }]);
    expect(soPeso(repartirHoraPorPessoa(lab, d('Flag.Planejamento', null)))).toEqual([
      { squad: 'LAB', peso: 0.5 }, { squad: 'INFRA', peso: 0.5 },
    ]);
  });

  it('a área ERP é das duas fábricas ERP: quem está nas duas divide pelo percentual', () => {
    const doisErp = casas([['ERP_SUST', 50], ['ERP_EVOL', 50]]);
    expect(soPeso(repartirHoraPorPessoa(doisErp, d('Flag.Planejamento\\ERP', null)))).toEqual([
      { squad: 'ERP_SUST', peso: 0.5 }, { squad: 'ERP_EVOL', peso: 0.5 },
    ]);
  });

  it('NUNCA perde hora: membro de fábrica que lança fora do lugar fica com a hora, marcada', () => {
    // Caso real de 22/11/2026: o IR lança na área do time, sem Épico — antes dava 0 h.
    const ir = casas([['IR', 100]]);
    expect(repartirHoraPorPessoa(ir, d('Flag.Planejamento\\IR', null))).toEqual([{ squad: 'IR', peso: 1, marca: 'casa' }]);
    // Pessoa do IR lançando na área ERP: hora do IR, marcada como cruzada.
    expect(repartirHoraPorPessoa(ir, d('Flag.Planejamento\\ERP', null))).toEqual([{ squad: 'IR', peso: 1, marca: 'cruzado' }]);
    // Item solto na raiz, sem Épico (bug de produção): hora da pessoa, marcada.
    expect(repartirHoraPorPessoa(ir, d('Flag.Planejamento', null))).toEqual([{ squad: 'IR', peso: 1, marca: 'sem_destino' }]);
    // Épico do formato anterior: hora da pessoa, marcada como formato anterior.
    expect(repartirHoraPorPessoa(casas([['ERP_SUST', 100]]), d('Flag.Planejamento', '[FLEXX] - Squad')))
      .toEqual([{ squad: 'ERP_SUST', peso: 1, marca: 'anterior' }]);
    // Fora do roster não há casa: quem chama põe em "Sem squad".
    expect(repartirHoraPorPessoa([], d('Flag.Planejamento\\IR', null))).toEqual([]);
  });

  it('área de apoio no item de uma fábrica é atendimento, não cruzado', () => {
    expect(marcaDaHora('QUALIDADE', d('Flag.Planejamento\\IR', null))).toBe('atendimento');
    expect(marcaDaHora('INFRA', d('Flag.Planejamento', '[STAGING] - Squad'))).toBe('atendimento');
    expect(marcaDaHora('GPS_GO', d('Flag.Planejamento', '[STAGING] - Squad'))).toBe('cruzado');
  });

  it('destino: área de time conhecida › Épico conhecido › área desconhecida › outro Épico › nada', () => {
    expect(segmentoArea('Flag.Planejamento')).toBeNull();
    expect(segmentoArea('Flag.Planejamento\\IR')).toBe('IR');
    // O item da área IR ganha da área, mesmo pendurado num Épico do formato anterior.
    expect(destinoIdDoItem('Flag.Planejamento\\IR', '[K8] - Squad')).toBe('area:IR');
    expect(destinoIdDoItem('Flag.Planejamento', '[STAGING] - Squad')).toBe('epico:STAGING');
    expect(destinoIdDoItem('Flag.Planejamento', '[IA] - SQUADLAB')).toBe('epico:IA');
    expect(lerDestino('epico:IA').codigos).toEqual(['LAB']);
    expect(destinoIdDoItem('Flag.Planejamento\\Novo', null)).toBe('area:Novo');
    expect(destinoIdDoItem('Flag.Planejamento', 'Dash Dinâmico')).toBe('outro:Dash Dinâmico');
    expect(destinoIdDoItem(null, null)).toBe(DESTINO_NENHUM);
    expect(lerDestino('epico:K8').anterior).toBe(true);
    expect(lerDestino('area:ERP').codigos).toEqual(['ERP_SUST', 'ERP_EVOL']);
    // Feature do DE-PARA debaixo de [K8]/[FLEXX]: destino nas fábricas do PARA, sem a marca "formato anterior".
    expect(destinoIdDoItem('Flag.Planejamento', '[K8] - Squad', 10004)).toBe('depara:10004');
    expect(lerDestino('depara:10004')).toMatchObject({ codigos: ['PROMO_SUITE'], anterior: false, rotulo: 'Feature SWFX (DE-PARA)' });
    expect(marcaDaHora('PROMO_SUITE', lerDestino('depara:10004'))).toBe('casa');
    expect(marcaDaHora('ERP_SUST', lerDestino('depara:10004'))).toBe('cruzado');
    expect(marcaDaHora('ERP_EVOL', lerDestino('depara:10012'))).toBe('casa');
    // Feature fora do DE-PARA, ou Épico que não é do formato anterior, segue a régua de antes.
    expect(destinoIdDoItem('Flag.Planejamento', '[K8] - Squad', 99999)).toBe('epico:K8');
    expect(destinoIdDoItem('Flag.Planejamento', '[STAGING] - Squad', 10004)).toBe('epico:STAGING');
    expect(destinoIdDoItem('Flag.Planejamento\\IR', '[FLEXX] - Squad', 13509)).toBe('area:IR');
    // Id desconhecido não quebra nem some: vira destino sem fábrica.
    expect(lerDestino('???').codigos).toEqual([]);
  });

  it('os pesos de qualquer pessoa somam 1 em qualquer destino', () => {
    const exemplos = [casas([['APP', 50], ['IR', 50]]), casas([['IR', 70], ['LAB', 30]]), casas([['QUALIDADE', 100]])];
    const destinos = ['area:IR', 'area:ERP', 'epico:APP', 'epico:K8', 'outro:X', DESTINO_NENHUM].map(lerDestino);
    for (const cs of exemplos) for (const dest of destinos) {
      expect(repartirHoraPorPessoa(cs, dest).reduce((s, p) => s + p.peso, 0)).toBeCloseTo(1);
    }
  });
});
