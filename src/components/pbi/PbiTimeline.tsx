import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { STAGE_LABELS, STAGE_COLORS } from '@/lib/pbiStageConfig';
import type { PbiStageEvent, PbiStageKey } from '@/types/pbi';
import { ArrowRight } from 'lucide-react';

interface PbiTimelineProps {
  events: PbiStageEvent[];
}

const STAGE_ORDER: PbiStageKey[] = ['backlog', 'design', 'fabrica', 'qualidade', 'deploy', 'done'];

const STAGE_ACTION_LABELS: Record<PbiStageKey, string> = {
  backlog: 'Criado em',
  design: 'Design iniciado em',
  fabrica: 'Desenvolvimento iniciado em',
  qualidade: 'Teste iniciado em',
  deploy: 'Aguardando deploy desde',
  done: 'Encerrado em',
};

function formatDateBR(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** Color intensity based on days spent — longer = warmer colors */
function getDurationColor(days: number | null, isCurrent: boolean): string {
  if (days == null) return isCurrent ? 'border-primary bg-primary/10' : 'border-border bg-muted/40';
  if (days <= 2) return 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30';
  if (days <= 5) return 'border-sky-400 bg-sky-50 dark:bg-sky-950/30';
  if (days <= 10) return 'border-amber-400 bg-amber-50 dark:bg-amber-950/30';
  if (days <= 20) return 'border-orange-400 bg-orange-50 dark:bg-orange-950/30';
  return 'border-red-400 bg-red-50 dark:bg-red-950/30';
}

function getDurationTextColor(days: number | null): string {
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

  const maxDays = Math.max(...events.map(ev => ev.duration_days ?? 0), 1);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative overflow-x-auto pb-2">
        <div className="flex items-stretch gap-0 min-w-max">
          {events.map((ev, idx) => {
            const stage = (ev.stage_key || 'backlog') as PbiStageKey;
            const stageLabel = STAGE_LABELS[stage] || ev.stage_key;
            const actionLabel = STAGE_ACTION_LABELS[stage] || stageLabel;
            const entered = formatDateBR(ev.entered_at);
            const enteredShort = formatDateShort(ev.entered_at);
            const exited = ev.exited_at ? formatDateBR(ev.exited_at) : null;
            const isLast = idx === events.length - 1;
            const isCurrent = !ev.exited_at;
            const days = ev.duration_days;
            const durationColor = getDurationColor(days, isCurrent);
            const durationTextColor = getDurationTextColor(days);

            return (
              <div key={ev.id} className="flex items-stretch flex-shrink-0" style={{ animationDelay: `${idx * 120}ms` }}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={`relative flex flex-col items-center justify-between rounded-lg border-2 px-3 py-2 min-w-[110px] max-w-[140px] cursor-default transition-all duration-500 animate-fade-in hover:scale-105 hover:shadow-md ${durationColor} ${isCurrent ? 'ring-2 ring-primary/40 shadow-lg scale-[1.03]' : ''}`}
                    >
                      {/* Stage action label */}
                      <p className="text-[10px] font-semibold text-foreground/80 leading-tight text-center mb-1 line-clamp-2">
                        {actionLabel}
                      </p>

                      {/* Date */}
                      <p className="text-[11px] font-medium text-foreground text-center">
                        {enteredShort}
                      </p>

                      {/* Duration badge */}
                      <div className={`mt-1.5 text-xs font-bold ${durationTextColor} tabular-nums`}>
                        {days != null ? `${days}d` : isCurrent ? 'atual' : '—'}
                      </div>

                      {/* Responsible */}
                      {ev.responsible_email && (
                        <p className="text-[9px] text-muted-foreground truncate max-w-full mt-1" title={ev.responsible_email}>
                          {ev.responsible_email.split('@')[0]}
                        </p>
                      )}

                      {/* Overflow indicator */}
                      {ev.is_overflow && (
                        <span className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-destructive flex items-center justify-center text-[8px] text-white font-bold">!</span>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[260px] space-y-1">
                    <p className="font-semibold">{stageLabel}</p>
                    <p>{entered}{exited ? ` → ${exited}` : ' → Atual'}</p>
                    {days != null && <p className="font-medium">{days} dia(s) nesta etapa</p>}
                    {ev.state_at_entry && <p>Entrada: {ev.state_at_entry}</p>}
                    {ev.state_at_exit && <p>Saída: {ev.state_at_exit}</p>}
                    {ev.sprint_code && <p>Sprint: {ev.sprint_code}</p>}
                    {ev.lead_area && <p>Área: {ev.lead_area}</p>}
                    {ev.responsible_email && <p>Responsável: {ev.responsible_email}</p>}
                    {ev.is_overflow && <p className="text-destructive font-medium">⚠ Transbordo</p>}
                  </TooltipContent>
                </Tooltip>

                {/* Arrow connector */}
                {!isLast && (
                  <div className="flex items-center self-center px-0.5">
                    <div className="h-[2px] w-4 bg-border" />
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 -ml-0.5" />
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
          const stage = (ev.stage_key || 'backlog') as PbiStageKey;
          const stageColor = STAGE_COLORS[stage] || 'bg-muted';
          const bgClass = stageColor.split(' ')[0];
          const isCurrent = !ev.exited_at;

          return (
            <Tooltip key={ev.id}>
              <TooltipTrigger asChild>
                <div
                  className={`h-2 w-2 rounded-full ${bgClass} ${isCurrent ? 'ring-1 ring-primary/50' : ''}`}
                />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {STAGE_LABELS[stage] || ev.stage_key}
                {ev.duration_days != null ? ` • ${ev.duration_days}d` : ' • atual'}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
