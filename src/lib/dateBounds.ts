export function getDateBoundsFromItems<T>(
  items: T[],
  extractors: Array<(item: T) => string | null | undefined>
): { minDate?: Date; maxDate?: Date } {
  let minTs: number | null = null;
  let maxTs: number | null = null;

  for (const item of items) {
    for (const pick of extractors) {
      const value = pick(item);
      if (!value) continue;
      const ts = new Date(value).getTime();
      if (Number.isNaN(ts)) continue;
      if (minTs == null || ts < minTs) minTs = ts;
      if (maxTs == null || ts > maxTs) maxTs = ts;
    }
  }

  return {
    minDate: minTs != null ? new Date(minTs) : undefined,
    maxDate: maxTs != null ? new Date(maxTs) : undefined,
  };
}

export function getAvailableDateKeysFromItems<T>(
  items: T[],
  extractors: Array<(item: T) => string | null | undefined>
): Set<string> {
  const keys = new Set<string>();

  for (const item of items) {
    for (const pick of extractors) {
      const value = pick(item);
      if (!value) continue;

      const date = new Date(value);
      if (Number.isNaN(date.getTime())) continue;

      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      keys.add(`${y}-${m}-${d}`);
    }
  }

  return keys;
}
