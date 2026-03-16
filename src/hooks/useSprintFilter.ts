import { useEffect, useMemo, useState } from 'react';

interface WithIterationPath {
  iteration_path?: string | null;
}

function parseSprintOrder(iterPath: string): { year: number; num: number } {
  const sMatch = iterPath.match(/\\S(\d+)-(\d{4})$/);
  if (sMatch) return { year: parseInt(sMatch[2], 10), num: parseInt(sMatch[1], 10) };

  const sprintMatch = iterPath.match(/\\Sprint\s*(\d+)$/);
  if (sprintMatch) return { year: 0, num: parseInt(sprintMatch[1], 10) };

  return { year: 0, num: 0 };
}

function sprintCompare(a: string, b: string): number {
  const pa = parseSprintOrder(a);
  const pb = parseSprintOrder(b);
  if (pa.year !== pb.year) return pa.year - pb.year;
  return pa.num - pb.num;
}

export function useSprintFilter<T extends WithIterationPath>(items: T[]) {
  const [selectedSprint, setSelectedSprint] = useState<string>('all');

  const sortedSprints = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.iteration_path) set.add(item.iteration_path);
    }
    return [...set].sort(sprintCompare);
  }, [items]);

  const currentSprint = sortedSprints.length > 0 ? sortedSprints[sortedSprints.length - 1] : null;

  useEffect(() => {
    if (selectedSprint === 'all') return;
    if (!sortedSprints.includes(selectedSprint)) {
      setSelectedSprint('all');
    }
  }, [selectedSprint, sortedSprints]);

  return {
    selectedSprint,
    setSelectedSprint,
    sortedSprints,
    currentSprint,
  };
}
