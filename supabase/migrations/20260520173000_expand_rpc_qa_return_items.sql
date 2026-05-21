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
  resolved_at          timestamptz,
  is_open              boolean,
  detection_method     text,
  days_since_return    numeric,
  alert_status         text,
  alert_sent_at        timestamptz,
  alert_channel_type   text,
  alert_error          text,
  web_url              text,
  parent_id            integer,
  parent_title         text,
  parent_type          text
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
    e.resolved_at,
    e.is_open,
    e.detection_method,
    ROUND(
      EXTRACT(EPOCH FROM (COALESCE(e.resolved_at, now()) - e.detected_at)) / 86400.0,
      1
    )::numeric AS days_since_return,
    e.alert_status,
    e.alert_sent_at,
    e.alert_channel_type,
    e.alert_error,
    e.web_url,
    wi.parent_id,
    parent_wi.title AS parent_title,
    parent_wi.work_item_type AS parent_type
  FROM public.devops_qa_return_events e
  LEFT JOIN public.devops_work_items wi ON wi.id = e.work_item_id
  LEFT JOIN public.devops_work_items parent_wi ON parent_wi.id = wi.parent_id
  ORDER BY COALESCE(e.transition_date, e.detected_at) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_qa_return_open_items() TO authenticated;