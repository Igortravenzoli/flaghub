-- Add mfa_exempt flag to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS mfa_exempt boolean NOT NULL DEFAULT false;

-- Allow admins to read this field (existing RLS policies on profiles already cover access)
COMMENT ON COLUMN public.profiles.mfa_exempt IS 'When true, user is exempt from mandatory MFA. Managed by admins only.';