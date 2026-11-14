import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  CODIGOS_FABRICA, FABRICAS, GRUPOS, ehFabricaDeEntrega, epicoDaFabrica, fabricasDoGrupo,
  grupoDaFabrica, rotuloFabrica, rotuloFabricaLongo,
} from '@/lib/fabricaOrganograma';
import {
  AREAS, GRUPOS_HORAS, SQUADS, buildAlocacaoMap, buildHomeSquadMap, buildNaoContaSet, casasDe, ehArea, homeSquadOf,
  horasDiaNaCasa, repartirHora,
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
  it('tem os três grupos de fábrica, na ordem de leitura, e as nove fábricas', () => {
    expect(GRUPOS.slice(0, 3).map((g) => g.rotulo)).toEqual(['Sustentação', 'Evolução', 'Híbrida']);
    expect(fabricasDoGrupo('SUSTENTACAO').map((f) => f.codigo)).toEqual(['GPS_GO', 'APP', 'PROMO_SUITE', 'ERP_SUST']);
    expect(fabricasDoGrupo('EVOLUCAO').map((f) => f.codigo)).toEqual(['ERP_EVOL', 'IR', 'LAB', 'INFRA']);
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

  it('uso cruzado só é mensurável onde a fábrica tem Épico de squad próprio', () => {
    expect(epicoDaFabrica('STAGING')).toBe('STAGING');
    expect(epicoDaFabrica('APP')).toBe('APP');
    for (const c of ['GPS_GO', 'PROMO_SUITE', 'ERP_SUST', 'ERP_EVOL', 'IR', 'LAB', 'INFRA', 'QUALIDADE']) {
      expect(epicoDaFabrica(c)).toBeNull();
    }
    // Todo Épico apontado tem que ser uma squad que os KPIs de sprint conhecem.
    for (const f of FABRICAS) if (f.epico) expect(SQUADS).toContain(f.epico);
  });

  it('cada fábrica tem cor própria, e STAGING e APP mantêm a de sempre', () => {
    expect(new Set(GRUPOS_HORAS.map((c) => fabricaColor(c))).size).toBe(GRUPOS_HORAS.length);
    expect(fabricaColor('STAGING')).toBe('hsl(205,55%,47%)');
    expect(fabricaColor('APP')).toBe('hsl(160,55%,42%)');
  });

  it('o CHECK da migration aceita exatamente os códigos do organograma', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/20261112120000_fabrica_organograma_grupos.sql'), 'utf8',
    );
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

  it('fábrica + Infra: hora de Épico de squad vai para a fábrica, hora de Infra vai para a Infra', () => {
    const lab = casas([['LAB', 50], ['INFRA', 50]]);
    expect(repartirHora(lab, { epico: 'K8', fora: false })).toEqual([{ squad: 'LAB', peso: 1 }]);
    expect(repartirHora(lab, { epico: null, fora: false })).toEqual([{ squad: 'LAB', peso: 1 }]);
    expect(repartirHora(lab, { epico: null, fora: true })).toEqual([{ squad: 'INFRA', peso: 1 }]);
  });

  it('o Épico da fábrica decide; fora dele a hora vai para a fábrica sem Épico próprio', () => {
    const stagingPromo = casas([['STAGING', 50], ['PROMO_SUITE', 50]]);
    expect(repartirHora(stagingPromo, { epico: 'STAGING', fora: false })).toEqual([{ squad: 'STAGING', peso: 1 }]);
    expect(repartirHora(stagingPromo, { epico: 'K8', fora: false })).toEqual([{ squad: 'PROMO_SUITE', peso: 1 }]);
  });

  it('quando nada decide, entra o rateio pelo percentual', () => {
    const doisErp = casas([['ERP_SUST', 50], ['ERP_EVOL', 50]]);
    expect(repartirHora(doisErp, { epico: 'FLEXX', fora: false })).toEqual([
      { squad: 'ERP_SUST', peso: 0.5 }, { squad: 'ERP_EVOL', peso: 0.5 },
    ]);
  });

  it('membro só de fábrica não recebe hora de fora; membro só de área recebe tudo', () => {
    expect(repartirHora(casas([['IR', 100]]), { epico: null, fora: true })).toEqual([]);
    expect(repartirHora(casas([['QUALIDADE', 100]]), { epico: 'APP', fora: false })).toEqual([{ squad: 'QUALIDADE', peso: 1 }]);
    expect(repartirHora([], { epico: 'APP', fora: false })).toEqual([]);
  });
});
