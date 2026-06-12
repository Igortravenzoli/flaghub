import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ── Types ──────────────────────────────────────────────────────────────
// Inventário DevOps (org FlagIW) sincronizado pela edge function
// devops-sync-repos: projetos → repositórios → pipelines (build definitions).
// Classificação manual por repo: aplicavel = true | false (legado) | null.

export interface DevopsRepoPipeline {
  id: number;
  name: string;
  path: string | null;
  queueStatus: string | null;
  createdDate: string | null;
  webUrl: string | null;
}

export interface DevopsRepo {
  id: string;
  project_id: string;
  project_name: string;
  name: string;
  default_branch: string | null;
  size_bytes: number | null;
  web_url: string | null;
  is_disabled: boolean;
  last_commit_date: string | null;
  pipeline_count: number;
  active_pipeline_count: number;
  pipelines: DevopsRepoPipeline[];
  aplicavel: boolean | null;
  classificacao_obs: string | null;
  classificado_em: string | null;
  synced_at: string;
}

export interface DevopsProject {
  id: string;
  name: string;
  state: string | null;
  web_url: string | null;
  repo_count: number;
  pipeline_count: number;
  release_definition_count: number;
  synced_at: string;
}

export interface CoberturaKpis {
  totalProjetos: number;
  totalRepos: number;
  reposDesabilitados: number;
  pipelinesAtivas: number;
  aplicaveis: number;
  naoAplicaveis: number;
  naoClassificados: number;
  aplicaveisComPipeline: number;
  aplicaveisSemPipeline: number;
  /** % de repos aplicáveis cobertos por ao menos 1 pipeline ativa (null sem classificação) */
  coberturaPct: number | null;
}

export interface CoberturaProjeto {
  projeto: string;
  repos: number;
  aplicaveis: number;
  cobertos: number;
  coberturaPct: number | null;
}

// ── Pure helpers (testáveis) ───────────────────────────────────────────

export function computeCoberturaKpis(repos: DevopsRepo[], totalProjetos: number): CoberturaKpis {
  const aplicaveis = repos.filter(r => r.aplicavel === true);
  const aplicaveisComPipeline = aplicaveis.filter(r => r.active_pipeline_count > 0).length;
  return {
    totalProjetos,
    totalRepos: repos.length,
    reposDesabilitados: repos.filter(r => r.is_disabled).length,
    pipelinesAtivas: repos.reduce((s, r) => s + r.active_pipeline_count, 0),
    aplicaveis: aplicaveis.length,
    naoAplicaveis: repos.filter(r => r.aplicavel === false).length,
    naoClassificados: repos.filter(r => r.aplicavel === null || r.aplicavel === undefined).length,
    aplicaveisComPipeline,
    aplicaveisSemPipeline: aplicaveis.length - aplicaveisComPipeline,
    coberturaPct: aplicaveis.length > 0
      ? Math.round((aplicaveisComPipeline / aplicaveis.length) * 100)
      : null,
  };
}

export function computeCoberturaPorProjeto(repos: DevopsRepo[]): CoberturaProjeto[] {
  const byProj = new Map<string, DevopsRepo[]>();
  for (const r of repos) {
    if (!byProj.has(r.project_name)) byProj.set(r.project_name, []);
    byProj.get(r.project_name)!.push(r);
  }
  return [...byProj.entries()]
    .map(([projeto, list]) => {
      const aplicaveis = list.filter(r => r.aplicavel === true);
      const cobertos = aplicaveis.filter(r => r.active_pipeline_count > 0).length;
      return {
        projeto,
        repos: list.length,
        aplicaveis: aplicaveis.length,
        cobertos,
        coberturaPct: aplicaveis.length > 0 ? Math.round((cobertos / aplicaveis.length) * 100) : null,
      };
    })
    .sort((a, b) => b.repos - a.repos);
}

/** Pipelines criadas dentro do trimestre civil de `ref` (meta: 3 novas/trimestre). */
export function countPipelinesNovasTrimestre(repos: DevopsRepo[], ref: Date = new Date()): {
  trimestre: string;
  criadas: { nome: string; repo: string; projeto: string; criadaEm: string }[];
} {
  const q = Math.floor(ref.getMonth() / 3);
  const ini = new Date(ref.getFullYear(), q * 3, 1);
  const fim = new Date(ref.getFullYear(), q * 3 + 3, 1);
  const criadas: { nome: string; repo: string; projeto: string; criadaEm: string }[] = [];
  for (const r of repos) {
    for (const p of r.pipelines ?? []) {
      if (!p.createdDate) continue;
      const d = new Date(p.createdDate);
      if (d >= ini && d < fim) {
        criadas.push({ nome: p.name, repo: r.name, projeto: r.project_name, criadaEm: p.createdDate });
      }
    }
  }
  criadas.sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
  return { trimestre: `T${q + 1}/${ref.getFullYear()}`, criadas };
}

// ── Hooks ──────────────────────────────────────────────────────────────

export function useDevopsRepos() {
  return useQuery({
    queryKey: ['devops-cobertura', 'repos'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('devops_repos')
        .select('*')
        .order('project_name', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as DevopsRepo[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useDevopsProjects() {
  return useQuery({
    queryKey: ['devops-cobertura', 'projects'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('devops_projects')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as DevopsProject[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useClassificarRepo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ repoId, aplicavel, obs }: { repoId: string; aplicavel: boolean | null; obs?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('rpc_devops_repo_classificar', {
        p_repo_id: repoId,
        p_aplicavel: aplicavel,
        p_obs: obs ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devops-cobertura'] });
    },
  });
}
