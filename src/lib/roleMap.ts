/**
 * Camada de ofuscação de roles.
 * O banco usa nomes legíveis (admin, gestao, etc.).
 * No JS bundle, usamos códigos genéricos para dificultar inspeção.
 * 
 * IMPORTANTE: A segurança real está no RLS + SECURITY DEFINER no backend.
 * Isso é apenas defesa em profundidade (defense-in-depth).
 */

// Códigos internos — sem semântica óbvia
const _R = Object.freeze({
  s1: 'admin',
  s2: 'gestao',
  s3: 'qualidade',
  s4: 'operacional',
} as const);

type ObfuscatedKey = keyof typeof _R;
type DbRole = (typeof _R)[ObfuscatedKey];

// Mapa reverso: db role → código ofuscado
const _rev = Object.freeze(
  Object.fromEntries(Object.entries(_R).map(([k, v]) => [v, k])) as Record<DbRole, ObfuscatedKey>
);

/** Converte role do banco para código ofuscado */
export function toCode(dbRole: string | null): ObfuscatedKey | null {
  if (!dbRole) return null;
  return _rev[dbRole as DbRole] ?? null;
}

/** Converte código ofuscado de volta para role do banco (para chamadas RPC) */
export function fromCode(code: string | null): DbRole | null {
  if (!code) return null;
  return _R[code as ObfuscatedKey] ?? null;
}

/** Checks de permissão sem expor nomes de role */
export function hasElevated(code: string | null): boolean {
  return code === 's1';
}

export function hasManagement(code: string | null): boolean {
  return code === 's1' || code === 's2';
}

export function hasQuality(code: string | null): boolean {
  return code === 's3';
}

export function hasOperational(code: string | null): boolean {
  return code === 's4';
}

export function canPerformImport(code: string | null): boolean {
  return hasElevated(code) || code === 's2';
}

export function canManageConfig(code: string | null): boolean {
  return hasElevated(code);
}
