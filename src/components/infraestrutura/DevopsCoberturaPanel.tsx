import { useMemo, useState } from 'react';
import {
  useDevopsRepos, useDevopsProjects, useClassificarRepo,
  computeCoberturaKpis, computeCoberturaPorProjeto, countPipelinesNovasTrimestre,
  reposLegadoAutomatico, ciCdNivel, DevopsRepo,
} from '@/hooks/useDevopsCobertura';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  FolderKanban, GitBranch, Workflow, Target, CheckCircle2, AlertTriangle,
  Archive, HelpCircle, Rocket, Database, Wand2, Filter, ChevronRight,
} from 'lucide-react';

// Filtro de coluna estilo funil com multi-seleção (vazio = todos)
function FunnelFilter({ opcoes, sel, onChange }: {
  opcoes: { value: string; label: string }[];
  sel: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const ativo = sel.size > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Filtrar coluna"
          className={`inline-flex items-center ml-1 align-middle transition-colors ${ativo ? 'text-primary' : 'text-muted-foreground/50 hover:text-muted-foreground'}`}
        >
          <Filter className={`h-3 w-3 ${ativo ? 'fill-current' : ''}`} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {opcoes.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={sel.has(o.value)}
            onCheckedChange={() => {
              const next = new Set(sel);
              if (next.has(o.value)) next.delete(o.value); else next.add(o.value);
              onChange(next);
            }}
            onSelect={(e) => e.preventDefault()}
            className="text-xs"
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={!ativo} onCheckedChange={() => onChange(new Set())} onSelect={(e) => e.preventDefault()} className="text-xs">
          Todos (limpar)
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
  const [bulkPending, setBulkPending] = useState(false);
  // Tabela analítica: agrupamento por projeto + filtros de coluna (funil)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [fCicd, setFCicd] = useState<Set<string>>(new Set());
  const [fSituacao, setFSituacao] = useState<Set<string>>(new Set());
  const [fAplicavel, setFAplicavel] = useState<Set<string>>(new Set());

  const situacaoDe = (r: DevopsRepo) => {
    if (r.is_disabled) return 'desabilitado';
    const dias = diasDesde(r.last_commit_date);
    return dias != null && dias > LEGADO_DIAS_SEM_COMMIT ? 'legado' : 'ativo';
  };
  const cicdKeyDe = (r: DevopsRepo) => {
    const nivel = ciCdNivel(r);
    return nivel === 'descoberto' ? 'sem_pipeline' : nivel;
  };
  const aplicavelKeyDe = (r: DevopsRepo) =>
    r.aplicavel === true ? 'aplicavel' : r.aplicavel === false ? 'nao_aplicavel' : 'pendente';

  const toggleExpandido = (proj: string) =>
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(proj)) next.delete(proj); else next.add(proj);
      return next;
    });

  const legadosAuto = useMemo(() => reposLegadoAutomatico(repos ?? [], LEGADO_DIAS_SEM_COMMIT), [repos]);

  async function handleAutoLegado() {
    if (legadosAuto.length === 0) return;
    if (!window.confirm(`Marcar ${legadosAuto.length} repositório(s) sem interação há +${LEGADO_DIAS_SEM_COMMIT} dias (ou desabilitados) como NÃO aplicáveis (legado)?`)) return;
    setBulkPending(true);
    try {
      for (const repo of legadosAuto) {
        await classificar.mutateAsync({
          repoId: repo.id,
          aplicavel: false,
          obs: `auto: sem interação há +${LEGADO_DIAS_SEM_COMMIT} dias`,
        });
      }
    } finally {
      setBulkPending(false);
    }
  }

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

  // Filtros de coluna (funil) aplicados sobre os chips
  const reposFiltrados = useMemo(() => filtrados.filter((r) => {
    if (fCicd.size > 0 && !fCicd.has(cicdKeyDe(r))) return false;
    if (fSituacao.size > 0 && !fSituacao.has(situacaoDe(r))) return false;
    if (fAplicavel.size > 0 && !fAplicavel.has(aplicavelKeyDe(r))) return false;
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [filtrados, fCicd, fSituacao, fAplicavel]);

  // Agrupamento por projeto
  const grupos = useMemo(() => {
    const map = new Map<string, DevopsRepo[]>();
    for (const r of reposFiltrados) {
      if (!map.has(r.project_name)) map.set(r.project_name, []);
      map.get(r.project_name)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [reposFiltrados]);

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
        {legadosAuto.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7 text-xs gap-1.5"
            onClick={handleAutoLegado}
            disabled={bulkPending}
          >
            <Wand2 className="h-3.5 w-3.5" />
            {bulkPending ? 'Classificando…' : `Auto-classificar ${legadosAuto.length} legados`}
          </Button>
        )}
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
              ) : (
                <>
                  {porProjeto.map(p => {
                    const classificado = p.coberturaPct != null;
                    const pct = classificado ? p.coberturaPct! : p.pipelinePct;
                    return (
                      <div key={p.projeto}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium truncate pr-2">{p.projeto}</span>
                          <span className="text-muted-foreground shrink-0">
                            {p.repos} repos · {p.pipelinesAtivas} pipelines · {p.completos} CI/CD ·{' '}
                            <span className={`font-bold font-mono ${!classificado ? 'text-blue-500' : pct >= META_COBERTURA_PCT ? 'text-emerald-500' : 'text-amber-500'}`}>
                              {pct}%{!classificado && '*'}
                            </span>
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${!classificado ? 'bg-blue-500/70' : pct >= META_COBERTURA_PCT ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {porProjeto.some(p => p.coberturaPct == null) && (
                    <p className="text-[10px] text-muted-foreground pt-1">
                      * % de repos com pipeline ativa — projeto ainda sem classificação de aplicabilidade (cobertura da meta usa só repos aplicáveis).
                    </p>
                  )}
                </>
              )}
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
            {reposFiltrados.length} repositório{reposFiltrados.length !== 1 ? 's' : ''} em {grupos.length} projeto{grupos.length !== 1 ? 's' : ''} · clique no projeto para expandir · funil nas colunas filtra
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
          ) : reposFiltrados.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhum repositório para os filtros selecionados.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex items-center justify-end gap-2 px-4 py-1.5 border-b border-border/60">
                <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors" onClick={() => setExpandidos(new Set(grupos.map(([p]) => p)))}>Expandir todos</button>
                <span className="text-muted-foreground/40">·</span>
                <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors" onClick={() => setExpandidos(new Set())}>Recolher todos</button>
              </div>
              <table className="w-full text-xs">
                <thead className="border-b border-border">
                  <tr className="text-muted-foreground text-[11px]">
                    <th className="py-2 pl-4 pr-3 text-left font-medium">Projeto / Repositório</th>
                    <th className="py-2 px-3 text-left font-medium">Último commit</th>
                    <th className="py-2 px-3 text-center font-medium">Pipelines</th>
                    <th className="py-2 px-3 text-left font-medium whitespace-nowrap">
                      CI/CD
                      <FunnelFilter
                        opcoes={[
                          { value: 'completo', label: 'Completo (CI+CD)' },
                          { value: 'parcial', label: 'Parcial (só CI)' },
                          { value: 'sem_pipeline', label: 'Sem pipeline' },
                        ]}
                        sel={fCicd}
                        onChange={setFCicd}
                      />
                    </th>
                    <th className="py-2 px-3 text-left font-medium whitespace-nowrap">
                      Situação
                      <FunnelFilter
                        opcoes={[
                          { value: 'ativo', label: 'Ativo' },
                          { value: 'legado', label: 'Possível legado' },
                          { value: 'desabilitado', label: 'Desabilitado' },
                        ]}
                        sel={fSituacao}
                        onChange={setFSituacao}
                      />
                    </th>
                    <th className="py-2 px-4 text-left font-medium w-44 whitespace-nowrap">
                      Aplicável?
                      <FunnelFilter
                        opcoes={[
                          { value: 'aplicavel', label: 'Aplicável' },
                          { value: 'nao_aplicavel', label: 'Não aplicável' },
                          { value: 'pendente', label: 'Não classificado' },
                        ]}
                        sel={fAplicavel}
                        onChange={setFAplicavel}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum repositório para os filtros selecionados.</td></tr>
                  )}
                  {grupos.map(([proj, lista]) => {
                    const aberto = expandidos.has(proj);
                    const ativas = lista.reduce((s, r) => s + r.active_pipeline_count, 0);
                    const completos = lista.filter(r => ciCdNivel(r) === 'completo').length;
                    const comCi = lista.filter(r => r.active_pipeline_count > 0).length;
                    return [
                      <tr
                        key={proj}
                        className="bg-muted/40 border-b border-border cursor-pointer hover:bg-muted/60 transition-colors"
                        onClick={() => toggleExpandido(proj)}
                      >
                        <td colSpan={6} className="py-2 pl-3 pr-4">
                          <div className="flex items-center gap-2">
                            <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${aberto ? 'rotate-90' : ''}`} />
                            <FolderKanban className="h-3.5 w-3.5 text-primary" />
                            <span className="font-semibold">{proj}</span>
                            <span className="text-[11px] text-muted-foreground ml-2">
                              {lista.length} repo{lista.length !== 1 ? 's' : ''} · {comCi} com CI · {completos} CI/CD completo · {ativas} pipelines ativas
                            </span>
                          </div>
                        </td>
                      </tr>,
                      ...(aberto ? lista.map(repo => {
                        const dias = diasDesde(repo.last_commit_date);
                        const possLegado = !repo.is_disabled && dias != null && dias > LEGADO_DIAS_SEM_COMMIT;
                        const nivel = ciCdNivel(repo);
                        return (
                          <tr key={repo.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                            <td className="py-2 pl-10 pr-3 font-semibold">
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
                            <td className="py-2 px-3 whitespace-nowrap">
                              {nivel === 'descoberto' ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <span className="font-mono text-[10px]" title={nivel === 'completo' ? `${repo.active_pipeline_count} pipeline(s) + ${repo.release_count} release(s) — build ao deploy` : 'Pipeline sem release definition — CI sem CD (ou deploy embutido em YAML)'}>
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">CI ✓</span>
                                  <span className="text-muted-foreground"> · </span>
                                  <span className={repo.release_count > 0 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-muted-foreground'}>CD {repo.release_count > 0 ? '✓' : '—'}</span>
                                </span>
                              )}
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
                      }) : []),
                    ];
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
