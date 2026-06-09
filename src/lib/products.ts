/**
 * Produtos/sistemas conhecidos e helpers de extração a partir das tags do
 * Azure DevOps. Fonte única reutilizada pela Fábrica e pelo Gerencial QA.
 */

export const KNOWN_PRODUCTS = new Set([
  'FLEXX', 'FLEXXSALES', 'CONNECTSALES', 'FLEXXGO', 'FLEXXGPS',
  'HEISHOP', 'PORTALBROKER', 'PORTAL BROKER', 'FLEXXLEAD', 'QUICKONE',
  'CONNECTMERCHAN',
]);

/** Canonical product name normalization */
export function normalizeProduct(tag: string): string {
  const upper = tag.toUpperCase();
  if (upper === 'PORTALBROKER' || upper === 'PORTAL BROKER') return 'Portal Broker';
  if (upper === 'CONNECTMERCHAN') return 'ConnectMerchan';
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

/** Extract only known product tags from a tags string */
export function extractProducts(tags: string | null): string[] {
  if (!tags) return [];
  return tags.split(';').map(t => t.trim()).filter(t => KNOWN_PRODUCTS.has(t.toUpperCase()));
}
