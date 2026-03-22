export type PbiHealthStatus = 'verde' | 'amarelo' | 'vermelho';

export type PbiStageKey =
  | 'backlog'
  | 'design'
  | 'fabrica'
  | 'qualidade'
  | 'deploy'
  | 'done';

export interface PbiStageEvent {
  id: number;
  work_item_id: number;
  sector: string | null;
  stage_key: PbiStageKey | string;
  entered_at: string;
  exited_at: string | null;
  duration: number | null;
  duration_days: number | null;
  state_at_entry: string | null;
  state_at_exit: string | null;
  lead_area: string | null;
  sprint_path: string | null;
  sprint_code: string | null;
  responsible_email: string | null;
  inference_method: 'state_pattern' | 'pipeline_role' | 'iteration_suffix' | 'fallback';
  is_overflow: boolean;
}

export interface PbiLifecycleSummary {
  work_item_id: number;
  sector: string | null;
  current_stage: PbiStageKey | string | null;
  has_design_stage: boolean;
  first_committed_sprint: string | null;
  last_committed_sprint: string | null;
  lead_owner_at_commitment: string | null;
  overflow_stage: PbiStageKey | string | null;
  total_lead_time_days: number | null;
  backlog_days: number;
  design_days: number;
  fabrica_days: number;
  qualidade_days: number;
  deploy_days: number;
  sprint_migration_count: number;
  overflow_count: number;
  overflow_by_stage: Record<string, number> | null;
  qa_return_count: number;
  computed_at: string;
}

export interface PbiHealthSummary {
  work_item_id: number;
  sector: string | null;
  health_status: PbiHealthStatus;
  bottleneck_stage: PbiStageKey | string | null;
  health_reasons: string[] | null;
  computed_at: string;
}

export interface PbiBottleneckRow {
  stage_key: PbiStageKey | string;
  stage_label: string;
  avg_days_in_stage: number;
  max_days_in_stage: number;
  count_in_stage: number;
  count_overtime: number;
  overflow_count_in_stage: number;
}

export interface FeaturePbiSummaryRow {
  feature_id: number | null;
  feature_title: string;
  epic_id: number | null;
  epic_title: string;
  pbi_count: number;
  bug_count: number;
  verde_count: number;
  amarelo_count: number;
  vermelho_count: number;
  avg_lead_time_days: number | null;
  overflow_count: number;
}
