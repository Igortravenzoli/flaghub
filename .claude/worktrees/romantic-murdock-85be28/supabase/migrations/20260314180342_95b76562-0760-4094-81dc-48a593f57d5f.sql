ALTER TABLE public.devops_work_items
ADD COLUMN IF NOT EXISTS iteration_history jsonb DEFAULT NULL;