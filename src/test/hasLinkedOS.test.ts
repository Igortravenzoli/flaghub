import { describe, expect, it } from 'vitest';
import { hasLinkedOS } from '@/hooks/useTicketAnalysisDB';
import type { DBTicket } from '@/types/database';

/**
 * Fixa a regra de "ticket tem OS vinculada".
 *
 * Existe porque a regra passou a ter DUAS implementações em 31/08/2026: esta,
 * em TypeScript, que classifica linha a linha na lista; e a de
 * `get_dashboard_summary` (migration 20260831170000), que conta os mesmos
 * tickets em SQL para os cinco números do topo da tela. Divergir significa o
 * cabeçalho contradizendo a lista logo abaixo dele.
 *
 * A tabela de `os` abaixo é o contrato que o SQL replica. A armadilha é que a
 * verdade do JavaScript não é a do SQL: `"0"` é verdadeiro e `0` é falso;
 * string vazia é falsa; objeto e array vazios são verdadeiros. Um
 * `(e->>'os') <> ''` no SQL pareceria equivalente e erraria três destes casos.
 */

const ticket = (over: Partial<DBTicket>): DBTicket => ({
  has_os: null,
  os_found_in_vdesk: null,
  os_number: null,
  vdesk_payload: null,
  ...over,
} as DBTicket);

describe('hasLinkedOS', () => {
  it('é falso quando nada indica OS', () => {
    expect(hasLinkedOS(ticket({}))).toBe(false);
  });

  describe('sinais diretos na linha', () => {
    it('os_found_in_vdesk true basta', () => {
      expect(hasLinkedOS(ticket({ os_found_in_vdesk: true }))).toBe(true);
    });

    it('has_os true basta', () => {
      expect(hasLinkedOS(ticket({ has_os: true }))).toBe(true);
    });

    it('os_number preenchido basta', () => {
      expect(hasLinkedOS(ticket({ os_number: 'OS-1234' }))).toBe(true);
    });

    it('os_number só com espaços NÃO conta', () => {
      expect(hasLinkedOS(ticket({ os_number: '   ' }))).toBe(false);
    });

    it('os_number vazio NÃO conta', () => {
      expect(hasLinkedOS(ticket({ os_number: '' }))).toBe(false);
    });
  });

  describe('verdade do JavaScript no campo `os` do vdesk_payload', () => {
    const casos: Array<[string, unknown, boolean]> = [
      ['string preenchida', 'OS-9', true],
      ['string vazia', '', false],
      ['string "0" — verdadeira em JS', '0', true],
      ['número zero — falso em JS', 0, false],
      ['número diferente de zero', 123, true],
      ['booleano true', true, true],
      ['booleano false', false, false],
      ['null', null, false],
      ['objeto vazio — verdadeiro em JS', {}, true],
      ['array vazio — verdadeiro em JS', [], true],
    ];

    for (const [nome, valor, esperado] of casos) {
      it(`${nome} => ${esperado}`, () => {
        expect(hasLinkedOS(ticket({ vdesk_payload: [{ os: valor }] as never }))).toBe(esperado);
      });
    }

    it('chave `os` ausente NÃO conta', () => {
      expect(hasLinkedOS(ticket({ vdesk_payload: [{ cliente: 'X' }] as never }))).toBe(false);
    });

    it('basta UM item do array ter os', () => {
      expect(hasLinkedOS(ticket({
        vdesk_payload: [{ os: '' }, { os: null }, { os: 'OS-7' }] as never,
      }))).toBe(true);
    });

    it('array vazio NÃO conta', () => {
      expect(hasLinkedOS(ticket({ vdesk_payload: [] as never }))).toBe(false);
    });

    it('payload que não é array NÃO conta', () => {
      expect(hasLinkedOS(ticket({ vdesk_payload: { os: 'OS-7' } as never }))).toBe(false);
    });
  });
});
