import { useEffect, useMemo, useState } from 'react';
import { extractSprintCodeFromPath, getCurrentOfficialSprintCode, parseSprintCode } from '@/lib/sprintCalendar';

interface WithIterationPath {
  iteration_path?: string | null;
}

function parseSprintOrder(iterPath: string): { year: number; num: number } {
  const sprintCode = extractSprintCodeFromPath(iterPath);
  const parsed = sprintCode ? parseSprintCode(sprintCode) : null;
  if (parsed) return { year: parsed.year, num: parsed.num };

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

  const currentSprint = useMemo(() => {
    if (sortedSprints.length === 0) return null;

    const officialCurrentCode = getCurrentOfficialSprintCode();
    const officialCurrentPath = sortedSprints.find((sp) => extractSprintCodeFromPath(sp) === officialCurrentCode);

    return officialCurrentPath || sortedSprints[sortedSprints.length - 1];
  }, [sortedSprints]);

  useEffect(() => {
    if (selectedSprint === 'all') {
      if (currentSprint) setSelectedSprint(currentSprint);
      return;
    }
    if (!sortedSprints.includes(selectedSprint)) {
      setSelectedSprint(currentSprint || 'all');
    }
  }, [selectedSprint, sortedSprints, currentSprint]);

  return {
    selectedSprint,
    setSelectedSprint,
    sortedSprints,
    currentSprint,
  };
}
