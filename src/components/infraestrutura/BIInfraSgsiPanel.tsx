import { ReactNode, useState } from 'react';
import { useBIInfraSgsi, NameValue, SimNao } from '@/hooks/useBIInfra';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ShieldCheck, RefreshCw, Flame, AlertTriangle, FileWarning, KeyRound,
  Lightbulb, CalendarCheck,
} from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

// ── Constantes ────────────────────────────────────────────────────────
// Espelho refatorado do Power BI "SG-LST Usecase 1.04" (8 páginas → 6 visões).

const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

const STATUS_COLORS: Record<string, string> = {
  'Concluído': '#10b981', 'Concedido': '#10b981', 'Tratado': '#10b981', 'Encerrada': '#10b981', 'Implementada': '#10b981', 'Resolvido': '#10b981', 'Dentro do SLA': '#10b981',
  'Pendente': '#f59e0b', 'Em análise': '#f59e0b', 'Em tratamento': '#f59e0b', 'Em andamento': '#f59e0b', 'Contornado': '#f59e0b', 'Avaliação': '#f59e0b',
  'Aguardando Gestor': '#8b5cf6', 'Aguardando TI': '#3b82f6', 'Revogado': '#64748b', 'Aceito': '#06b6d4', 'Revisão': '#06b6d4',
  'Ativo': '#ef4444', 'Aberta': '#ef4444', 'Novo': '#ef4444', 'Fora do SLA': '#ef4444', 'Backlog': '#64748b',
};

function colorFor(name: string, i: number) {
  return STATUS_COLORS[name] ?? PALETTE[i % PALETTE.length];
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
  catch { return '—'; }
}

function pct(parte: number, todo: number) {
  return todo > 0 ? Math.round((parte / todo) * 100) : 0;
}

// ── Building blocks ───────────────────────────────────────────────────

function KpiTile({ label, value, sub, color, onClick, active }: {
  label: string; value: ReactNode; sub?: ReactNode; color?: string;
  onClick?: () => void; active?: boolean;
}) {
  const className = `text-left w-full rounded-xl border bg-card px-4 py-3 space-y-1 ${onClick ? 'transition-colors hover:bg-muted/30 cursor-pointer' : ''} ${active ? 'border-primary bg-primary/5' : 'border-border'}`;
  const inner = (
    <>
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold font-mono leading-none" style={color ? { color } : undefined}>{value}</p>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className={className}>{inner}</button>
    : <div className={className}>{inner}</div>;
}

function MiniDonut({ title, data, isLoading }: { title: string; data?: NameValue[]; isLoading: boolean }) {
  const total = (data ?? []).reduce((s, d) => s + d.value, 0);
  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {!isLoading && <p className="text-xs text-muted-foreground">{total} registros</p>}
      </CardHeader>
      <CardContent className="pt-0 pb-4">
        {isLoading || !data ? <Skeleton className="h-36 w-full" /> : (
          <div className="flex items-center gap-4">
            <div className="h-36 flex-1 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} cx="50%" cy="50%" innerRadius={38} outerRadius={56} paddingAngle={3} dataKey="value" nameKey="name">
                    {data.map((e, i) => <Cell key={e.name} fill={colorFor(e.name, i)} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 text-xs shrink-0 max-w-[55%]">
              {data.map((e, i) => (
                <div key={e.name} className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: colorFor(e.name, i) }} />
                  <span className="text-muted-foreground truncate">{e.name}</span>
                  <span className="font-bold font-mono ml-auto pl-2">{e.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniBars({ title, data, isLoading }: { title: string; data?: NameValue[]; isLoading: boolean }) {
  const max = Math.max(1, ...(data ?? []).map(d => d.value));
  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-2 pb-4 space-y-2.5">
        {isLoading || !data
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)
          : data.map((d, i) => (
            <div key={d.name}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground truncate pr-2">{d.name}</span>
                <span className="font-bold font-mono">{d.value}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(3, pct(d.value, max))}%`, background: PALETTE[i % PALETTE.length] }} />
              </div>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

function SimNaoTile({ label, valor, isLoading }: { label: string; valor?: SimNao; isLoading: boolean }) {
  const total = valor ? valor.sim + valor.nao : 0;
  const p = valor ? pct(valor.sim, total) : 0;
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">{label}</p>
      {isLoading || !valor ? <Skeleton className="h-10 w-full" /> : (
        <>
          <div className="flex items-end justify-between mb-1.5">
            <span className={`text-2xl font-bold font-mono leading-none ${p >= 80 ? 'text-emerald-500' : p >= 60 ? 'text-amber-500' : 'text-red-500'}`}>{p}%</span>
            <span className="text-[11px] text-muted-foreground">{valor.sim} sim · {valor.nao} não</span>
          </div>
          <div className="h-1.5 rounded-full bg-red-500/25 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${p}%` }} />
          </div>
        </>
      )}
    </div>
  );
}

interface SgColumn<T> {
  key: string;
  header: string;
  className?: string;
  render?: (row: T) => ReactNode;
}

function SgTable<T extends { id: number }>({ title, columns, rows, isLoading }: {
  title: string; columns: SgColumn<T>[]; rows?: T[]; isLoading: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {!isLoading && rows && <p className="text-xs text-muted-foreground">{rows.length} itens</p>}
      </CardHeader>
      <CardContent className="p-0">
        {isLoading || !rows ? (
          <div className="p-4 space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : (
          <ScrollArea className="max-h-72">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card/95 backdrop-blur border-b border-border z-10">
                <tr className="text-muted-foreground text-[11px]">
                  {columns.map(c => <th key={c.key} className={`py-2 px-3 text-left font-medium ${c.className ?? ''}`}>{c.header}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                    {columns.map(c => (
                      <td key={c.key} className={`py-2 px-3 ${c.className ?? ''}`}>
                        {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#64748b';
  return (
    <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ background: `${color}20`, color }}>
      {status}
    </span>
  );
}

// ── Painel principal ──────────────────────────────────────────────────

export function BIInfraSgsiPanel({ dateFrom, dateTo }: { dateFrom?: Date; dateTo?: Date }) {
  const { data, isLoading, isError, refetch } = useBIInfraSgsi(dateFrom, dateTo);
  // Drill-through: clique nos KPIs filtra a tabela analítica do bloco
  const [drill, setDrill] = useState<string | null>(null);
  const toggleDrill = (k: string) => setDrill((p) => (p === k ? null : k));

  if (isError) return <DashboardEmptyState variant="error" onRetry={() => refetch()} />;

  const d = data;

  // Visões analíticas filtradas pelos KPIs clicados
  const mudItens = (d?.mudancas.itens ?? []).filter((i) => {
    switch (drill) {
      case 'mud:concluidas': return /realizado|conclu/i.test(i.status);
      case 'mud:pendentes': return !/realizado|conclu|rejeitad/i.test(i.status);
      case 'mud:gestor': return /gestor/i.test(i.status);
      case 'mud:ti': return /aguard/i.test(i.status) && /\bti\b/i.test(i.status);
      default: return true;
    }
  });
  const incItens = (d?.incidentes.itens ?? []).filter((i) => {
    switch (drill) {
      case 'inc:ativos': return /ativo|aberto|andamento/i.test(i.status);
      case 'inc:contornados': return /contorn/i.test(i.status);
      case 'inc:resolvidos': return /resolv|encerr|conclu/i.test(i.status);
      default: return true;
    }
  });
  const riscoItens = (d?.riscos.itens ?? []).filter((i) =>
    drill === 'risco:abertos' ? !/tratad|encerr|conclu|finaliz|rejeitad/i.test(i.status) : true,
  );
  const ncItens = (d?.naoConformidades.itens ?? []).filter((i) =>
    drill === 'nc:recorrentes' ? i.recorrente : true,
  );
  const acessoItens = (d?.acessos.itens ?? []).filter((i) => {
    switch (drill) {
      case 'acs:pendentes': return /pendente|aguard|análise|analise/i.test(i.status);
      case 'acs:admin': return i.permissoesAdmin;
      default: return true;
    }
  });
  const drillBadge = drill ? ' · filtro do KPI ativo (clique novamente para limpar)' : '';

  if (d && d.totalItensBase === 0) {
    return (
      <DashboardEmptyState description="Nenhum dado SGSI sincronizado ainda — use 'Sincronizar SGSI (SharePoint)' no menu de sincronização do setor para espelhar as listas do site PORTALSGSI." />
    );
  }

  const diasSemCards = [
    { label: 'Dias sem incidentes', value: d?.diasSem.incidentes, icon: Flame, color: '#10b981' },
    { label: 'Dias sem riscos novos', value: d?.diasSem.riscos, icon: AlertTriangle, color: '#3b82f6' },
    { label: 'Dias sem não conformidades', value: d?.diasSem.naoConformidades, icon: FileWarning, color: '#8b5cf6' },
    { label: 'Dias sem atualização malsucedida', value: d?.diasSem.attMalSucedidas, icon: RefreshCw, color: '#f59e0b' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="text-base font-bold tracking-tight uppercase">Gestão SG · Listas SharePoint</h2>
        {d && (
          <span className="text-[11px] text-muted-foreground ml-1 inline-flex items-center gap-1">
            <CalendarCheck className="h-3 w-3" /> atualizado em {fmtDate(d.atualizadoEm)}
            {dateFrom && dateTo
              ? <> · {d.totalItens} de {d.totalItensBase} itens no período</>
              : <> · {d.totalItensBase} itens</>}
          </span>
        )}
      </div>

      {/* Gestão à vista — dias sem ocorrências */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {diasSemCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1 rounded-md" style={{ background: `${color}15` }}>
                <Icon className="h-3 w-3" style={{ color }} />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
            </div>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <span className="text-3xl font-bold font-mono" style={{ color }}>{value ?? '—'}</span>
            )}
          </div>
        ))}
      </div>

      {d && d.totalItens === 0 && d.totalItensBase > 0 ? (
        <DashboardEmptyState description={`Nenhuma atividade SG no período selecionado (${d.totalItensBase} itens no histórico). Selecione "Todas as Sprints" para ver o panorama completo.`} />
      ) : (
      <Tabs defaultValue="mudancas">
        <TabsList className="bg-muted/50 p-1 flex-wrap h-auto">
          <TabsTrigger value="mudancas" className="gap-1.5 text-xs"><RefreshCw className="h-3.5 w-3.5" />Mudanças (010)</TabsTrigger>
          <TabsTrigger value="incidentes" className="gap-1.5 text-xs"><Flame className="h-3.5 w-3.5" />Incidentes (017)</TabsTrigger>
          <TabsTrigger value="riscos" className="gap-1.5 text-xs"><AlertTriangle className="h-3.5 w-3.5" />Riscos (012)</TabsTrigger>
          <TabsTrigger value="conformidade" className="gap-1.5 text-xs"><Lightbulb className="h-3.5 w-3.5" />NC & Melhorias (018/011)</TabsTrigger>
          <TabsTrigger value="acessos" className="gap-1.5 text-xs"><KeyRound className="h-3.5 w-3.5" />Acessos (014)</TabsTrigger>
        </TabsList>

        {/* ── Mudanças (SG-LST-010) ── */}
        <TabsContent value="mudancas" className="space-y-3 mt-3">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiTile label="Solicitações" value={d?.mudancas.total ?? '—'} onClick={() => setDrill(null)} active={false} />
            <KpiTile label="Concluídas" value={d ? `${pct(d.mudancas.concluidos, d.mudancas.total)}%` : '—'} sub={d && `${d.mudancas.concluidos} itens`} color="#10b981" onClick={() => toggleDrill('mud:concluidas')} active={drill === 'mud:concluidas'} />
            <KpiTile label="Pendentes" value={d ? `${pct(d.mudancas.pendentes, d.mudancas.total)}%` : '—'} sub={d && `${d.mudancas.pendentes} itens`} color="#f59e0b" onClick={() => toggleDrill('mud:pendentes')} active={drill === 'mud:pendentes'} />
            <KpiTile label="Aguardando Gestor" value={d?.mudancas.aguardandoGestor ?? '—'} color="#8b5cf6" onClick={() => toggleDrill('mud:gestor')} active={drill === 'mud:gestor'} />
            <KpiTile label="Aguardando TI" value={d?.mudancas.aguardandoTI ?? '—'} color="#3b82f6" onClick={() => toggleDrill('mud:ti')} active={drill === 'mud:ti'} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SimNaoTile label="Atualizações bem-sucedidas" valor={d?.mudancas.atualizacoesBemSucedidas} isLoading={isLoading} />
            <SimNaoTile label="Validação e testes do pacote" valor={d?.mudancas.validacaoTestes} isLoading={isLoading} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <MiniDonut title="Por status" data={d?.mudancas.porStatus} isLoading={isLoading} />
            <MiniBars title="Por ambiente" data={d?.mudancas.porAmbiente} isLoading={isLoading} />
            <MiniDonut title="Por risco" data={d?.mudancas.porRisco} isLoading={isLoading} />
            <MiniBars title="Por categoria" data={d?.mudancas.porCategoria} isLoading={isLoading} />
          </div>
          <SgTable
            title={`Mudanças e atualizações${drillBadge}`}
            isLoading={isLoading}
            rows={mudItens}
            columns={[
              { key: 'chamado', header: 'Chamado', className: 'font-mono', render: r => <span className="font-semibold text-primary">{r.chamado}</span> },
              { key: 'ambiente', header: 'Ambiente' },
              { key: 'tipoMudanca', header: 'Tipo' },
              { key: 'categoria', header: 'Categoria' },
              { key: 'risco', header: 'Risco', render: r => <Badge variant={r.risco === 'Alto' ? 'destructive' : 'outline'} className="text-[10px]">{r.risco}</Badge> },
              { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
              { key: 'solicitante', header: 'Solicitante' },
              { key: 'aprovadorTI', header: 'Aprovador TI' },
              { key: 'modificado', header: 'Modificado', render: r => fmtDate(r.modificado) },
            ]}
          />
        </TabsContent>

        {/* ── Incidentes (SG-LST-017) ── */}
        <TabsContent value="incidentes" className="space-y-3 mt-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiTile label="Incidentes" value={d?.incidentes.total ?? '—'} onClick={() => setDrill(null)} active={false} />
            <KpiTile label="Ativos" value={d?.incidentes.ativos ?? '—'} sub={d && `${pct(d.incidentes.ativos, d.incidentes.total)}% do total`} color="#ef4444" onClick={() => toggleDrill('inc:ativos')} active={drill === 'inc:ativos'} />
            <KpiTile label="Contornados" value={d?.incidentes.contornados ?? '—'} sub={d && `${pct(d.incidentes.contornados, d.incidentes.total)}% do total`} color="#f59e0b" onClick={() => toggleDrill('inc:contornados')} active={drill === 'inc:contornados'} />
            <KpiTile label="Resolvidos" value={d?.incidentes.resolvidos ?? '—'} sub={d && `${pct(d.incidentes.resolvidos, d.incidentes.total)}% do total`} color="#10b981" onClick={() => toggleDrill('inc:resolvidos')} active={drill === 'inc:resolvidos'} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <MiniDonut title="SLA" data={d?.incidentes.porSLA} isLoading={isLoading} />
            <MiniDonut title="Por categoria" data={d?.incidentes.porCategoria} isLoading={isLoading} />
          </div>
          <SgTable
            title={`Incidentes${drillBadge}`}
            isLoading={isLoading}
            rows={incItens}
            columns={[
              { key: 'protocolo', header: 'Protocolo', className: 'font-mono', render: r => <span className="font-semibold text-primary">{r.protocolo}</span> },
              { key: 'titulo', header: 'Título', className: 'max-w-[200px] truncate' },
              { key: 'ativo', header: 'Ativo' },
              { key: 'priorizacao', header: 'Prioridade', render: r => <Badge variant={r.priorizacao === 'Alta' ? 'destructive' : 'outline'} className="text-[10px]">{r.priorizacao}</Badge> },
              { key: 'sla', header: 'SLA', render: r => <StatusBadge status={r.sla} /> },
              { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
              { key: 'downtimeHoras', header: 'Downtime', render: r => r.downtimeHoras > 0 ? `${r.downtimeHoras.toFixed(1)}h` : '—' },
              { key: 'inicio', header: 'Início', render: r => fmtDate(r.inicio) },
            ]}
          />
        </TabsContent>

        {/* ── Riscos (SG-LST-012) ── */}
        <TabsContent value="riscos" className="space-y-3 mt-3">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <KpiTile label="Riscos mapeados" value={d?.riscos.total ?? '—'} onClick={() => setDrill(null)} active={false} />
            <KpiTile label="Em aberto" value={d?.riscos.abertos ?? '—'} color="#f59e0b" onClick={() => toggleDrill('risco:abertos')} active={drill === 'risco:abertos'} />
            <SimNaoTile label="Plano de tratamento eficaz" valor={d?.riscos.tratamentoEficaz} isLoading={isLoading} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <MiniDonut title="Por status" data={d?.riscos.porStatus} isLoading={isLoading} />
            <MiniDonut title="CID afetado" data={d?.riscos.porCID} isLoading={isLoading} />
            <MiniDonut title="Categoria da ameaça" data={d?.riscos.porCategoriaAmeaca} isLoading={isLoading} />
            <MiniDonut title="Tipo de ameaça" data={d?.riscos.porTipoAmeaca} isLoading={isLoading} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <MiniBars title="O que o risco afeta" data={d?.riscos.porAtivoAfetado} isLoading={isLoading} />
            <MiniBars title="Por ambiente" data={d?.riscos.porAmbiente} isLoading={isLoading} />
          </div>
          <SgTable
            title={`Análises de risco${drillBadge}`}
            isLoading={isLoading}
            rows={riscoItens}
            columns={[
              { key: 'id', header: 'ID', className: 'font-mono' },
              { key: 'descricao', header: 'Risco', className: 'max-w-[220px] truncate' },
              { key: 'cid', header: 'CID' },
              { key: 'categoriaAmeaca', header: 'Categoria' },
              { key: 'ativoAfetado', header: 'Ativo' },
              { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
              { key: 'responsavelAjuste', header: 'Responsável' },
              { key: 'dataLimite', header: 'Limite', render: r => fmtDate(r.dataLimite) },
              { key: 'eficaz', header: 'Eficaz?' },
            ]}
          />
        </TabsContent>

        {/* ── NC & Melhorias (SG-LST-018 / SG-LST-011) ── */}
        <TabsContent value="conformidade" className="space-y-3 mt-3">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
              <h3 className="text-sm font-bold uppercase tracking-tight">Não conformidades (018)</h3>
              <div className="grid grid-cols-2 gap-3">
                <KpiTile label="Total NC" value={d?.naoConformidades.total ?? '—'} onClick={() => setDrill(null)} active={false} />
                <KpiTile label="Recorrentes" value={d?.naoConformidades.recorrentes ?? '—'} color="#ef4444" onClick={() => toggleDrill('nc:recorrentes')} active={drill === 'nc:recorrentes'} />
              </div>
              <SimNaoTile label="Tratamento eficaz" valor={d?.naoConformidades.tratamentoEficaz} isLoading={isLoading} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <MiniDonut title="Por status" data={d?.naoConformidades.porStatus} isLoading={isLoading} />
                <MiniBars title="Causa raiz" data={d?.naoConformidades.porCausaRaiz} isLoading={isLoading} />
              </div>
              <SgTable
                title={`NC${drillBadge}`}
                isLoading={isLoading}
                rows={ncItens}
                columns={[
                  { key: 'processo', header: 'Processo' },
                  { key: 'detalhes', header: 'Detalhes', className: 'max-w-[180px] truncate' },
                  { key: 'causaRaiz', header: 'Causa raiz' },
                  { key: 'recorrente', header: 'Recorrente', render: r => r.recorrente ? <Badge variant="destructive" className="text-[10px]">Sim</Badge> : 'Não' },
                  { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
                  { key: 'criado', header: 'Criado', render: r => fmtDate(r.criado) },
                ]}
              />
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
              <h3 className="text-sm font-bold uppercase tracking-tight">Oportunidades de melhoria (011)</h3>
              <div className="grid grid-cols-2 gap-3">
                <KpiTile label="Total OM" value={d?.melhorias.total ?? '—'} />
                <KpiTile label="Eficazes" value={d?.melhorias.eficazes ?? '—'} sub={d && `${pct(d.melhorias.eficazes, d.melhorias.total)}% do total`} color="#10b981" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <MiniDonut title="Por status" data={d?.melhorias.porStatus} isLoading={isLoading} />
                <MiniBars title="Processo afetado" data={d?.melhorias.porAmbiente} isLoading={isLoading} />
              </div>
              <SgTable
                title="OM recentes"
                isLoading={isLoading}
                rows={d?.melhorias.itens}
                columns={[
                  { key: 'oportunidade', header: 'Oportunidade', className: 'max-w-[180px] truncate' },
                  { key: 'processo', header: 'Processo' },
                  { key: 'beneficios', header: 'Benefícios', className: 'max-w-[180px] truncate' },
                  { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
                  { key: 'solicitante', header: 'Solicitante' },
                ]}
              />
            </div>
          </div>
        </TabsContent>

        {/* ── Acessos (SG-LST-014) ── */}
        <TabsContent value="acessos" className="space-y-3 mt-3">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiTile label="Solicitações" value={d?.acessos.total ?? '—'} onClick={() => setDrill(null)} active={false} />
            <KpiTile label="Pendentes" value={d?.acessos.pendentes ?? '—'} color="#f59e0b" onClick={() => toggleDrill('acs:pendentes')} active={drill === 'acs:pendentes'} />
            <KpiTile label="Acesso DevOps" value={d?.acessos.acessoDevOps.sim ?? '—'} sub="contas com acesso" color="#3b82f6" />
            <KpiTile label="Acesso TS" value={d?.acessos.acessoTS.sim ?? '—'} sub="contas com acesso" color="#8b5cf6" />
            <KpiTile label="Permissões admin" value={d?.acessos.permissoesAdmin.sim ?? '—'} sub="exigem revisão" color="#ef4444" onClick={() => toggleDrill('acs:admin')} active={drill === 'acs:admin'} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <MiniDonut title="Por status" data={d?.acessos.porStatus} isLoading={isLoading} />
            <MiniBars title="Tipo de solicitação" data={d?.acessos.porTipo} isLoading={isLoading} />
            <MiniBars title="Por projeto" data={d?.acessos.porProjeto} isLoading={isLoading} />
          </div>
          <SgTable
            title={`Solicitações de acesso${drillBadge}`}
            isLoading={isLoading}
            rows={acessoItens}
            columns={[
              { key: 'titulo', header: 'Solicitação', className: 'font-mono', render: r => <span className="font-semibold text-primary">{r.titulo}</span> },
              { key: 'descricao', header: 'Descrição', className: 'max-w-[200px] truncate' },
              { key: 'tipo', header: 'Tipo' },
              { key: 'projeto', header: 'Projeto' },
              { key: 'solicitante', header: 'Solicitante' },
              { key: 'cargo', header: 'Cargo' },
              { key: 'permissoesAdmin', header: 'Admin', render: r => r.permissoesAdmin ? <Badge variant="destructive" className="text-[10px]">Sim</Badge> : 'Não' },
              { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
              { key: 'ultimaRevisao', header: 'Última revisão', render: r => fmtDate(r.ultimaRevisao) },
            ]}
          />
        </TabsContent>
      </Tabs>
      )}
    </div>
  );
}
