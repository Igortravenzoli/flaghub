-- RLS policies for devops_queries: allow authenticated users to read active queries
CREATE POLICY "Authenticated users can read active devops queries"
ON public.devops_queries FOR SELECT TO authenticated
USING (true);

-- RLS policies for hub_sync_jobs: allow authenticated users to read
CREATE POLICY "Authenticated users can read sync jobs"
ON public.hub_sync_jobs FOR SELECT TO authenticated
USING (true);

-- RLS policies for hub_sync_runs: allow authenticated users to read
CREATE POLICY "Authenticated users can read sync runs"
ON public.hub_sync_runs FOR SELECT TO authenticated
USING (true);

-- RLS policies for hub_integrations: allow authenticated users to read
CREATE POLICY "Authenticated users can read integrations"
ON public.hub_integrations FOR SELECT TO authenticated
USING (true);

-- RLS policies for hub_raw_ingestions: allow authenticated users to read
CREATE POLICY "Authenticated users can read raw ingestions"
ON public.hub_raw_ingestions FOR SELECT TO authenticated
USING (true);

-- RLS for devops_work_items: allow authenticated to read
CREATE POLICY "Authenticated users can read work items"
ON public.devops_work_items FOR SELECT TO authenticated
USING (true);

-- RLS for devops_query_items_current: allow authenticated to read
CREATE POLICY "Authenticated users can read query items"
ON public.devops_query_items_current FOR SELECT TO authenticated
USING (true);

-- RLS for helpdesk_dashboard_snapshots: allow authenticated to read
CREATE POLICY "Authenticated users can read helpdesk snapshots"
ON public.helpdesk_dashboard_snapshots FOR SELECT TO authenticated
USING (true);

-- RLS for vdesk_clients: allow authenticated to read
CREATE POLICY "Authenticated users can read vdesk clients"
ON public.vdesk_clients FOR SELECT TO authenticated
USING (true);