import { Badge } from '@/components/ui/badge';
import { STAGE_LABELS, STAGE_COLORS } from '@/lib/pbiStageConfig';
import type { PbiStageEvent, PbiStageKey } from '@/types/pbi';

interface PbiTimelineProps {
  events: PbiStageEvent[];
}

export function PbiTimeline({ events }: PbiTimelineProps) {
  if (!events.length) {
    return <p className="text-xs text-muted-foreground">Sem histórico de esteira disponível.</p>;
  }

  return (
    <div className="space-y-2">
      {events.map((ev) => {
        const stage = (ev.stage_key || 'backlog') as PbiStageKey;
        const stageLabel = STAGE_LABELS[stage] || ev.stage_key;
        const stageColor = STAGE_COLORS[stage] || 'bg-muted text-muted-foreground border-border';
        const entered = new Date(ev.entered_at).toLocaleDateString('pt-BR');
        const exited = ev.exited_at ? new Date(ev.exited_at).toLocaleDateString('pt-BR') : 'Atual';

        return (
          <div key={ev.id} className="rounded-md border border-border/60 p-2">
            <div className="flex items-center justify-between gap-2">
              <Badge className={`text-xs border ${stageColor}`}>{stageLabel}</Badge>
              <span className="text-xs text-muted-foreground">{entered} - {exited}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {ev.duration_days != null ? `${ev.duration_days} dia(s)` : 'Duração em cálculo'}
              {ev.sprint_code ? ` • ${ev.sprint_code}` : ''}
            </p>
          </div>
        );
      })}
    </div>
  );
}
