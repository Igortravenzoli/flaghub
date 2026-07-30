/**
 * Parsing dos campos das listas SG (SharePoint/SGSI) espelhadas em `public.sgsi_items`.
 *
 * Extraído de `src/hooks/useBIInfra.ts` (INC-1) para que consumidores enxutos —
 * hoje `useCsIncidentesDeclarados`, do card de Customer Service — usem o mesmo
 * parsing sem arrastar a paginação do espelho inteiro (>3,7k itens, 6 listas).
 *
 * `useBIInfra.ts` RE-EXPORTA `NameValue`, `SimNao`, `SgsiRawItem`, `countBy` e
 * `simNaoOf` — não remova esses re-exports: `src/test/sgsiBuild.test.ts`,
 * `src/test/infraExecutivoTv.test.tsx` e `BIInfraSgsiPanel.tsx` importam de lá.
 *
 * Os `fields` são jsonb chaveado pelo displayName da coluna do SharePoint,
 * resolvido na edge function `sharepoint-sync-sgsi`.
 */

export interface NameValue {
  name: string;
  value: number;
}

export interface SimNao {
  sim: number;
  nao: number;
}

/** Linha crua do espelho (`public.sgsi_items`). */
export interface SgsiRawItem {
  list_key: string; // '010' | '011' | '012' | '014' | '017' | '018'
  item_id: number;
  fields: Record<string, unknown>;
  created_sp: string | null;
  modified_sp: string | null;
}

/** Placeholder de "sem valor". Nunca renderize `0` no lugar dele. */
export const DASH = '—';

/** Minúsculas sem acento. Escape explícito das combining marks
 *  (̀-ͯ) — o range literal se corrompe em edição de arquivo. */
export function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Valores de um campo: colunas multi-escolha do SharePoint chegam como array
 *  — ou como STRING JSON de array ('["Froneri"]'), que também expandimos. */
export function valuesOf(item: SgsiRawItem, ...names: string[]): string[] {
  for (const name of names) {
    const v = item.fields[name];
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v)) {
      const arr = v.map((x) => String(x)).filter(Boolean);
      if (arr.length > 0) return arr;
      continue;
    }
    if (typeof v === 'string') {
      const s = v.trim();
      if (s.startsWith('[') && s.endsWith(']')) {
        try {
          const arr = JSON.parse(s);
          if (Array.isArray(arr)) {
            const out = arr.map((x) => String(x)).filter(Boolean);
            if (out.length > 0) return out;
            continue;
          }
        } catch { /* texto normal que começa com colchete */ }
      }
      return [v];
    }
    if (typeof v === 'number' || typeof v === 'boolean') return [String(v)];
  }
  return [];
}

export function str(item: SgsiRawItem, ...names: string[]): string {
  return valuesOf(item, ...names).join(', ');
}

/**
 * Número do campo, ou `null` quando ausente/ilegível.
 * Prefira a `num()` sempre que "não preenchido" ≠ "zero" — é o caso do
 * "Tempo Downtime": 0h declarado e campo vazio são fatos diferentes.
 */
export function numOrNull(item: SgsiRawItem, ...names: string[]): number | null {
  const raw = str(item, ...names).replace(',', '.').trim();
  if (raw === '') return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** Legado: 0 quando ausente. Mantido byte-compatível com o `num` de `useBIInfra`. */
export function num(item: SgsiRawItem, ...names: string[]): number {
  return numOrNull(item, ...names) ?? 0;
}

/** Campos Sim/Não do SharePoint chegam como boolean ou texto ("Sim"/"Yes"). */
export function isSim(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'string') return /^(s|y|true)/i.test(value.trim());
  return false;
}

export function isNao(value: unknown): boolean {
  if (value === false) return true;
  if (typeof value === 'string') return /^(n|false)/i.test(value.trim());
  return false;
}

export function countBy(items: SgsiRawItem[], ...fieldNames: string[]): NameValue[] {
  const map = new Map<string, number>();
  for (const item of items) {
    for (const v of valuesOf(item, ...fieldNames)) {
      map.set(v, (map.get(v) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function simNaoOf(items: SgsiRawItem[], ...fieldNames: string[]): SimNao {
  let sim = 0, nao = 0;
  for (const item of items) {
    for (const name of fieldNames) {
      const v = item.fields[name];
      if (v === null || v === undefined || v === '') continue;
      if (isSim(v)) sim++;
      else if (isNao(v)) nao++;
      break;
    }
  }
  return { sim, nao };
}

export function statusMatches(item: SgsiRawItem, fieldNames: string[], pattern: RegExp): boolean {
  return pattern.test(str(item, ...fieldNames));
}

export function recentes(items: SgsiRawItem[], limit: number): SgsiRawItem[] {
  return [...items]
    .sort((a, b) => (b.modified_sp ?? b.created_sp ?? '').localeCompare(a.modified_sp ?? a.created_sp ?? ''))
    .slice(0, limit);
}
