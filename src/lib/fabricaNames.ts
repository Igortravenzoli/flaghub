/**
 * Rótulo curto de fábrica a partir do título do Épico raiz.
 * "[K8] - Squad" → "K8"; "FLEXX Squad" → "FLEXX".
 *
 * Fonte única da verdade para normalizar nomes de fábrica/squad — usada tanto
 * na aba Gerencial quanto nas visões que cruzam snapshots por fábrica.
 */
export function cleanFabricaName(name: string): string {
  const bracket = name.match(/\[([^\]]+)\]/);
  if (bracket) return bracket[1].trim().toUpperCase();
  return name.replace(/\s*-?\s*squad\s*$/i, '').trim();
}
