DROP FUNCTION IF EXISTS public.rpc_qa_return_open_items();

CREATE OR REPLACE FUNCTION public.rpc_qa_return_open_items()
RETURNS TABLE (
  id                   bigint,
  work_item_id         integer,
  work_item_title      text,
  work_item_type       text,
  sprint_code          text,
  assigned_to_display  text,
  assigned_to_email    text,
  detected_at          timestamptz,
  transition_date      timestamptz,
  days_since_return    numeric,
  alert_status         text,
  alert_sent_at        timestamptz,
  alert_channel_type   text,
  alert_error          text,
  web_url              text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    e.id,
    e.work_item_id,
    e.work_item_title,
    e.work_item_type,
    e.sprint_code,
    e.assigned_to_display,
    e.assigned_to_email,
    e.detected_at,
    e.transition_date,
    ROUND(
      EXTRACT(EPOCH FROM (now() - e.detected_at)) / 86400.0,
      1
    )::numeric AS days_since_return,
    e.alert_status,
    e.alert_sent_at,
    e.alert_channel_type,
    e.alert_error,
    e.web_url
  FROM public.devops_qa_return_events e
  WHERE e.is_open = true
  ORDER BY COALESCE(e.transition_date, e.detected_at) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_qa_return_open_items() TO authenticated;