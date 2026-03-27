ALTER TABLE public.alert_channels
ADD CONSTRAINT alert_channels_channel_type_label_key UNIQUE (channel_type, label);