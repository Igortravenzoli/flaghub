import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PbiHealthBadge } from '@/components/pbi/PbiHealthBadge';
import { PbiTimeline } from '@/components/pbi/PbiTimeline';
import { usePbiLifecycle } from '@/hooks/usePbiLifecycle';
import { STAGE_LABELS } from '@/lib/pbiStageConfig';
import type { PbiStageKey } from '@/types/pbi';

interface PbiDetailDrawerProps {
  workItemId: number;
}

function formatSprintInitial(value: string | null | undefined): { current: string | null; previous: string | null; changedAt: string | null } {
  if (!value) return { current: null, previous: null, changedAt: null };

  try {
    const parsed = JSON.parse(value);
    const current = parsed?.newValue ? String(parsed.newValue).split('\\').pop() || parsed.newValue : null;
    const previous = parsed?.oldValue ? String(parsed.oldValue).split('\\').pop() || parsed.oldValue : null;
    const changedAt = parsed?.revisedDate
      ? new Date(parsed.revisedDate).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : null;

    return { current, previous, changedAt };
  } catch {
    return {
      current: value.split('\\').pop() || value,
      previous: null,
      changedAt: null,
    };
  }
}

function InfoItem({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value ?? '—'}</p>
    </div>
  );
}

export function PbiDetailDrawer({ workItemId }: PbiDetailDrawerProps) {
  const { lifecycle, health, stageEvents, isLoading } = usePbiLifecycle(workItemId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const stage = (lifecycle?.current_stage || 'backlog') as PbiStageKey;
  const stageLabel = STAGE_LABELS[stage] || lifecycle?.current_stage || '—';
  const sprintInitial = formatSprintInitial(lifecycle?.first_committed_sprint);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <PbiHealthBadge status={health?.health_status} />
        {lifecycle?.overflow_count ? <Badge variant="destructive">Transbordo real: {lifecycle.overflow_count}</Badge> : null}
        {lifecycle?.sprint_migration_count ? <Badge variant="secondary">Migrações: {lifecycle.sprint_migration_count}</Badge> : null}
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-2 p-3">
          <InfoItem label="Etapa atual" value={stageLabel} />
          <InfoItem label="Lead time total" value={lifecycle?.total_lead_time_days != null ? `${lifecycle.total_lead_time_days} dias` : null} />
          <InfoItem label="QA retorno" value={lifecycle?.qa_return_count ?? 0} />
          <InfoItem label="Sprint inicial" value={sprintInitial.current} />
          <InfoItem label="Sprint anterior" value={sprintInitial.previous} />
          <InfoItem label="Alterado em" value={sprintInitial.changedAt} />
        </CardContent>
      </Card>

      {health?.health_reasons?.length ? (
        <Card>
          <CardContent className="p-3 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Razões de saúde</p>
            {health.health_reasons.map((reason, idx) => (
              <p key={`${reason}-${idx}`} className="text-xs text-foreground">• {reason}</p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Timeline da esteira</p>
          <PbiTimeline events={stageEvents} />
        </CardContent>
      </Card>
    </div>
  );
}
