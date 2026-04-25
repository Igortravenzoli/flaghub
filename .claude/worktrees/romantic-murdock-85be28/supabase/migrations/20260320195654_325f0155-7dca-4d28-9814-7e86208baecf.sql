
-- Function: compute_pbi_health_all
-- Populates pbi_lifecycle_summary and pbi_health_summary based on current work item state/dates
-- Uses pbi_stage_config state_patterns and pbi_health_thresholds for classification

CREATE OR REPLACE FUNCTION public.compute_pbi_health_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wi RECORD;
  _stage_key text;
  _stage_match RECORD;
  _days_in_stage integer;
  _health text;
  _reasons text[];
  _threshold RECORD;
  _overflow_count integer;
  _sprint_migration_count integer;
  _iter_hist jsonb;
  _distinct_sprints integer;
BEGIN
  -- Process each PBI/Story/Bug
  FOR _wi IN
    SELECT
      w.id,
      w.state,
      w.work_item_type,
      w.iteration_path,
      w.created_date,
      w.changed_date,
      w.assigned_to_display,
      w.tags,
      w.iteration_history,
      w.area_path
    FROM devops_work_items w
    WHERE w.work_item_type IN ('Product Backlog Item', 'User Story', 'Bug')
  LOOP
    -- 1) Determine current stage from state using pbi_stage_config
    _stage_key := 'backlog'; -- default
    FOR _stage_match IN
      SELECT sc.stage_key, unnest(sc.state_patterns) AS pattern
      FROM pbi_stage_config sc
      WHERE sc.is_active = true
      ORDER BY sc.sort_order
    LOOP
      IF lower(coalesce(_wi.state, '')) = lower(_stage_match.pattern) THEN
        _stage_key := _stage_match.stage_key;
        EXIT;
      END IF;
    END LOOP;

    -- 2) Calculate days in current stage (from changed_date to now, or 0 if done)
    IF _stage_key = 'done' THEN
      _days_in_stage := 0;
    ELSE
      _days_in_stage := GREATEST(0, EXTRACT(DAY FROM (now() - coalesce(_wi.changed_date, _wi.created_date)))::integer);
    END IF;

    -- 3) Compute overflow/sprint migration from iteration_history
    _overflow_count := 0;
    _sprint_migration_count := 0;
    _iter_hist := _wi.iteration_history;
    IF _iter_hist IS NOT NULL AND jsonb_typeof(_iter_hist) = 'array' THEN
      SELECT count(DISTINCT val) INTO _distinct_sprints
      FROM jsonb_array_elements_text(_iter_hist) AS val
      WHERE val IS NOT NULL AND val <> '';
      IF _distinct_sprints > 1 THEN
        _sprint_migration_count := _distinct_sprints - 1;
        _overflow_count := GREATEST(0, _distinct_sprints - 1);
      END IF;
    END IF;

    -- 4) Determine sector from area_path or iteration_path
    -- Simplified: extract from iteration path suffix or default to null

    -- 5) Compute total lead time (created to now for active, created to changed for done)
    -- Upsert pbi_lifecycle_summary
    INSERT INTO pbi_lifecycle_summary (
      work_item_id, sector, current_stage, has_design_stage,
      first_committed_sprint, last_committed_sprint,
      lead_owner_at_commitment, overflow_stage,
      total_lead_time_days,
      backlog_days, design_days, fabrica_days, qualidade_days, deploy_days,
      sprint_migration_count, overflow_count, overflow_by_stage,
      qa_return_count, computed_at
    ) VALUES (
      _wi.id,
      NULL, -- sector computed separately if needed
      _stage_key,
      false, -- simplified
      CASE WHEN _iter_hist IS NOT NULL AND jsonb_typeof(_iter_hist) = 'array' AND jsonb_array_length(_iter_hist) > 0
           THEN _iter_hist->>0 ELSE split_part(coalesce(_wi.iteration_path,''), '\', 2) END,
      split_part(coalesce(_wi.iteration_path,''), '\', 2),
      _wi.assigned_to_display,
      CASE WHEN _overflow_count > 0 THEN _stage_key ELSE NULL END,
      GREATEST(0, EXTRACT(DAY FROM (
        CASE WHEN _stage_key = 'done' THEN coalesce(_wi.changed_date, now())
             ELSE now() END
        - coalesce(_wi.created_date, now())
      ))::integer),
      CASE WHEN _stage_key = 'backlog' THEN _days_in_stage ELSE 0 END,
      0, -- design_days simplified
      CASE WHEN _stage_key = 'fabrica' THEN _days_in_stage ELSE 0 END,
      CASE WHEN _stage_key = 'qualidade' THEN _days_in_stage ELSE 0 END,
      CASE WHEN _stage_key = 'deploy' THEN _days_in_stage ELSE 0 END,
      _sprint_migration_count,
      _overflow_count,
      NULL,
      0, -- qa_return_count from custom_fields if available
      now()
    )
    ON CONFLICT (work_item_id) DO UPDATE SET
      current_stage = EXCLUDED.current_stage,
      first_committed_sprint = EXCLUDED.first_committed_sprint,
      last_committed_sprint = EXCLUDED.last_committed_sprint,
      lead_owner_at_commitment = EXCLUDED.lead_owner_at_commitment,
      overflow_stage = EXCLUDED.overflow_stage,
      total_lead_time_days = EXCLUDED.total_lead_time_days,
      backlog_days = EXCLUDED.backlog_days,
      design_days = EXCLUDED.design_days,
      fabrica_days = EXCLUDED.fabrica_days,
      qualidade_days = EXCLUDED.qualidade_days,
      deploy_days = EXCLUDED.deploy_days,
      sprint_migration_count = EXCLUDED.sprint_migration_count,
      overflow_count = EXCLUDED.overflow_count,
      qa_return_count = EXCLUDED.qa_return_count,
      computed_at = now(),
      updated_at = now();

    -- 6) Compute health status using thresholds
    _health := 'verde';
    _reasons := ARRAY[]::text[];

    -- Check overflow
    IF _overflow_count > 0 THEN
      _health := 'vermelho';
      _reasons := array_append(_reasons, 'Transbordo: ' || _overflow_count || ' migração(ões) de sprint');
    END IF;

    -- Check sprint migrations
    IF _sprint_migration_count > 1 AND _health <> 'vermelho' THEN
      _health := 'vermelho';
      _reasons := array_append(_reasons, 'Múltiplas migrações de sprint: ' || _sprint_migration_count);
    ELSIF _sprint_migration_count = 1 AND _health = 'verde' THEN
      _health := 'amarelo';
      _reasons := array_append(_reasons, '1 migração de sprint');
    END IF;

    -- Check days in stage against thresholds
    IF _stage_key <> 'done' THEN
      SELECT * INTO _threshold FROM pbi_health_thresholds
      WHERE stage_key = _stage_key AND is_active = true LIMIT 1;

      IF FOUND THEN
        IF _days_in_stage > _threshold.critical_days AND _threshold.critical_days > 0 THEN
          _health := 'vermelho';
          _reasons := array_append(_reasons, 'Tempo crítico na etapa ' || _stage_key || ': ' || _days_in_stage || ' dias (limite: ' || _threshold.critical_days || ')');
        ELSIF _days_in_stage > _threshold.warn_days AND _threshold.warn_days > 0 AND _health = 'verde' THEN
          _health := 'amarelo';
          _reasons := array_append(_reasons, 'Atenção na etapa ' || _stage_key || ': ' || _days_in_stage || ' dias (limite: ' || _threshold.warn_days || ')');
        END IF;
      END IF;
    END IF;

    -- If done and no issues, stays verde
    IF _stage_key = 'done' AND array_length(_reasons, 1) IS NULL THEN
      _reasons := array_append(_reasons, 'Concluída sem alertas');
    END IF;

    -- Upsert pbi_health_summary
    INSERT INTO pbi_health_summary (
      work_item_id, sector, health_status, bottleneck_stage, health_reasons, computed_at
    ) VALUES (
      _wi.id,
      NULL,
      _health,
      CASE WHEN _health <> 'verde' AND _stage_key <> 'done' THEN _stage_key ELSE NULL END,
      to_jsonb(_reasons),
      now()
    )
    ON CONFLICT (work_item_id) DO UPDATE SET
      health_status = EXCLUDED.health_status,
      bottleneck_stage = EXCLUDED.bottleneck_stage,
      health_reasons = EXCLUDED.health_reasons,
      computed_at = now(),
      updated_at = now();

  END LOOP;
END;
$$;

-- Grant execute to authenticated users (for admin trigger or edge function call)
GRANT EXECUTE ON FUNCTION public.compute_pbi_health_all() TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_pbi_health_all() TO service_role;
