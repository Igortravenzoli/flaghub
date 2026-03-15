
CREATE INDEX IF NOT EXISTS idx_devops_time_logs_dedup 
ON public.devops_time_logs (work_item_id, log_date, user_name, start_time, time_minutes);
