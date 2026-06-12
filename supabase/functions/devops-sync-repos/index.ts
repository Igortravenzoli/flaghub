// devops-sync-repos v1.0 — Inventário DevOps: projetos, repositórios e pipelines
// Etapa 1 da visão de cobertura de automações da Infra:
//   projetos → repos Git → build definitions (pipelines por repo) → último commit.
// Requer PAT (DEVOPS_PAT) com escopos: Project and Team (Read), Code (Read),
// Build (Read) e Release (Read).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const DEVOPS_ORG = 'FlagIW'
const API = '7.0'

interface AdoProject {
  id: string
  name: string
  description?: string
  state?: string
  visibility?: string
  lastUpdateTime?: string
}

interface AdoRepo {
  id: string
  name: string
  defaultBranch?: string
  size?: number
  webUrl?: string
  isDisabled?: boolean
  project: { id: string }
}

interface AdoBuildDef {
  id: number
  name: string
  path?: string
  queueStatus?: string
  createdDate?: string
  repository?: { id?: string; type?: string }
  _links?: { web?: { href?: string } }
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

async function validateCronSecret(req: Request): Promise<boolean> {
  const cronSecret = req.headers.get('x-cron-secret')
  if (!cronSecret) return false
  const expectedEnv = Deno.env.get('CRON_SECRET')
  if (expectedEnv && cronSecret === expectedEnv) return true
  try {
    const admin = getSupabaseAdmin()
    const { data, error } = await admin.rpc('get_cron_secret')
    if (error) return false
    return typeof data === 'string' && data.length > 0 && cronSecret === data
  } catch {
    return false
  }
}

async function validateAuth(req: Request): Promise<string | null> {
  if (await validateCronSecret(req)) return 'cron'

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (serviceRoleKey && token === serviceRoleKey) return 'service-role-internal'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data, error } = await supabase.auth.getClaims(token)
  if (error || !data?.claims?.sub) return null
  return data.claims.sub as string
}

async function devopsFetch(url: string): Promise<Response> {
  const pat = Deno.env.get('DEVOPS_PAT')!
  const base64Pat = btoa(`:${pat}`)
  const fullUrl = url.startsWith('http') ? url : `https://dev.azure.com/${DEVOPS_ORG}/${url}`
  return await fetch(fullUrl, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${base64Pat}`,
    },
  })
}

async function devopsJson<T>(url: string): Promise<T> {
  const resp = await devopsFetch(url)
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`DevOps API ${resp.status} em ${url}: ${text.slice(0, 300)}`)
  }
  return await resp.json()
}

/** Último commit do branch padrão; null quando repo vazio/desabilitado. */
async function fetchLastCommitDate(projectId: string, repoId: string): Promise<string | null> {
  try {
    const resp = await devopsFetch(
      `${projectId}/_apis/git/repositories/${repoId}/commits?searchCriteria.$top=1&api-version=${API}`
    )
    if (!resp.ok) return null
    const data = await resp.json()
    return data.value?.[0]?.committer?.date ?? null
  } catch {
    return null
  }
}

interface ReleaseInfo {
  count: number
  /** build definition id → quantidade de release definitions que o consomem */
  byBuildDefId: Map<number, number>
}

/** Release definitions (classic CD) com artefatos: permite associar releases
 *  aos repositórios via build definition de origem. */
async function fetchReleaseDefs(projectId: string): Promise<ReleaseInfo> {
  const empty: ReleaseInfo = { count: 0, byBuildDefId: new Map() }
  try {
    const resp = await devopsFetch(
      `https://vsrm.dev.azure.com/${DEVOPS_ORG}/${projectId}/_apis/release/definitions?$expand=artifacts&api-version=${API}`
    )
    if (!resp.ok) return empty
    const data = await resp.json()
    const defs = data.value ?? []
    const byBuildDefId = new Map<number, number>()
    for (const rd of defs) {
      for (const art of (rd.artifacts ?? [])) {
        if (art.type !== 'Build') continue
        const buildDefId = parseInt(art.definitionReference?.definition?.id ?? '', 10)
        if (!Number.isFinite(buildDefId)) continue
        byBuildDefId.set(buildDefId, (byBuildDefId.get(buildDefId) ?? 0) + 1)
      }
    }
    return { count: defs.length, byBuildDefId }
  } catch {
    return empty
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  const startTime = Date.now()
  const admin = getSupabaseAdmin()

  try {
    const userId = await validateAuth(req)
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Autenticação obrigatória' }), {
        status: 401, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    if (userId !== 'cron' && userId !== 'service-role-internal') {
      const { data: roleRow } = await admin
        .from('hub_user_global_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle()
      const { data: legacyRole } = !roleRow ? await admin
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle() : { data: roleRow }
      if (!roleRow && !legacyRole) {
        return new Response(JSON.stringify({ error: 'Permissão negada: apenas admins podem executar sincronização' }), {
          status: 403, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        })
      }
    }

    const body = await req.json().catch(() => ({}))
    const skipCommits: boolean = body?.skip_commits === true

    const syncedAt = new Date().toISOString()

    // 1. Projetos da organização
    const projData = await devopsJson<{ value: AdoProject[] }>(`_apis/projects?$top=500&api-version=${API}`)
    const projects = projData.value || []
    console.log(`[DevOpsRepos] ${projects.length} projetos`)

    let totalRepos = 0
    let totalPipelines = 0
    const projectRows: Record<string, unknown>[] = []
    const repoRows: Record<string, unknown>[] = []
    const allRepoIds: string[] = []

    // 2. Por projeto: repos + build definitions + releases
    for (const proj of projects) {
      const [reposData, defsData, releaseInfo] = await Promise.all([
        devopsJson<{ value: AdoRepo[] }>(`${proj.id}/_apis/git/repositories?includeHidden=false&api-version=${API}`)
          .catch((e) => { console.error(`[DevOpsRepos] repos ${proj.name}: ${e.message}`); return { value: [] as AdoRepo[] } }),
        devopsJson<{ value: AdoBuildDef[] }>(`${proj.id}/_apis/build/definitions?includeAllProperties=true&$top=1000&api-version=${API}`)
          .catch((e) => { console.error(`[DevOpsRepos] defs ${proj.name}: ${e.message}`); return { value: [] as AdoBuildDef[] } }),
        fetchReleaseDefs(proj.id),
      ])

      const repos = reposData.value || []
      const defs = defsData.value || []

      // Pipelines agrupadas por repositório
      const defsByRepo = new Map<string, AdoBuildDef[]>()
      for (const def of defs) {
        const repoId = def.repository?.id
        if (!repoId) continue
        if (!defsByRepo.has(repoId)) defsByRepo.set(repoId, [])
        defsByRepo.get(repoId)!.push(def)
      }

      projectRows.push({
        id: proj.id,
        name: proj.name,
        description: proj.description ?? null,
        state: proj.state ?? null,
        visibility: proj.visibility ?? null,
        web_url: `https://dev.azure.com/${DEVOPS_ORG}/${encodeURIComponent(proj.name)}`,
        last_update_time: proj.lastUpdateTime ?? null,
        repo_count: repos.length,
        pipeline_count: defs.length,
        release_definition_count: releaseInfo.count,
        synced_at: syncedAt,
      })

      for (const repo of repos) {
        const repoDefs = defsByRepo.get(repo.id) ?? []
        const lastCommit = (skipCommits || repo.isDisabled)
          ? null
          : await fetchLastCommitDate(proj.id, repo.id)

        allRepoIds.push(repo.id)
        repoRows.push({
          id: repo.id,
          project_id: proj.id,
          project_name: proj.name,
          name: repo.name,
          default_branch: repo.defaultBranch ?? null,
          size_bytes: repo.size ?? null,
          web_url: repo.webUrl ?? null,
          is_disabled: repo.isDisabled === true,
          last_commit_date: lastCommit,
          pipeline_count: repoDefs.length,
          active_pipeline_count: repoDefs.filter(d => d.queueStatus === 'enabled').length,
          release_count: repoDefs.reduce((s, d) => s + (releaseInfo.byBuildDefId.get(d.id) ?? 0), 0),
          pipelines: repoDefs.map(d => ({
            id: d.id,
            name: d.name,
            path: d.path ?? null,
            queueStatus: d.queueStatus ?? null,
            createdDate: d.createdDate ?? null,
            webUrl: d._links?.web?.href ?? null,
          })),
          synced_at: syncedAt,
        })
      }

      totalRepos += repos.length
      totalPipelines += defs.length
      await new Promise(r => setTimeout(r, 100))
    }

    // 3. Upsert (classificação manual é preservada: colunas ausentes não são tocadas)
    for (let i = 0; i < projectRows.length; i += 100) {
      const { error } = await admin.from('devops_projects')
        .upsert(projectRows.slice(i, i + 100), { onConflict: 'id' })
      if (error) throw new Error(`Upsert devops_projects: ${error.message}`)
    }
    for (let i = 0; i < repoRows.length; i += 100) {
      const { error } = await admin.from('devops_repos')
        .upsert(repoRows.slice(i, i + 100), { onConflict: 'id' })
      if (error) throw new Error(`Upsert devops_repos: ${error.message}`)
    }

    // 4. Remove repos/projetos que não existem mais na organização
    const { data: existingRepos } = await admin.from('devops_repos').select('id')
    const currentRepoIds = new Set(allRepoIds)
    const reposToDelete = (existingRepos || []).map(r => r.id).filter(id => !currentRepoIds.has(id))
    if (reposToDelete.length > 0) {
      await admin.from('devops_repos').delete().in('id', reposToDelete)
    }

    const { data: existingProjects } = await admin.from('devops_projects').select('id')
    const currentProjIds = new Set(projects.map(p => p.id))
    const projsToDelete = (existingProjects || []).map(p => p.id).filter(id => !currentProjIds.has(id))
    if (projsToDelete.length > 0) {
      await admin.from('devops_projects').delete().in('id', projsToDelete)
    }

    // 5. Registro de ingestão + auditoria
    const duration = Date.now() - startTime
    await admin.from('hub_raw_ingestions').insert({
      source_type: 'devops',
      source_key: 'repos-inventory',
      external_id: DEVOPS_ORG,
      payload: { projects: projects.length, repos: totalRepos, pipelines: totalPipelines, repos_deleted: reposToDelete.length },
      status: 'processed',
      processed_at: new Date().toISOString(),
    })
    try {
      await admin.rpc('hub_audit_log', {
        p_action: 'devops_sync_repos',
        p_entity_type: 'devops_repos',
        p_entity_id: DEVOPS_ORG,
        p_metadata: { projects: projects.length, repos: totalRepos, pipelines: totalPipelines, duration_ms: duration },
      })
    } catch (_) { /* auditoria é best-effort */ }

    return new Response(JSON.stringify({
      success: true,
      projects: projects.length,
      repos: totalRepos,
      pipelines: totalPipelines,
      repos_deleted: reposToDelete.length,
      duration_ms: duration,
    }), { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('[DevOpsRepos] Error:', err)
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
