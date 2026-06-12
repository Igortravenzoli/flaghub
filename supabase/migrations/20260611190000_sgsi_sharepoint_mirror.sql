-- SGSI — espelho das listas SharePoint do site PORTALSGSI
-- (https://flagcom.sharepoint.com/sites/PORTALSGSI), mesma fonte do PBIX
-- "SG-LST Usecase 1.04". Sincronizado pela edge function sharepoint-sync-sgsi
-- via Microsoft Graph. Os campos ficam em jsonb chaveado pelo displayName da
-- coluna (ex.: "Status", "Ambiente Afetado"), resolvido na sincronização.

CREATE TABLE IF NOT EXISTS public.sgsi_lists (
  list_key text PRIMARY KEY,          -- '010' | '011' | '012' | '014' | '017' | '018'
  graph_list_id text,
  display_name text,
  item_count int NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sgsi_items (
  list_key text NOT NULL REFERENCES public.sgsi_lists(list_key) ON DELETE CASCADE,
  item_id int NOT NULL,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_sp timestamptz,
  modified_sp timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_key, item_id)
);

CREATE INDEX IF NOT EXISTS idx_sgsi_items_list ON public.sgsi_items(list_key);

-- RLS: leitura para usuários aprovados; mutação direta apenas admin
-- (a sincronização usa service role e ignora RLS).
ALTER TABLE public.sgsi_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sgsi_lists_select" ON public.sgsi_lists FOR SELECT TO authenticated
  USING (public.hub_is_approved());
CREATE POLICY "sgsi_lists_admin_mut" ON public.sgsi_lists FOR ALL TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());

ALTER TABLE public.sgsi_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sgsi_items_select" ON public.sgsi_items FOR SELECT TO authenticated
  USING (public.hub_is_approved());
CREATE POLICY "sgsi_items_admin_mut" ON public.sgsi_items FOR ALL TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());
