import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { STAGE_LABELS, STAGE_COLORS } from '@/lib/pbiStageConfig';
import type { PbiStageEvent, PbiStageKey } from '@/types/pbi';
import { ArrowRight, GitBranch } from 'lucide-react';

interface PbiTimelineProps {
  events: PbiStageEvent[];
}

const STAGE_ACTION_LABELS: Record<string, string> = {
  backlog: 'Criado em',
  design: 'Design iniciado em',
  fabrica: 'Dev iniciado em',
  qualidade: 'Teste iniciado em',
  deploy: 'Aguardando deploy desde',
  done: 'Encerrado em',
  sprint_change: 'Migração de sprint',
};

function formatDateFull(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Color intensity based on days spent — longer = warmer colors */
function getDurationColor(days: number | null, isCurrent: boolean, isSprintChange: boolean): string {
  if (isSprintChange) return 'border-violet-400 bg-violet-50 dark:bg-violet-950/30';
  if (days == null) return isCurrent ? 'border-primary bg-primary/10' : 'border-border bg-muted/40';
  if (days <= 2) return 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30';
  if (days <= 5) return 'border-sky-400 bg-sky-50 dark:bg-sky-950/30';
  if (days <= 10) return 'border-amber-400 bg-amber-50 dark:bg-amber-950/30';
  if (days <= 20) return 'border-orange-400 bg-orange-50 dark:bg-orange-950/30';
  return 'border-red-400 bg-red-50 dark:bg-red-950/30';
}

function getDurationTextColor(days: number | null, isSprintChange: boolean): string {
  if (isSprintChange) return 'text-violet-600 dark:text-violet-400';
  if (days == null) return 'text-muted-foreground';
  if (days <= 2) return 'text-emerald-600 dark:text-emerald-400';
  if (days <= 5) return 'text-sky-600 dark:text-sky-400';
  if (days <= 10) return 'text-amber-600 dark:text-amber-400';
  if (days <= 20) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

export function PbiTimeline({ events }: PbiTimelineProps) {
  if (!events.length) {
    return <p className="text-xs text-muted-foreground">Histórico insuficiente para este item.</p>;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative overflow-x-auto pb-2">
        <div className="flex items-stretch gap-0 min-w-max">
          {events.map((ev, idx) => {
            const stage = (ev.stage_key || 'backlog') as string;
            const isSprintChange = stage === 'sprint_change';
            const stageLabel = isSprintChange
              ? `Sprint: ${ev.sprint_code || '?'}`
              : STAGE_LABELS[stage as PbiStageKey] || ev.stage_key;
            const actionLabel = STAGE_ACTION_LABELS[stage] || stageLabel;
            const entered = formatDateFull(ev.entered_at);
            const exited = ev.exited_at ? formatDateFull(ev.exited_at) : null;
            const isLast = idx === events.length - 1;
            const isCurrent = !ev.exited_at;
            const days = ev.duration_days;
            const durationColor = getDurationColor(days, isCurrent, isSprintChange);
            const durationTextColor = getDurationTextColor(days, isSprintChange);

            return (
              <div key={ev.id} className="flex items-stretch flex-shrink-0" style={{ animationDelay: `${idx * 80}ms` }}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={`relative flex flex-col items-center justify-between rounded-lg border-2 px-3 py-2.5 min-w-[130px] max-w-[170px] cursor-default transition-all duration-500 animate-fade-in hover:scale-105 hover:shadow-md ${durationColor} ${isCurrent ? 'ring-2 ring-primary/40 shadow-lg scale-[1.03]' : ''}`}
                    >
                      {/* Icon for sprint changes */}
                      {isSprintChange && (
                        <GitBranch className="h-3.5 w-3.5 text-violet-500 mb-0.5" />
                      )}

                      {/* Stage action label */}
                      <p className="text-[10px] font-semibold text-foreground/80 leading-tight text-center mb-1 line-clamp-2">
                        {actionLabel}
                      </p>

                      {/* Sprint label for migrations */}
                      {isSprintChange && ev.sprint_code && (
                        <p className="text-[11px] font-bold text-violet-700 dark:text-violet-300 text-center">
                          {ev.sprint_code}
                        </p>
                      )}

                      {/* Date */}
                      <p className="text-[11px] font-medium text-foreground text-center whitespace-nowrap">
                        {entered}
                      </p>

                      {/* Duration badge */}
                      <div className={`mt-1.5 text-xs font-bold ${durationTextColor} tabular-nums`}>
                        {days != null ? `${days}d` : isCurrent ? 'atual' : '—'}
                      </div>

                      {/* From → To sprint for sprint_change */}
                      {isSprintChange && ev.state_at_entry && (
                        <p className="text-[9px] text-muted-foreground text-center mt-0.5 truncate max-w-full" title={`${ev.state_at_entry} → ${ev.state_at_exit}`}>
                          {ev.state_at_entry} → {ev.state_at_exit}
                        </p>
                      )}

                      {/* Responsible */}
                      {ev.responsible_email && !isSprintChange && (
                        <p className="text-[9px] text-muted-foreground truncate max-w-full mt-1" title={ev.responsible_email}>
                          {ev.responsible_email.split('@')[0]}
                        </p>
                      )}

                      {/* Overflow indicator */}
                      {ev.is_overflow && !isSprintChange && (
                        <span className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-destructive flex items-center justify-center text-[8px] text-white font-bold">!</span>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[280px] space-y-1">
                    <p className="font-semibold">{stageLabel}</p>
                    <p>{entered}{exited ? ` → ${exited}` : ' → Atual'}</p>
                    {days != null && <p className="font-medium">{days} dia(s) nesta etapa</p>}
                    {isSprintChange && ev.state_at_entry && (
                      <p>De: {ev.state_at_entry} → Para: {ev.state_at_exit}</p>
                    )}
                    {!isSprintChange && ev.state_at_entry && <p>Entrada: {ev.state_at_entry}</p>}
                    {!isSprintChange && ev.state_at_exit && <p>Saída: {ev.state_at_exit}</p>}
                    {ev.sprint_code && !isSprintChange && <p>Sprint: {ev.sprint_code}</p>}
                    {ev.lead_area && <p>Área: {ev.lead_area}</p>}
                    {ev.responsible_email && <p>Responsável: {ev.responsible_email}</p>}
                    {ev.is_overflow && !isSprintChange && <p className="text-destructive font-medium">⚠ Transbordo</p>}
                  </TooltipContent>
                </Tooltip>

                {/* Arrow connector */}
                {!isLast && (
                  <div className="flex items-center self-center px-0.5">
                    <div className="h-[2px] w-3 bg-border" />
                    <ArrowRight className="h-3 w-3 text-muted-foreground/60 -ml-0.5" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}

/** Compact inline timeline for table rows — shows just dots */
export function PbiTimelineMini({ events }: PbiTimelineProps) {
  if (!events.length) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-0.5">
        {events.map((ev) => {
          const stage = (ev.stage_key || 'backlog') as string;
          const isSprintChange = stage === 'sprint_change';
          const stageColor = isSprintChange ? 'bg-violet-400' : (STAGE_COLORS[stage as PbiStageKey]?.split(' ')[0] || 'bg-muted');
          const isCurrent = !ev.exited_at;

          return (
            <Tooltip key={ev.id}>
              <TooltipTrigger asChild>
                <div
                  className={`h-2 w-2 rounded-full ${stageColor} ${isCurrent ? 'ring-1 ring-primary/50' : ''}`}
                />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {isSprintChange ? `Sprint: ${ev.sprint_code}` : (STAGE_LABELS[stage as PbiStageKey] || ev.stage_key)}
                {ev.duration_days != null ? ` • ${ev.duration_days}d` : ' • atual'}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
