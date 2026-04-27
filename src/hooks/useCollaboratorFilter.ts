import { useState, useMemo, useCallback } from 'react';

type CollabMode = 'all' | 'custom';

interface UseCollaboratorFilterOptions {
  /** Called to determine if a collaborator matches the "default" preset */
  isDefault?: (name: string) => boolean;
  /** Pre-excluded names (stored as a Set of normalized keys) */
  initialExcluded?: Set<string>;
  /** Normalization fn applied before storing in the excluded Set */
  normalize?: (name: string) => string;
}

interface UseCollaboratorFilterReturn<TItem> {
  mode: CollabMode;
  excludedSet: Set<string>;
  setExcludedSet: React.Dispatch<React.SetStateAction<Set<string>>>;
  isSelected: (name: string) => boolean;
  setSelected: (name: string, selected: boolean) => void;
  selectedCount: (allNames: string[]) => number;
  filterItems: (items: TItem[], getField: (item: TItem) => string | null | undefined) => TItem[];
}

export function useCollaboratorFilter<TItem = unknown>({
  initialExcluded = new Set<string>(),
  normalize = (n) => n,
}: UseCollaboratorFilterOptions = {}): UseCollaboratorFilterReturn<TItem> {
  const [excludedSet, setExcludedSet] = useState<Set<string>>(initialExcluded);

  const isSelected = useCallback(
    (name: string) => !excludedSet.has(normalize(name)),
    [excludedSet, normalize]
  );

  const setSelected = useCallback(
    (name: string, selected: boolean) => {
      const key = normalize(name);
      setExcludedSet(prev => {
        const next = new Set(prev);
        if (selected) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [normalize]
  );

  const selectedCount = useCallback(
    (allNames: string[]) => allNames.filter(n => !excludedSet.has(normalize(n))).length,
    [excludedSet, normalize]
  );

  const filterItems = useCallback(
    (items: TItem[], getField: (item: TItem) => string | null | undefined): TItem[] => {
      if (excludedSet.size === 0) return items;
      return items.filter(item => {
        const name = getField(item);
        if (!name) return true;
        return !excludedSet.has(normalize(name));
      });
    },
    [excludedSet, normalize]
  );

  const mode: CollabMode = excludedSet.size === 0 ? 'all' : 'custom';

  return { mode, excludedSet, setExcludedSet, isSelected, setSelected, selectedCount, filterItems };
}
