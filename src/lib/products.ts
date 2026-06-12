/**
 * Produtos/sistemas conhecidos e helpers de extração a partir das tags do
 * Azure DevOps. Fonte única reutilizada pela Fábrica e pelo Gerencial QA.
 */

export const KNOWN_PRODUCTS = new Set([
  'FLEXX', 'FLEXXSALES', 'CONNECTSALES', 'FLEXXGO', 'FLEXXGPS',
  'HEISHOP', 'PORTALBROKER', 'PORTAL BROKER', 'FLEXXLEAD', 'QUICKONE',
  'CONNECTMERCHAN', 'FLEXXSPEED', 'FLEXXDECISION', 'FLEXXPROMO',
  'SUITEFLEXX', 'SMARTSALES',
]);

/**
 * Tags de processo/classificação que não são produto nem cliente.
 * Tudo que não for produto nem marcador é tratado como tag de CLIENTE
 * (ex.: HEINEKEN, NESTLE, RIONORTE, BROKERMAIS...).
 */
export const KNOWN_MARKERS = new Set([
  'BUG', 'PRIORIZACAO', 'RETORNO QA', 'MELHORIA', 'TRANSBORDO', 'AVIAO',
  'ESCOPOPAGO', 'CRITICIDADE', 'STAGING', 'ROADMAP2026', 'IA', 'BI', 'CTI',
  'FLAG', 'FLG', 'HNK', 'BEES', 'ASPIN', 'ESTOQUECHEK',
]);

export type TagKind = 'produto' | 'marcador' | 'cliente';

export function classifyTag(tag: string): TagKind {
  const upper = tag.trim().toUpperCase();
  if (KNOWN_PRODUCTS.has(upper)) return 'produto';
  if (KNOWN_MARKERS.has(upper)) return 'marcador';
  return 'cliente';
}

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

/** Extract client tags (anything that is neither product nor process marker) */
export function extractClients(tags: string | null): string[] {
  if (!tags) return [];
  return tags
    .split(';')
    .map(t => t.trim())
    .filter(t => t !== '' && classifyTag(t) === 'cliente');
}
