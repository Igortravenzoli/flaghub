import { useMemo, useState } from 'react';
import {
  useDevopsRepos, useDevopsProjects, useClassificarRepo,
  computeCoberturaKpis, computeCoberturaPorProjeto, countPipelinesNovasTrimestre,
  DevopsRepo,
} from '@/hooks/useDevopsCobertura';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FolderKanban, GitBranch, Workflow, Target, CheckCircle2, AlertTriangle,
  Archive, HelpCircle, Rocket, Database,
} from 'lucide-react';

// ── Constantes ────────────────────────────────────────────────────────
// Visão gerencial: Projetos → Repositórios → Pipelines ativas, com
// classificação manual de aplicabilidade (repos legados não justificam
// esteira) e metas de cobertura/novas pipelines.

const META_COBERTURA_PCT = 80;       // meta de cobertura p/ repos aplicáveis
const META_PIPELINES_TRIMESTRE = 3;  // meta de pipelines novas por trimestre
const LEGADO_DIAS_SEM_COMMIT = 180;  // sugestão visual de repo possivelmente legado

type RepoFiltro = 'todos' | 'aplicaveis' | 'sem_pipeline' | 'nao_aplicaveis' | 'pendentes';

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
  catch { return '—'; }
}

function diasDesde(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return null;
  return Math.floor((Date.now() - d) / 86400000);
}

// ── Painel principal ──────────────────────────────────────────────────

export function DevopsCoberturaPanel() {
  const { data: repos, isLoading: loadingRepos, isError, refetch } = useDevopsRepos();
  const { data: projects, isLoading: loadingProjects } = useDevopsProjects();
  const classificar = useClassificarRepo();
  const [filtro, setFiltro] = useState<RepoFiltro>('todos');

  const isLoading = loadingRepos || loadingProjects;
  const kpis = useMemo(
    () => computeCoberturaKpis(repos ?? [], projects?.length ?? 0),
    [repos, projects]
  );
  const porProjeto = useMemo(() => computeCoberturaPorProjeto(repos ?? []), [repos]);
  const novasTri = useMemo(() => countPipelinesNovasTrimestre(repos ?? []), [repos]);

  const filtrados = useMemo(() => {
    const lista = repos ?? [];
    switch (filtro) {
      case 'aplicaveis': return lista.filter(r => r.aplicavel === true);
      case 'sem_pipeline': return lista.filter(r => r.aplicavel === true && r.active_pipeline_count === 0);
      case 'nao_aplicaveis': return lista.filter(r => r.aplicavel === false);
      case 'pendentes': return lista.filter(r => r.aplicavel == null);
      default: return lista;
    }
  }, [repos, filtro]);

  if (isError) return <DashboardEmptyState variant="error" onRetry={() => refetch()} />;

  const lastSync = repos?.length ? repos.reduce((m, r) => r.synced_at > m ? r.synced_at : m, repos[0].synced_at) : null;
  const coberturaOk = kpis.coberturaPct != null && kpis.coberturaPct >= META_COBERTURA_PCT;

  const toggleFiltro = (f: RepoFiltro) => setFiltro(prev => prev === f ? 'todos' : f);

  function handleClassificar(repo: DevopsRepo, value: string) {
    const aplicavel = value === 'aplicavel' ? true : value === 'nao_aplicavel' ? false : null;
    classificar.mutate({ repoId: repo.id, aplicavel });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Workflow className="h-5 w-5 text-primary" />
        <h2 className="text-base font-bold tracking-tight uppercase">DevOps · Cobertura de Automações</h2>
        <span className="text-[11px] text-muted-foreground ml-1">
          org FlagIW{lastSync ? ` · sincronizado em ${fmtDate(lastSync)}` : ''}
        </span>
      </div>

      {/* Visão gerencial */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Projetos', value: kpis.totalProjetos, icon: FolderKanban, color: '#3b82f6', sub: undefined as string | undefined },
          { label: 'Repositórios', value: kpis.totalRepos, icon: GitBranch, color: '#8b5cf6', sub: kpis.reposDesabilitados > 0 ? `${kpis.reposDesabilitados} desabilitados` : undefined },
          { label: 'Pipelines ativas', value: kpis.pipelinesAtivas, icon: Workflow, color: '#10b981', sub: undefined },
          {
            label: `Cobertura (meta ${META_COBERTURA_PCT}%)`,
            value: kpis.coberturaPct != null ? `${kpis.coberturaPct}%` : '—',
            icon: Target,
            color: kpis.coberturaPct == null ? '#94a3b8' : coberturaOk ? '#10b981' : '#f59e0b',
            sub: kpis.coberturaPct == null ? 'classifique os repositórios' : `${kpis.aplicaveisComPipeline}/${kpis.aplicaveis} aplicáveis cobertos`,
          },
        ].map(({ label, value, icon: Icon, color, sub }) => (
          <div key={label} className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1 rounded-md" style={{ background: `${color}15` }}>
                <Icon className="h-3 w-3" style={{ color }} />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
            </div>
            {isLoading ? <Skeleton className="h-8 w-14" /> : (
              <>
                <span className="text-2xl font-bold font-mono" style={{ color }}>{value}</span>
                {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Classificação — etapa 1: validar repositórios */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { key: 'aplicaveis' as RepoFiltro, label: 'Aplicáveis', value: kpis.aplicaveis, icon: CheckCircle2, color: '#10b981' },
          { key: 'sem_pipeline' as RepoFiltro, label: 'Aplicáveis sem pipeline', value: kpis.aplicaveisSemPipeline, icon: AlertTriangle, color: kpis.aplicaveisSemPipeline > 0 ? '#f59e0b' : '#94a3b8' },
          { key: 'nao_aplicaveis' as RepoFiltro, label: 'Não aplicáveis (legado)', value: kpis.naoAplicaveis, icon: Archive, color: '#64748b' },
          { key: 'pendentes' as RepoFiltro, label: 'Não classificados', value: kpis.naoClassificados, icon: HelpCircle, color: kpis.naoClassificados > 0 ? '#ef4444' : '#94a3b8' },
        ].map(({ key, label, value, icon: Icon, color }) => (
          <button
            key={key}
            onClick={() => toggleFiltro(key)}
            className={`text-left rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/30 ${filtro === key ? 'border-primary bg-primary/5' : 'border-border'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1 rounded-md" style={{ background: `${color}15` }}>
                <Icon className="h-3 w-3" style={{ color }} />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
            </div>
            {isLoading ? <Skeleton className="h-7 w-12" /> : (
              <span className="text-xl font-bold font-mono" style={{ color }}>{value}</span>
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Meta trimestral de pipelines novas */}
        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground mb-3">PIPELINES NOVAS — {novasTri.trimestre} (META {META_PIPELINES_TRIMESTRE})</p>
          {isLoading ? <Skeleton className="h-24 w-full" /> : (
            <>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl font-bold font-mono">{novasTri.criadas.length}</span>
                <span className="text-lg text-muted-foreground font-mono">/ {META_PIPELINES_TRIMESTRE}</span>
                {novasTri.criadas.length >= META_PIPELINES_TRIMESTRE ? (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Meta atingida
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400">
                    <Rocket className="h-3.5 w-3.5" /> Em andamento
                  </span>
                )}
              </div>
              <div className="relative h-2 rounded-full bg-muted overflow-hidden mb-3">
                <div className="absolute left-0 top-0 h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, (novasTri.criadas.length / META_PIPELINES_TRIMESTRE) * 100)}%` }} />
              </div>
              <div className="space-y-1.5">
                {novasTri.criadas.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma pipeline criada neste trimestre (com base em createdDate das definitions).</p>
                ) : novasTri.criadas.slice(0, 6).map(p => (
                  <div key={`${p.repo}-${p.nome}`} className="flex items-center gap-2 text-xs">
                    <Workflow className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span className="font-mono font-semibold truncate">{p.nome}</span>
                    <span className="text-muted-foreground truncate">· {p.projeto}/{p.repo}</span>
                    <span className="text-muted-foreground ml-auto shrink-0">{fmtDate(p.criadaEm)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Cobertura por projeto */}
        <Card>
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-xs font-medium text-muted-foreground">COBERTURA POR PROJETO</CardTitle>
          </CardHeader>
          <CardContent className="pt-2 pb-4 space-y-2.5 max-h-56 overflow-y-auto">
            {isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)
              : porProjeto.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem dados — sincronize o inventário DevOps.</p>
              ) : porProjeto.map(p => (
                <div key={p.projeto}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium truncate pr-2">{p.projeto}</span>
                    <span className="text-muted-foreground shrink-0">
                      {p.repos} repos · {p.aplicaveis} aplic. ·{' '}
                      <span className={`font-bold font-mono ${p.coberturaPct == null ? 'text-muted-foreground' : p.coberturaPct >= META_COBERTURA_PCT ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {p.coberturaPct != null ? `${p.coberturaPct}%` : '—'}
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${p.coberturaPct != null && p.coberturaPct >= META_COBERTURA_PCT ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${p.coberturaPct ?? 0}%` }}
                    />
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      {/* Inventário de repositórios + classificação */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            Repositórios
            {filtro !== 'todos' && <Badge variant="secondary" className="text-[10px]">{filtro.replace('_', ' ')}</Badge>}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {filtrados.length} repositório{filtrados.length !== 1 ? 's' : ''} · classifique a aplicabilidade para compor a cobertura
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (repos ?? []).length === 0 ? (
            <div className="py-10 text-center space-y-1">
              <p className="text-sm text-muted-foreground">Nenhum repositório sincronizado ainda.</p>
              <p className="text-xs text-muted-foreground">Use "Sincronizar repositórios DevOps" no menu de sincronização do setor.</p>
            </div>
          ) : filtrados.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhum repositório para o filtro selecionado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-border">
                  <tr className="text-muted-foreground text-[11px]">
                    <th className="py-2 pl-4 pr-3 text-left font-medium">Projeto</th>
                    <th className="py-2 px-3 text-left font-medium">Repositório</th>
                    <th className="py-2 px-3 text-left font-medium">Último commit</th>
                    <th className="py-2 px-3 text-center font-medium">Pipelines (ativas/total)</th>
                    <th className="py-2 px-3 text-left font-medium">Situação</th>
                    <th className="py-2 px-4 text-left font-medium w-44">Aplicável?</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(repo => {
                    const dias = diasDesde(repo.last_commit_date);
                    const possLegado = !repo.is_disabled && dias != null && dias > LEGADO_DIAS_SEM_COMMIT;
                    return (
                      <tr key={repo.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                        <td className="py-2 pl-4 pr-3 text-muted-foreground">{repo.project_name}</td>
                        <td className="py-2 px-3 font-semibold">
                          {repo.web_url ? (
                            <a href={repo.web_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                              <GitBranch className="h-3 w-3" />{repo.name}
                            </a>
                          ) : repo.name}
                        </td>
                        <td className="py-2 px-3">
                          {repo.last_commit_date ? (
                            <span className={possLegado ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>
                              {fmtDate(repo.last_commit_date)}{dias != null && <span className="font-mono"> ({dias}d)</span>}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`font-mono font-bold ${repo.active_pipeline_count > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                            {repo.active_pipeline_count}/{repo.pipeline_count}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          {repo.is_disabled
                            ? <Badge variant="outline" className="text-[10px] text-muted-foreground">Desabilitado</Badge>
                            : possLegado
                              ? <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/40">Possível legado</Badge>
                              : <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/40">Ativo</Badge>}
                        </td>
                        <td className="py-2 px-4">
                          <Select
                            value={repo.aplicavel === true ? 'aplicavel' : repo.aplicavel === false ? 'nao_aplicavel' : 'pendente'}
                            onValueChange={(v) => handleClassificar(repo, v)}
                            disabled={classificar.isPending}
                          >
                            <SelectTrigger className="h-7 text-xs w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pendente">— Classificar</SelectItem>
                              <SelectItem value="aplicavel">✓ Aplicável</SelectItem>
                              <SelectItem value="nao_aplicavel">✗ Não aplicável</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
