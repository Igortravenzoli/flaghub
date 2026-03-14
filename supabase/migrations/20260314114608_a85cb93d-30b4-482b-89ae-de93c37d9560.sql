-- Rename "Ticket & OS" to "HelpDesk" in hub_areas
UPDATE public.hub_areas SET name = 'HelpDesk' WHERE key = 'ticket_os' OR name ILIKE '%ticket%os%';

-- Ensure Infraestrutura exists
INSERT INTO public.hub_areas (key, name, is_active)
VALUES ('infraestrutura', 'Infraestrutura', true)
ON CONFLICT (key) DO UPDATE SET name = 'Infraestrutura', is_active = true;