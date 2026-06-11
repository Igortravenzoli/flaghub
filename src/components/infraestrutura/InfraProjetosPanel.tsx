import { useMemo, useState } from 'react';
import { useBIInfraProjetos, InfraProjeto } from '@/hooks/useBIInfra';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FolderKanban, GitBranch, GitPullRequestArrow, Target, CheckCircle2,
  AlertTriangle, Rocket,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';

// ── Constantes ────────────────────────────────────────────────────────
// Gestão dos projetos de infra sem esteira + métrica: 3 pipelines novas/trimestre.

type ProjetoFiltro = 'todos' | 'sem' | 'com';

const PRIORIDADE_VARIANT: Record<InfraProjeto['prioridade'], 'destructive' | 'secondary' | 'outline'> = {
  Alta: 'destructive', Média: 'secondary', Baixa: 'outline',
};

const STATUS_COLOR: Record<InfraProjeto['status'], string> = {
  'Ativo': '#10b981', 'Em implantação': '#3b82f6', 'Pausado': '#94a3b8',
};

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
  catch { return '—'; }
}

// Ritmo esperado: meta proporcional ao tempo decorrido do trimestre.
function ritmoMeta(criadas: number, meta: number, inicio: string, fim: string) {
  if (criadas >= meta) return { label: 'Meta atingida', color: '#10b981', Icon: CheckCircle2 };
  const ini = new Date(inicio).getTime();
  const end = new Date(fim).getTime();
  const agora = Date.now();
  const fracao = Math.min(1, Math.max(0, (agora - ini) / (end - ini)));
  const esperado = meta * fracao;
  if (criadas >= esperado) return { label: 'No ritmo', color: '#3b82f6', Icon: Rocket };
  return { label: 'Abaixo do ritmo', color: '#f59e0b', Icon: AlertTriangle };
}

// ── Painel principal ──────────────────────────────────────────────────

export function InfraProjetosPanel() {
  const { data, isLoading, isError, refetch } = useBIInfraProjetos();
  const [filtro, setFiltro] = useState<ProjetoFiltro>('sem');

  const projetosFiltrados = useMemo(() => {
    const lista = data?.projetos ?? [];
    if (filtro === 'sem') return lista.filter(p => !p.temPipeline);
    if (filtro === 'com') return lista.filter(p => p.temPipeline);
    return lista;
  }, [data?.projetos, filtro]);

  if (isError) return <DashboardEmptyState variant="error" onRetry={() => refetch()} />;

  const meta = data?.meta.pipelinesPorTrimestre ?? 3;
  const tri = data?.trimestreAtual;
  const ritmo = tri ? ritmoMeta(tri.criadas, meta, tri.inicio, tri.fim) : null;
  const cobertura = data ? Math.round((data.resumo.comPipeline / Math.max(1, data.resumo.totalProjetos)) * 100) : 0;

  const historico = (data?.historico ?? []).map(h => ({ ...h, atingiu: h.criadas >= meta }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FolderKanban className="h-5 w-5 text-primary" />
        <h2 className="text-base font-bold tracking-tight uppercase">Projetos & Pipelines</h2>
        <span className="text-[11px] text-muted-foreground ml-1">meta: {meta} pipelines novas por trimestre</span>
      </div>

      {/* Resumo da carteira */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Projetos de infra', value: data?.resumo.totalProjetos, icon: FolderKanban, color: '#3b82f6', onClick: () => setFiltro('todos'), active: filtro === 'todos' },
          { label: 'Com pipeline', value: data?.resumo.comPipeline, icon: GitBranch, color: '#10b981', onClick: () => setFiltro('com'), active: filtro === 'com' },
          { label: 'Sem pipeline', value: data?.resumo.semPipeline, icon: GitPullRequestArrow, color: '#f59e0b', onClick: () => setFiltro('sem'), active: filtro === 'sem' },
          { label: 'Cobertura de esteira', value: data ? `${cobertura}%` : undefined, icon: Target, color: cobertura >= 70 ? '#10b981' : '#f59e0b' },
        ].map(({ label, value, icon: Icon, color, onClick, active }) => (
          <button
            key={label}
            onClick={onClick}
            disabled={!onClick}
            className={`text-left rounded-xl border bg-card px-4 py-3 transition-colors ${onClick ? 'hover:bg-muted/30' : 'cursor-default'} ${active ? 'border-primary bg-primary/5' : 'border-border'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1 rounded-md" style={{ background: `${color}15` }}>
                <Icon className="h-3 w-3" style={{ color }} />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
            </div>
            {isLoading ? <Skeleton className="h-8 w-14" /> : (
              <span className="text-2xl font-bold font-mono" style={{ color }}>{value ?? '—'}</span>
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Meta do trimestre */}
        <Card className="p-6">
          <p className="text-xs font-medium text-muted-foreground mb-4">META DO TRIMESTRE — PIPELINES NOVAS</p>
          {isLoading || !tri || !ritmo ? (
            <div className="space-y-3"><Skeleton className="h-9 w-32" /><Skeleton className="h-2 w-full rounded-full" /><Skeleton className="h-4 w-40" /></div>
          ) : (
            <>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-4xl font-bold font-mono">{tri.criadas}</span>
                  <span className="text-xl text-muted-foreground font-mono"> / {meta}</span>
                  <p className="text-xs text-muted-foreground mt-1">{tri.trimestre} · {fmtDate(tri.inicio)} a {fmtDate(tri.fim)}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: `${ritmo.color}15`, color: ritmo.color }}>
                  <ritmo.Icon className="h-3.5 w-3.5" />
                  {ritmo.label}
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-muted overflow-hidden mb-4">
                <div className="absolute left-0 top-0 h-full transition-all duration-500" style={{ width: `${Math.min(100, (tri.criadas / meta) * 100)}%`, background: ritmo.color }} />
              </div>
              <div className="space-y-2 pt-3 border-t border-border">
                <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Entregues no trimestre</p>
                {(data?.pipelinesNovas ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma pipeline criada neste trimestre ainda.</p>
                ) : (
                  data!.pipelinesNovas.map(p => (
                    <div key={p.nome} className="flex items-center gap-2 text-xs">
                      <GitBranch className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <span className="font-mono font-semibold">{p.nome}</span>
                      <span className="text-muted-foreground truncate">· {p.projeto}</span>
                      <span className="text-muted-foreground ml-auto shrink-0">{fmtDate(p.criadaEm)} · {p.responsavel}</span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </Card>

        {/* Histórico por trimestre */}
        <Card>
          <CardHeader className="pb-1 pt-5 px-6">
            <CardTitle className="text-xs font-medium text-muted-foreground">HISTÓRICO — PIPELINES NOVAS POR TRIMESTRE</CardTitle>
          </CardHeader>
          <CardContent className="pt-2 pb-4">
            {isLoading ? <Skeleton className="h-44 w-full" /> : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={historico} margin={{ top: 12, right: 8, left: -24, bottom: 0 }}>
                    <XAxis dataKey="trimestre" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, Math.max(meta + 1, ...historico.map(h => h.criadas))]} />
                    <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [v, 'Pipelines criadas']} />
                    <ReferenceLine y={meta} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: `meta ${meta}`, position: 'right', fontSize: 10, fill: '#f59e0b' }} />
                    <Bar dataKey="criadas" radius={[4, 4, 0, 0]} maxBarSize={48}>
                      {historico.map(h => <Cell key={h.trimestre} fill={h.atingiu ? '#10b981' : '#3b82f6'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Carteira de projetos */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">
            {filtro === 'sem' ? 'Projetos sem pipeline' : filtro === 'com' ? 'Projetos com pipeline' : 'Todos os projetos'}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {projetosFiltrados.length} projeto{projetosFiltrados.length !== 1 ? 's' : ''}
            {filtro === 'sem' && ' · plano de esteira por trimestre'}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : projetosFiltrados.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhum projeto para o filtro selecionado.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="border-b border-border">
                <tr className="text-muted-foreground text-[11px]">
                  <th className="py-2 pl-4 pr-3 text-left font-medium">Projeto</th>
                  <th className="py-2 px-3 text-left font-medium">Ambiente</th>
                  <th className="py-2 px-3 text-left font-medium">Responsável</th>
                  <th className="py-2 px-3 text-left font-medium">Status</th>
                  <th className="py-2 px-3 text-left font-medium">Prioridade</th>
                  <th className="py-2 px-3 text-left font-medium">Pipeline</th>
                  <th className="py-2 px-4 text-left font-medium">{filtro === 'com' ? 'Criada em' : 'Próximo passo / Previsão'}</th>
                </tr>
              </thead>
              <tbody>
                {projetosFiltrados.map(p => (
                  <tr key={p.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 pl-4 pr-3 font-semibold">{p.nome}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{p.ambiente}</td>
                    <td className="py-2.5 px-3">{p.responsavel}</td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[p.status] }} />
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3"><Badge variant={PRIORIDADE_VARIANT[p.prioridade]} className="text-[10px]">{p.prioridade}</Badge></td>
                    <td className="py-2.5 px-3">
                      {p.temPipeline ? (
                        <span className="inline-flex items-center gap-1 font-mono text-emerald-600 dark:text-emerald-400">
                          <GitBranch className="h-3 w-3" />{p.pipelineNome}
                        </span>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/40">Sem pipeline</Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-muted-foreground max-w-[260px]">
                      {p.temPipeline ? fmtDate(p.pipelineCriadaEm) : (
                        <span className="inline-flex items-center gap-2">
                          <span className="truncate">{p.proximoPasso ?? '—'}</span>
                          {p.previsaoPipeline && <Badge variant="secondary" className="text-[10px] shrink-0">{p.previsaoPipeline}</Badge>}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
