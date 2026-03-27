ALTER TABLE public.alert_channels DROP CONSTRAINT IF EXISTS alert_channels_channel_type_check;
ALTER TABLE public.alert_channels
ADD CONSTRAINT alert_channels_channel_type_check
CHECK (channel_type = ANY (ARRAY['email'::text, 'smtp'::text, 'telegram'::text, 'teams'::text]));