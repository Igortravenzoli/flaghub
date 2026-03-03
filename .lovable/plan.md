

# FlagHub Evolution — Phase 1: Database + Governance + Area Rename

## Overview

Phase 1 creates the full governance/permissions database layer and restructures the frontend to match the new area naming. No external API integrations yet (DevOps, Timelog, VDESK gateway) — those come in Phase 2.

**Current state**: 7 sectors (comercial, comunicacao, customer-service, helpdesk, infraestrutura, programacao, qualidade) with mock data, existing Ticket↔OS module fully functional.

**Target state**: 6 hub areas (produtos, comercial, customer_service, fabrica, qualidade, tickets_os), governance tables, access request flow, admin pages, IP allowlist.

---

## Area Mapping (Rename)

```text
Current Sector      →  New Hub Area
─────────────────────────────────────
comunicacao         →  produtos
comercial           →  comercial (keep)
customer-service    →  customer_service
programacao + infra →  fabrica
qualidade           →  qualidade (keep)
helpdesk            →  tickets_os
```

---

## Step 1 — Supabase Migrations

### 1A. Hub governance tables
Create all tables from the PRD with `CREATE TABLE IF NOT EXISTS`:

- **hub_areas** — 6 areas with key, name, is_active
- **hub_dashboards** — dashboards per area, is_confidential flag
- **hub_metrics_registry** — metric catalog (source_system, is_confidential, status)
- **hub_user_global_roles** — user_id + role (admin/user) + is_local_admin
- **hub_area_members** — user_id + area_id + area_role (viewer/owner) + can_view_confidential
- **hub_access_requests** — user_id + area_id + status (pending/approved/rejected)
- **hub_ip_allowlist** — cidr inet + label + is_active
- **hub_audit_logs** — bigserial, actor, action, entity_type, entity_id, metadata
- **hub_manual_uploads** — area_id, uploaded_by, file metadata, status, raw jsonb

### 1B. Integration/Sync tables (structure only, no data yet)
- **hub_integrations** — key (devops/timelog/vdesk_gateway/servicenow_import), config
- **hub_integration_endpoints** — per integration endpoints
- **hub_sync_jobs** — job_key, schedule, enabled, config
- **hub_sync_runs** — per-run log (status, items, duration, error)

### 1C. DevOps data layer (empty tables for future)
- **devops_queries** — id, name, wiql_id, is_active
- **devops_work_items** — id (int PK), rev, core fields, custom_fields jsonb, raw jsonb
- **devops_query_items_current** — query_id + work_item_id (current snapshot)
- **devops_time_logs** — timelog entries with dedupe by id/__etag

### 1D. Utility SQL functions
- `hub_is_admin()` — checks hub_user_global_roles
- `hub_request_ip()` — reads IP from `current_setting('request.headers', true)`
- `hub_is_ip_allowed()` — validates IP against hub_ip_allowlist
- `hub_user_has_area(area_key)` — checks membership
- `hub_can_view_confidential(area_key)` — checks membership + IP

### 1E. RLS Policies
Following the PRD spec exactly:
- hub_areas/dashboards/metrics: SELECT for admin OR area members
- hub_access_requests: INSERT for any authenticated, SELECT/UPDATE for admin
- hub_area_members: SELECT for admin + own records, mutations admin only
- hub_sync_jobs: SELECT for admin + area owners
- hub_ip_allowlist: CRUD admin only
- hub_audit_logs: INSERT via RPC, SELECT admin only
- hub_manual_uploads: INSERT for admin + area owners, SELECT for area members

### 1F. Seed data (via insert tool)
- 6 hub_areas rows
- 4 hub_integrations rows (devops, timelog, vdesk_gateway, servicenow_import)
- 2 hub_ip_allowlist entries (186.249.231.177/32, 200.166.93.33/32)

---

## Step 2 — Frontend: Area Rename + Routing

### 2A. Update mockSectorData.ts
- Rename sectors: comunicacao → produtos, programacao+infraestrutura → fabrica, helpdesk → tickets_os, customer-service → customer_service
- Update slugs, names, icons, KPI labels

### 2B. Update routes in App.tsx
```text
/setor/produtos          (was /setor/comunicacao)
/setor/comercial         (keep)
/setor/customer-service  (keep URL, map to customer_service)
/setor/fabrica           (was /setor/programacao + /setor/infraestrutura)
/setor/qualidade         (keep)
/dashboard               (tickets_os, keep as-is)
```

### 2C. Update Sidebar
- Rename sector labels to match new areas
- Merge Infraestrutura + Programação under "Fábrica"
- Add Admin section items (Solicitações, Permissões, Sync, IP Allowlist)
- Keep Tickets↔OS (HelpDesk) submenu as "Tickets & OS"

### 2D. Rename/merge dashboard pages
- Merge `ProgramacaoDashboard` + `InfraestruturaDashboard` → `FabricaDashboard`
- Rename `ComunicacaoDashboard` → `ProdutosDashboard`
- Keep other dashboards, update imports

---

## Step 3 — Frontend: Governance UI

### 3A. Home — Access Request Flow
- If user has no hub_area_members records: show empty state with area list + "Solicitar Acesso" button per area
- CTA inserts into hub_access_requests
- If user has areas: show current sector cards (filtered to permitted areas only)
- Use React Query to fetch hub_area_members for current user

### 3B. Admin Pages (admin-only routes)

**`/admin/requests`** — Access Requests
- Table: pending requests with user email, area, requested_at
- Approve/Reject buttons + assign viewer/owner + can_view_confidential toggle
- Updates hub_access_requests + creates hub_area_members

**`/admin/permissions`** — Permission Management
- Table: all hub_area_members with user, area, role, confidential flag
- Inline edit role (viewer/owner) and confidential toggle
- Remove member button

**`/admin/sync`** — Sync Central (UI shell only, no actual sync yet)
- List hub_sync_jobs with status, last_run, next_run
- "Run Now" button (placeholder)
- hub_sync_runs log table

**`/admin/ip-allowlist`** — IP Allowlist CRUD
- Table of current CIDRs with labels
- Add/Edit/Delete

### 3C. Confidential Card UI
- Create `ConfidentialGuard` wrapper component
- If user lacks confidential permission: hide metric entirely
- If user has permission but IP not allowed: show dimmed card with lock icon + "Bloqueado: Origem não autorizada"

---

## Step 4 — Update AuthContext

- After sign-in, also fetch hub_user_global_roles and hub_area_members
- Expose `hubRole`, `userAreas`, `canViewConfidential(areaKey)` from context
- Admin menu visibility based on hub_user_global_roles.role = 'admin'

---

## What is NOT in Phase 1
- Edge functions for DevOps/Timelog/VDESK sync
- Real API integrations (no PAT/credentials needed)
- Actual confidential IP validation at backend level (tables ready, enforcement in Phase 2 with edge functions)
- CRON scheduling for sync jobs

---

## Files to Create/Modify

```text
NEW FILES:
  src/pages/admin/AccessRequests.tsx
  src/pages/admin/Permissions.tsx
  src/pages/admin/SyncCentral.tsx
  src/pages/admin/IpAllowlist.tsx
  src/pages/setores/ProdutosDashboard.tsx
  src/pages/setores/FabricaDashboard.tsx
  src/components/governance/ConfidentialGuard.tsx
  src/components/governance/AccessRequestCard.tsx
  src/hooks/useHubAreas.ts
  src/hooks/useHubPermissions.ts

MODIFIED FILES:
  src/App.tsx (new routes)
  src/components/layout/Sidebar.tsx (rename + admin section)
  src/pages/Home.tsx (governance-aware)
  src/data/mockSectorData.ts (rename sectors)
  src/contexts/AuthContext.tsx (hub roles)
  src/types/database.ts (new types)

REMOVED/MERGED:
  src/pages/setores/ComunicacaoDashboard.tsx → ProdutosDashboard.tsx
  src/pages/setores/ProgramacaoDashboard.tsx + InfraestruturaDashboard.tsx → FabricaDashboard.tsx
```

---

## Estimated Scope
- 1 large migration SQL (~300 lines)
- 1 seed SQL via insert tool
- ~15 files created/modified
- Existing Ticket↔OS module: zero changes

