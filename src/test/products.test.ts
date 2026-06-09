import { describe, expect, it } from 'vitest';
import { extractProducts, normalizeProduct, KNOWN_PRODUCTS } from '@/lib/products';

describe('products', () => {
  it('extracts only known product tags from a tags string', () => {
    expect(extractProducts('FLEXX;Retorno de QA;FLEXXGO')).toEqual(['FLEXX', 'FLEXXGO']);
    expect(extractProducts('Avião;Bug')).toEqual([]);
    expect(extractProducts(null)).toEqual([]);
    expect(extractProducts('')).toEqual([]);
  });

  it('matches product tags case-insensitively and trimmed', () => {
    expect(extractProducts(' flexx ; portalbroker ')).toEqual(['flexx', 'portalbroker']);
  });

  it('normalizes canonical product names', () => {
    expect(normalizeProduct('PORTALBROKER')).toBe('Portal Broker');
    expect(normalizeProduct('connectmerchan')).toBe('ConnectMerchan');
    expect(normalizeProduct('flexx')).toBe('Flexx');
  });

  it('exposes the known products allowlist', () => {
    expect(KNOWN_PRODUCTS.has('FLEXXSALES')).toBe(true);
    expect(KNOWN_PRODUCTS.has('UNKNOWN')).toBe(false);
  });
});

// Replica a lógica de agregação por produto usada no GerencialQaPanel
// (retornos por produto / volumetria por produto) para garantir o rateio por tag.
type Item = { tags: string | null; qa_return_count: number };

function aggregateByProduct(items: Item[], metric: 'retornos' | 'itens') {
  const map = new Map<string, number>();
  for (const it of items) {
    if (metric === 'retornos' && it.qa_return_count <= 0) continue;
    const produtos = extractProducts(it.tags);
    const labels = produtos.length > 0 ? produtos.map(normalizeProduct) : ['Sem produto'];
    for (const p of labels) {
      map.set(p, (map.get(p) || 0) + (metric === 'retornos' ? it.qa_return_count : 1));
    }
  }
  return Object.fromEntries(map);
}

describe('aggregateByProduct (QA panel logic)', () => {
  const items: Item[] = [
    { tags: 'FLEXX', qa_return_count: 2 },
    { tags: 'FLEXX;FLEXXGO', qa_return_count: 1 },
    { tags: null, qa_return_count: 3 },
    { tags: 'FLEXXGO', qa_return_count: 0 },
  ];

  it('sums return cycles per product (skips zero-return items)', () => {
    expect(aggregateByProduct(items, 'retornos')).toEqual({
      FLEXX: 3,
      FLEXXGO: 1,
      'Sem produto': 3,
    });
  });

  it('counts items per product including zero-return items', () => {
    expect(aggregateByProduct(items, 'itens')).toEqual({
      FLEXX: 2,
      FLEXXGO: 2,
      'Sem produto': 1,
    });
  });
});
