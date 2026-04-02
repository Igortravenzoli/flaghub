import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MultiSprintFilterProps {
  sprints: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
}

function sprintLabel(s: string) {
  return s?.split('\\').pop() || s;
}

export function MultiSprintFilter({ sprints, selected, onChange, className }: MultiSprintFilterProps) {
  const [open, setOpen] = useState(false);
  const allSelected = selected.length === 0 || selected.length === sprints.length;

  const toggle = (sprint: string) => {
    if (selected.includes(sprint)) {
      const next = selected.filter(s => s !== sprint);
      onChange(next);
    } else {
      onChange([...selected, sprint]);
    }
  };

  const selectAll = () => onChange([]);
  const clearAll = () => onChange([]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('w-[280px] justify-between font-normal', className)}>
          <span className="truncate text-sm">
            {allSelected
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
          <button
            onClick={selectAll}
            className="text-xs text-primary hover:underline"
          >
            Selecionar todas
          </button>
          {selected.length > 0 && (
            <button
              onClick={clearAll}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Limpar
            </button>
          )}
        </div>
        <div className="max-h-[240px] overflow-y-auto space-y-0.5">
          {sprints.map(sprint => {
            const isChecked = allSelected || selected.includes(sprint);
            return (
              <label
                key={sprint}
                className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm"
              >
                <Checkbox
                  checked={isChecked && !allSelected ? true : allSelected ? true : false}
                  onCheckedChange={() => {
                    if (allSelected) {
                      // switching from "all" to single deselect
                      onChange(sprints.filter(s => s !== sprint));
                    } else {
                      toggle(sprint);
                    }
                  }}
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
