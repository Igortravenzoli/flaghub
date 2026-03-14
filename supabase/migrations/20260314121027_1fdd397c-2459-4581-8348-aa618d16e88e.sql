CREATE TABLE IF NOT EXISTS public.login_attempts (
  email TEXT NOT NULL PRIMARY KEY,
  attempt_count INT NOT NULL DEFAULT 1,
  first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ
);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.cleanup_login_attempts()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.login_attempts
  WHERE first_attempt_at < now() - interval '10 minutes'
    AND (locked_until IS NULL OR locked_until < now());
$$;