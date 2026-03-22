import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { STAGE_LABELS, STAGE_COLORS } from '@/lib/pbiStageConfig';
import type { PbiStageEvent, PbiStageKey } from '@/types/pbi';

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
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function PbiTimeline({ events }: PbiTimelineProps) {
  if (!events.length) {
    return <p className="text-xs text-muted-foreground">Histórico insuficiente para este item.</p>;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative flex items-start gap-0 overflow-x-auto pb-2">
        {events.map((ev, idx) => {
          const stage = (ev.stage_key || 'backlog') as PbiStageKey;
          const stageLabel = STAGE_LABELS[stage] || ev.stage_key;
          const stageColor = STAGE_COLORS[stage] || 'bg-muted text-muted-foreground border-border';
          const actionLabel = STAGE_ACTION_LABELS[stage] || stageLabel;
          const entered = formatDateBR(ev.entered_at);
          const exited = ev.exited_at ? formatDateBR(ev.exited_at) : null;
          const isLast = idx === events.length - 1;
          const isCurrent = !ev.exited_at;

          return (
            <div key={ev.id} className="flex items-start flex-shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center gap-1 cursor-default">
                    <div
                      className={`h-7 w-7 rounded-full border-2 flex items-center justify-center text-[9px] font-bold transition-transform ${stageColor} ${isCurrent ? 'ring-2 ring-primary/40 scale-110' : ''}`}
                    >
                      {STAGE_ORDER.indexOf(stage) + 1 || '?'}
                    </div>
                    <span className="text-[9px] text-muted-foreground leading-tight text-center max-w-[64px] truncate">
                      {stageLabel.split(' ')[0]}
                    </span>
                    <span className="text-[8px] text-muted-foreground/60">
                      {ev.duration_days != null ? `${ev.duration_days}d` : isCurrent ? 'atual' : ''}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-[220px]">
                  <p className="font-semibold">{actionLabel}</p>
                  <p>{entered}{exited ? ` → ${exited}` : ' → Atual'}</p>
                  {ev.duration_days != null && <p>{ev.duration_days} dia(s)</p>}
                  {ev.state_at_entry && <p>Entrada: {ev.state_at_entry}</p>}
                  {ev.state_at_exit && <p>Saída: {ev.state_at_exit}</p>}
                  {ev.sprint_code && <p>Sprint: {ev.sprint_code}</p>}
                  {ev.lead_area && <p>Área: {ev.lead_area}</p>}
                  {ev.is_overflow && <p className="text-destructive font-medium">⚠ Transbordo</p>}
                </TooltipContent>
              </Tooltip>

              {!isLast && (
                <div className="flex items-center self-center mt-0.5 pt-1">
                  <div className="h-[2px] w-6 bg-border" />
                  <div className="h-0 w-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-l-[4px] border-l-border" />
                </div>
              )}
            </div>
          );
        })}
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
