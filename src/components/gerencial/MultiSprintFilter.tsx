import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MultiSprintFilterProps {
  sprints: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  currentSprint?: string | null;
  disabled?: boolean;
  className?: string;
}

function sprintLabel(s: string) {
  return s?.split('\\').pop() || s;
}

function sprintSortValue(s: string): number {
  const label = sprintLabel(s).toUpperCase();
  const m = label.match(/^S(\d+)-(\d{4})$/);
  if (!m) return Number.MIN_SAFE_INTEGER;
  const sprint = Number(m[1]);
  const year = Number(m[2]);
  return year * 100 + sprint;
}

export function MultiSprintFilter({ sprints, selected, onChange, currentSprint, disabled = false, className }: MultiSprintFilterProps) {
  const [open, setOpen] = useState(false);
  const sortedSprints = useMemo(
    () => [...sprints].sort((a, b) => sprintSortValue(b) - sprintSortValue(a)),
    [sprints]
  );
  const allSelected = sortedSprints.length > 0 && selected.length === sortedSprints.length;
  const noneSelected = selected.length === 0;

  const toggle = (sprint: string) => {
    if (selected.includes(sprint)) {
      const next = selected.filter(s => s !== sprint);
      onChange(next);
    } else {
      onChange([...selected, sprint]);
    }
  };

  const selectAll = () => onChange(sortedSprints);
  const clearAll = () => onChange([]);
  const selectCurrentSprint = () => {
    if (!currentSprint) return;
    onChange([currentSprint]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={disabled} className={cn('w-[280px] justify-between font-normal', className)}>
          <span className="truncate text-sm">
            {noneSelected
              ? 'Nenhuma sprint'
              : allSelected
              ? 'Todas as Sprints'
              : selected.length === 1
                ? sprintLabel(selected[0])
                : `${selected.length} sprints selecionadas`}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-2" align="start">
        <div className="flex items-center justify-between px-2 pb-2 border-b border-border mb-1">
          <div className="flex items-center gap-3">
            <button onClick={selectAll} className="text-xs text-primary hover:underline">
              Marcar todas
            </button>
            <button
              onClick={clearAll}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Desmarcar todas
            </button>
          </div>
          {currentSprint && (
            <button onClick={selectCurrentSprint} className="text-xs text-primary hover:underline">
              Sprint atual
            </button>
          )}
        </div>
        <div className="max-h-[240px] overflow-y-auto space-y-0.5">
          {sortedSprints.map(sprint => {
            const isChecked = selected.includes(sprint);
            return (
              <label
                key={sprint}
                className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm"
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => toggle(sprint)}
                />
                <span className="truncate">{sprintLabel(sprint)}</span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
