// devops-sync-git v1.0 — commits e pull requests do Azure DevOps, por janela de datas.
//
// Alimenta devops_git_commits e devops_git_pull_requests, que o relatório de
// horas do período cruza com as horas lançadas por colaborador.
//
// Corpo (tudo opcional):
//   { "dias": 3 }                         janela = últimos N dias (padrão 3)
//   { "from": "2026-10-01", "to": "2026-10-31" }   janela explícita (carga retroativa)
//   { "fatia": 0, "fatias": 2 }           processa só os repositórios desta fatia
//   { "repo_ids": ["<guid>", ...] }       restringe a repositórios específicos
//
// Escopo: repositórios com `aplicavel = true` e não desabilitados. Commits vêm
// da branch padrão (a listagem sem `itemVersion`); trabalho ainda em branch de
// feature aparece pelo PR. PRs entram se foram CRIADOS ou FECHADOS na janela.
//
// Requer DEVOPS_PAT com Code (Read) e Work Items (Read) — o mesmo do
// devops-sync-repos.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { devopsAuthHeaders, devopsFetch as devopsHttp } from '../_shared/devops.ts'

const DEVOPS_ORG = 'FlagIW'
/** Commits aceitam 7.0, mas o filtro de data de PR (minTime/maxTime) só existe na 7.1. */
const API = '7.1'
const PAGINA_COMMITS = 500
const PAGINA_PRS = 100
/** Repositórios em paralelo. Baixo de propósito: ver o incidente de 31/08 em _shared/devops.ts. */
const PARALELO = 4
/** A edge morre em 150 s. Parar antes devolve o que foi feito em vez de perder tudo. */
const ORCAMENTO_MS = 120_000
const TETO_COMENTARIO = 300

interface Repo { id: string; project_id: string; project_name: string; name: string; web_url: string | null }

interface AdoCommit {
  commitId: string
  author?: { name?: string; email?: string; date?: string }
  committer?: { date?: string }
  comment?: string
  changeCounts?: Record<string, number>
  workItems?: Array<{ id?: string }>
  remoteUrl?: string
}

interface AdoPr {
  pullRequestId: number
  title?: string
  status?: string
  isDraft?: boolean
  createdBy?: { displayName?: string; uniqueName?: string }
  creationDate: string
  closedDate?: string
  sourceRefName?: string
  targetRefName?: string
  mergeStatus?: string
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
    const { data, error } = await getSupabaseAdmin().rpc('get_cron_secret')
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
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data, error } = await supabase.auth.getClaims(token)
  if (error || !data?.claims?.sub) return null
  return data.claims.sub as string
}

async function devopsJson<T>(caminho: string): Promise<T> {
  const url = `https://dev.azure.com/${DEVOPS_ORG}/${caminho}`
  const resp = await devopsHttp(
    url,
    { headers: devopsAuthHeaders(Deno.env.get('DEVOPS_PAT')!) },
    { client: 'sync-git' },
  )
  if (!resp.ok) {
    const texto = await resp.text()
    throw new Error(`DevOps API ${resp.status} em ${caminho}: ${texto.slice(0, 200)}`)
  }
  return await resp.json()
}

const ramo = (ref?: string) => (ref ? ref.replace(/^refs\/heads\//, '') : null)
const idsValidos = (refs?: Array<{ id?: string }>) =>
  [...new Set((refs ?? []).map((r) => parseInt(r.id ?? '', 10)).filter((n) => Number.isFinite(n)))].sort((a, b) => a - b)

async function buscarCommits(repo: Repo, de: string, ate: string): Promise<AdoCommit[]> {
  const base = `${repo.project_id}/_apis/git/repositories/${repo.id}/commits`
    + `?searchCriteria.fromDate=${encodeURIComponent(de)}&searchCriteria.toDate=${encodeURIComponent(ate)}`
    + `&searchCriteria.includeWorkItems=true&searchCriteria.$top=${PAGINA_COMMITS}&api-version=${API}`
  const todos: AdoCommit[] = []
  for (let salto = 0; ; salto += PAGINA_COMMITS) {
    const pagina = await devopsJson<{ value?: AdoCommit[] }>(`${base}&searchCriteria.$skip=${salto}`)
    const lote = pagina.value ?? []
    todos.push(...lote)
    if (lote.length < PAGINA_COMMITS) break
  }
  return todos
}

/** PRs criados OU fechados na janela: duas consultas, uma por tipo de data. */
async function buscarPrs(repo: Repo, de: string, ate: string): Promise<AdoPr[]> {
  const porId = new Map<number, AdoPr>()
  for (const tipo of ['created', 'closed']) {
    const base = `${repo.project_id}/_apis/git/repositories/${repo.id}/pullrequests`
      + `?searchCriteria.status=all&searchCriteria.queryTimeRangeType=${tipo}`
      + `&searchCriteria.minTime=${encodeURIComponent(de)}&searchCriteria.maxTime=${encodeURIComponent(ate)}`
      + `&$top=${PAGINA_PRS}&api-version=${API}`
    for (let salto = 0; ; salto += PAGINA_PRS) {
      const pagina = await devopsJson<{ value?: AdoPr[] }>(`${base}&$skip=${salto}`)
      const lote = pagina.value ?? []
      for (const pr of lote) porId.set(pr.pullRequestId, pr)
      if (lote.length < PAGINA_PRS) break
    }
  }
  return [...porId.values()]
}

async function buscarItensDoPr(repo: Repo, prId: number): Promise<number[]> {
  try {
    // A documentação declara um array direto; na prática o Azure embrulha em
    // `{ value }` como nas demais listagens. Aceita os dois.
    const dados = await devopsJson<{ value?: Array<{ id?: string }> } | Array<{ id?: string }>>(
      `${repo.project_id}/_apis/git/repositories/${repo.id}/pullRequests/${prId}/workitems?api-version=${API}`,
    )
    return idsValidos(Array.isArray(dados) ? dados : dados.value)
  } catch (e) {
    console.error(`[DevOpsGit] itens do PR ${prId} (${repo.name}): ${(e as Error).message}`)
    return []
  }
}

const mesmosIds = (a: number[] | null, b: number[]) =>
  !!a && a.length === b.length && a.every((v, i) => v === b[i])

// deno-lint-ignore no-explicit-any
async function sincronizarRepo(admin: any, repo: Repo, de: string, ate: string) {
  const agora = new Date().toISOString()
  const [commits, prs] = await Promise.all([buscarCommits(repo, de, ate), buscarPrs(repo, de, ate)])

  // ── Commits: imutáveis. Só entra o que ainda não existe — um upsert cego
  //    reescreveria as mesmas linhas a cada rodada e geraria WAL à toa.
  let commitsNovos = 0
  if (commits.length > 0) {
    const existentes = new Set<string>()
    for (let i = 0; i < commits.length; i += 200) {
      const { data, error } = await admin.from('devops_git_commits').select('commit_id')
        .eq('repo_id', repo.id).in('commit_id', commits.slice(i, i + 200).map((c) => c.commitId))
      if (error) throw new Error(`Leitura devops_git_commits: ${error.message}`)
      for (const r of data ?? []) existentes.add(r.commit_id)
    }
    const linhas = commits
      .filter((c) => !existentes.has(c.commitId) && c.author?.date)
      .map((c) => ({
        repo_id: repo.id,
        commit_id: c.commitId,
        project_name: repo.project_name,
        repo_name: repo.name,
        author_name: c.author?.name ?? null,
        author_email: c.author?.email?.toLowerCase() ?? null,
        author_date: c.author!.date,
        committer_date: c.committer?.date ?? null,
        comment: (c.comment ?? '').slice(0, TETO_COMENTARIO),
        adds: c.changeCounts?.Add ?? 0,
        edits: c.changeCounts?.Edit ?? 0,
        deletes: c.changeCounts?.Delete ?? 0,
        work_item_ids: idsValidos(c.workItems),
        web_url: c.remoteUrl ?? null,
        ingested_at: agora,
      }))
    for (let i = 0; i < linhas.length; i += 200) {
      const { error } = await admin.from('devops_git_commits')
        .upsert(linhas.slice(i, i + 200), { onConflict: 'repo_id,commit_id', ignoreDuplicates: true })
      if (error) throw new Error(`Gravação devops_git_commits: ${error.message}`)
    }
    commitsNovos = linhas.length
  }

  // ── PRs: mudam (estado, fechamento, itens vinculados). Grava só o que mudou.
  let prsGravados = 0
  if (prs.length > 0) {
    const { data: atuais, error } = await admin.from('devops_git_pull_requests')
      .select('pr_id,status,closed_date,title,is_draft,merge_status,work_item_ids')
      .eq('repo_id', repo.id).in('pr_id', prs.map((p) => p.pullRequestId))
    if (error) throw new Error(`Leitura devops_git_pull_requests: ${error.message}`)
    // deno-lint-ignore no-explicit-any
    const porId = new Map<number, any>((atuais ?? []).map((r: any) => [r.pr_id, r]))

    const linhas = []
    for (const pr of prs) {
      const itens = await buscarItensDoPr(repo, pr.pullRequestId)
      const atual = porId.get(pr.pullRequestId)
      const fechado = pr.closedDate ?? null
      const igual = atual
        && atual.status === (pr.status ?? null)
        && (atual.title ?? null) === (pr.title ?? null)
        && atual.is_draft === (pr.isDraft === true)
        && (atual.merge_status ?? null) === (pr.mergeStatus ?? null)
        && (atual.closed_date ? Date.parse(atual.closed_date) : null) === (fechado ? Date.parse(fechado) : null)
        && mesmosIds(atual.work_item_ids, itens)
      if (igual) continue
      linhas.push({
        repo_id: repo.id,
        pr_id: pr.pullRequestId,
        project_name: repo.project_name,
        repo_name: repo.name,
        title: pr.title ?? null,
        status: pr.status ?? null,
        is_draft: pr.isDraft === true,
        created_by_name: pr.createdBy?.displayName ?? null,
        created_by_email: pr.createdBy?.uniqueName?.toLowerCase() ?? null,
        creation_date: pr.creationDate,
        closed_date: fechado,
        source_branch: ramo(pr.sourceRefName),
        target_branch: ramo(pr.targetRefName),
        merge_status: pr.mergeStatus ?? null,
        work_item_ids: itens,
        web_url: repo.web_url ? `${repo.web_url}/pullrequest/${pr.pullRequestId}` : null,
        synced_at: agora,
      })
    }
    if (linhas.length > 0) {
      const { error: erroGravacao } = await admin.from('devops_git_pull_requests')
        .upsert(linhas, { onConflict: 'repo_id,pr_id' })
      if (erroGravacao) throw new Error(`Gravação devops_git_pull_requests: ${erroGravacao.message}`)
    }
    prsGravados = linhas.length
  }

  return { commitsLidos: commits.length, commitsNovos, prsLidos: prs.length, prsGravados }
}

const DATA = /^\d{4}-\d{2}-\d{2}$/

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }
  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })

  const inicio = Date.now()
  const admin = getSupabaseAdmin()

  try {
    const userId = await validateAuth(req)
    if (!userId) return json({ error: 'Autenticação obrigatória' }, 401)

    if (userId !== 'cron' && userId !== 'service-role-internal') {
      const { data: papel } = await admin.from('hub_user_global_roles')
        .select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle()
      const { data: legado } = papel ? { data: papel } : await admin.from('user_roles')
        .select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle()
      if (!papel && !legado) return json({ error: 'Permissão negada: apenas admins podem executar sincronização' }, 403)
    }

    const body = await req.json().catch(() => ({}))

    // Janela. Datas em Brasília (-03:00): é o calendário em que as horas são lançadas.
    let de: string, ate: string
    if (body?.from || body?.to) {
      if (!DATA.test(body?.from ?? '') || !DATA.test(body?.to ?? '') || body.from > body.to) {
        return json({ error: 'Informe from e to no formato AAAA-MM-DD, com from <= to' }, 400)
      }
      de = `${body.from}T00:00:00-03:00`
      ate = `${body.to}T23:59:59-03:00`
    } else {
      const dias = Math.min(Math.max(parseInt(body?.dias ?? '3', 10) || 3, 1), 120)
      ate = new Date().toISOString()
      de = new Date(Date.now() - dias * 86_400_000).toISOString()
    }

    const fatias = Math.min(Math.max(parseInt(body?.fatias ?? '1', 10) || 1, 1), 20)
    const fatia = Math.min(Math.max(parseInt(body?.fatia ?? '0', 10) || 0, 0), fatias - 1)

    let consulta = admin.from('devops_repos')
      .select('id, project_id, project_name, name, web_url')
      .eq('is_disabled', false)
      .order('id', { ascending: true })
    if (Array.isArray(body?.repo_ids) && body.repo_ids.length > 0) {
      consulta = consulta.in('id', body.repo_ids)
    } else {
      consulta = consulta.eq('aplicavel', true)
    }
    const { data: todos, error: erroRepos } = await consulta
    if (erroRepos) throw new Error(`Leitura devops_repos: ${erroRepos.message}`)

    const repos = ((todos ?? []) as Repo[]).filter((_, i) => i % fatias === fatia)

    const total = { commitsLidos: 0, commitsNovos: 0, prsLidos: 0, prsGravados: 0 }
    const erros: Array<{ repo: string; erro: string }> = []
    const naoProcessados: string[] = []
    let feitos = 0

    // Fila simples com PARALELO trabalhadores. Um repositório que falha não
    // derruba a rodada: vai para `erros` e os outros seguem.
    let proximo = 0
    const trabalhador = async () => {
      while (proximo < repos.length) {
        const repo = repos[proximo++]
        if (Date.now() - inicio > ORCAMENTO_MS) { naoProcessados.push(repo.id); continue }
        try {
          const r = await sincronizarRepo(admin, repo, de, ate)
          total.commitsLidos += r.commitsLidos; total.commitsNovos += r.commitsNovos
          total.prsLidos += r.prsLidos; total.prsGravados += r.prsGravados
          feitos++
        } catch (e) {
          erros.push({ repo: `${repo.project_name}/${repo.name}`, erro: (e as Error).message.slice(0, 200) })
        }
      }
    }
    await Promise.all(Array.from({ length: PARALELO }, trabalhador))

    const duracao = Date.now() - inicio
    const resumo = {
      janela: { de, ate }, fatia, fatias,
      repos: repos.length, repos_ok: feitos, repos_erro: erros.length, repos_nao_processados: naoProcessados.length,
      commits_lidos: total.commitsLidos, commits_novos: total.commitsNovos,
      prs_lidos: total.prsLidos, prs_gravados: total.prsGravados,
      duration_ms: duracao,
    }

    await admin.from('hub_raw_ingestions').insert({
      source_type: 'devops',
      source_key: 'git-commits-prs',
      external_id: DEVOPS_ORG,
      // `status` fica 'processed' mesmo com falha parcial: é o valor que as
      // outras rotinas gravam e o que o resto do portal conhece. O que deu
      // errado vai no payload (repos_erro, repos_nao_processados, erros).
      payload: { ...resumo, erros: erros.slice(0, 20) },
      status: 'processed',
      processed_at: new Date().toISOString(),
    })

    // `repo_ids_restantes` permite retomar exatamente de onde o tempo acabou.
    return json({ success: erros.length === 0, ...resumo, erros, repo_ids_restantes: naoProcessados })
  } catch (err) {
    console.error('[DevOpsGit] Error:', err)
    return json({ success: false, error: (err as Error).message }, 500)
  }
})
