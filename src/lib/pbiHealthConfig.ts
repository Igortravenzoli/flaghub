import type { PbiHealthStatus, PbiLifecycleSummary, PbiStageKey } from '@/types/pbi';

export const DEFAULT_HEALTH_THRESHOLDS: Record<
  PbiStageKey,
  { warn_days: number; critical_days: number }
> = {
  backlog: { warn_days: 14, critical_days: 30 },
  design: { warn_days: 7, critical_days: 14 },
  fabrica: { warn_days: 14, critical_days: 21 },
  qualidade: { warn_days: 5, critical_days: 10 },
  deploy: { warn_days: 3, critical_days: 7 },
  done: { warn_days: 0, critical_days: 0 },
};

function getCurrentStageDays(lifecycle: PbiLifecycleSummary): number {
  switch (lifecycle.current_stage) {
    case 'backlog':
      return lifecycle.backlog_days;
    case 'design':
      return lifecycle.design_days;
    case 'fabrica':
      return lifecycle.fabrica_days;
    case 'qualidade':
      return lifecycle.qualidade_days;
    case 'deploy':
      return lifecycle.deploy_days;
    default:
      return 0;
  }
}

export function classifyStageHealth(
  daysInStage: number,
  stageKey: PbiStageKey,
  thresholds = DEFAULT_HEALTH_THRESHOLDS,
): PbiHealthStatus {
  const stageThreshold = thresholds[stageKey];
  if (!stageThreshold) return 'verde';

  if (daysInStage > stageThreshold.critical_days) return 'vermelho';
  if (daysInStage > stageThreshold.warn_days) return 'amarelo';
  return 'verde';
}

export function computePbiHealth(
  lifecycle: PbiLifecycleSummary,
  thresholds = DEFAULT_HEALTH_THRESHOLDS,
): PbiHealthStatus {
  if (lifecycle.overflow_count > 0) return 'vermelho';
  if (lifecycle.sprint_migration_count > 1) return 'vermelho';
  if (lifecycle.qa_return_count > 1) return 'vermelho';

  const stage = (lifecycle.current_stage || 'backlog') as PbiStageKey;
  const stageHealth = classifyStageHealth(getCurrentStageDays(lifecycle), stage, thresholds);
  if (stageHealth === 'vermelho') return 'vermelho';

  if (lifecycle.sprint_migration_count === 1) return 'amarelo';
  if (lifecycle.qa_return_count === 1) return 'amarelo';
  if (stageHealth === 'amarelo') return 'amarelo';

  return 'verde';
}
