import { describe, expect, it } from 'vitest';

import { isFabricaInProgress } from '@/hooks/useFabricaKpis';

describe('isFabricaInProgress', () => {
  it('counts development states that are still not delivered', () => {
    expect(isFabricaInProgress('Em desenvolvimento')).toBe(true);
    expect(isFabricaInProgress('Aguardando Teste')).toBe(true);
    expect(isFabricaInProgress('Em Teste')).toBe(true);
    expect(isFabricaInProgress('Aguardando Deploy')).toBe(true);
  });

  it('does not count backlog or delivered states as in progress', () => {
    expect(isFabricaInProgress('New')).toBe(false);
    expect(isFabricaInProgress('To Do')).toBe(false);
    expect(isFabricaInProgress('Done')).toBe(false);
  });
});