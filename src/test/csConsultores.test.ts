import { describe, expect, it } from 'vitest';
import {
  CONSULTORES_CS, agrupaVolumePorConsultorCS, isConsultorCS, normalizaNome,
} from '@/lib/csConsultores';

/**
 * Régua dos consultores do CS — a lista que move mesa e TV ao mesmo tempo.
 *
 * O quadro do time muda (21/08/2026: Bruna saiu, entrou Lucas Ferreira) e é
 * justamente aí que a coisa quebra em silêncio: um nome esquecido some do
 * gráfico sem erro nenhum, e ninguém percebe porque a barra simplesmente
 * não existe.
 */

const VOL = (nome: string, totalRegistros: number) => ({ nome, totalRegistros });

describe('CONSULTORES_CS — quadro atual', () => {
  it('são exatamente os 9, com Lucas no lugar de Bruna', () => {
    expect(CONSULTORES_CS).toEqual([
      'ailton', 'italo', 'leandro', 'vagner', 'guimaraes', 'ricardo', 'wilker', 'lucas', 'ronaldo',
    ]);
    expect(CONSULTORES_CS).toHaveLength(9);
    expect(CONSULTORES_CS).not.toContain('bruna');
  });

  it('os tokens estão normalizados (o filtro compara com nome sem acento e minúsculo)', () => {
    for (const t of CONSULTORES_CS) expect(t).toBe(normalizaNome(t));
  });
});

describe('isConsultorCS', () => {
  it('reconhece o time com a grafia que as fontes usam', () => {
    for (const nome of [
      'Ailton', 'Ítalo', 'ITALO', 'Leandro Faria', 'Vagner', 'Ricardo',
      'Wilker', 'Guimarães', 'Ronaldo', 'Lucas Ferreira',
    ]) {
      expect(isConsultorCS(nome), nome).toBe(true);
    }
  });

  it('quem saiu do time deixa de passar', () => {
    expect(isConsultorCS('Bruna')).toBe(false);
    expect(isConsultorCS('Bruna B. de Oliveira')).toBe(false);
  });

  it('não deixa entrar quem não é do CS', () => {
    for (const nome of ['Marcos', 'Paula', 'Rodolfo', 'Bruno Sassada']) {
      expect(isConsultorCS(nome), nome).toBe(false);
    }
  });
});

describe('agrupaVolumePorConsultorCS', () => {
  it('filtra os 9, soma duplicatas de grafia e ordena do maior para o menor', () => {
    const r = agrupaVolumePorConsultorCS([
      VOL('Ítalo', 30), VOL('Italo', 12),   // mesma pessoa, fontes diferentes
      VOL('Lucas Ferreira', 50),
      VOL('Marcos', 999),                    // fora do CS
      VOL('Ailton', 20),
    ]);
    expect(r).toEqual([
      { nome: 'Lucas Ferreira', registros: 50 },
      { nome: 'Ítalo', registros: 42 },      // 30 + 12, exibindo a 1ª grafia vista
      { nome: 'Ailton', registros: 20 },
    ]);
  });

  it('Bruna não entra mais no volume do CS', () => {
    const r = agrupaVolumePorConsultorCS([VOL('Bruna', 80), VOL('Ronaldo', 10)]);
    expect(r.map((x) => x.nome)).toEqual(['Ronaldo']);
  });
});
