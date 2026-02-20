import { SectorLayout } from '@/components/setores/SectorLayout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { customerServiceData, csKPIs } from '@/data/mockSectorData';
import { Progress } from '@/components/ui/progress';
import { Eye, Settings2, Zap, FileText, Clock, Users, Layers, AlertTriangle, TrendingUp, Target, ArrowUp, ArrowDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Area, AreaChart } from 'recharts';
import type { Integration } from '@/components/setores/SectorIntegrations';

const COLORS = ['hsl(43,85%,46%)', 'hsl(199,89%,48%)', 'hsl(142,71%,45%)', 'hsl(0,84%,60%)', 'hsl(280,65%,60%)', 'hsl(30,90%,55%)', 'hsl(190,70%,50%)', 'hsl(340,70%,55%)', 'hsl(160,60%,45%)'];

const integrations: Integration[] = [
  { name: 'Azure DevOps', type: 'api', status: 'up', lastCheck: '20/02/2026 09:00', latency: '120ms', description: 'Work Items & Sprints' },
  { name: 'Vdesk API', type: 'api', status: 'up', lastCheck: '20/02/2026 09:00', latency: '85ms', description: 'Ordens de Serviço' },
];

function MetricTile({ label, value, change, changeLabel, icon: Icon, accent }: {
  label: string; value: string | number; change?: number; changeLabel?: string; icon: React.ComponentType<{ className?: string }>; accent?: string;
}) {
  const isPositive = (change ?? 0) >= 0;
  return (
    <Card className="p-5 animate-fade-in group hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden">
      <div className={`absolute inset-0 opacity-[0.04] ${accent || 'bg-primary'}`} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className={`p-2.5 rounded-xl ${accent ? accent + '/10' : 'bg-primary/10'}`}>
            <Icon className={`h-5 w-5 ${accent ? accent.replace('bg-', 'text-') : 'text-primary'}`} />
          </div>
          {change !== undefined && (
            <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${isPositive ? 'bg-[hsl(142,71%,45%)]/10 text-[hsl(142,71%,45%)]' : 'bg-[hsl(0,84%,60%)]/10 text-[hsl(0,84%,60%)]'}`}>
              {isPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(change)}%
            </div>
          )}
        </div>
        <p className="text-3xl font-bold text-foreground tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-1 font-medium">{label}</p>
        {changeLabel && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{changeLabel}</p>}
      </div>
    </Card>
  );
}

function MiniProgressBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{value}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(value / max) * 100}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default function CustomerServiceDashboard() {
  const data = customerServiceData;
  const kpis = csKPIs;

  const systemCounts: Record<string, number> = {};
  data.forEach(d => { systemCounts[d.sistema] = (systemCounts[d.sistema] || 0) + 1; });
  const maxSystem = Math.max(...Object.values(systemCounts));

  const priorityCounts = [0, 0, 0, 0, 0];
  data.forEach(d => { if (d.prioridade >= 0 && d.prioridade <= 4) priorityCounts[d.prioridade]++; });

  return (
    <SectorLayout
      title="Customer Service"
      subtitle="Dashboard de Gestão — Customer Success"
      lastUpdate="19/02/2026 08:45"
      integrations={integrations}
    >
      <Tabs defaultValue="executiva" className="w-full">
        <TabsList className="mb-4 bg-muted/50 p-1">
          <TabsTrigger value="executiva" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Eye className="h-3.5 w-3.5" />
            Visão Executiva
          </TabsTrigger>
          <TabsTrigger value="operacional" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Settings2 className="h-3.5 w-3.5" />
            Operacional
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Zap className="h-3.5 w-3.5" />
            Performance
          </TabsTrigger>
        </TabsList>

        {/* ── Executiva ── */}
        <TabsContent value="executiva" className="space-y-5 animate-fade-in">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricTile label="Em Atuação CS" value={kpis.executiva.emAtuacao} change={-8} changeLabel="vs sprint anterior" icon={TrendingUp} />
            <MetricTile label="Lead Time Médio" value={`${kpis.executiva.leadTimeMedio}d`} change={12} changeLabel="Dt OS → Dt Entrega" icon={Clock} accent="bg-[hsl(199,89%,48%)]" />
            <MetricTile label="Acima de 15 Dias" value={`${kpis.executiva.acima15Dias}%`} change={-3} changeLabel="Atenção necessária" icon={AlertTriangle} accent="bg-[hsl(0,84%,60%)]" />
            <MetricTile label="Taxa Retrabalho" value={`${kpis.executiva.taxaRetrabalho}%`} change={-5} changeLabel="Dentro do esperado" icon={Target} accent="bg-[hsl(142,71%,45%)]" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-5 animate-fade-in lg:col-span-2">
              <h3 className="font-semibold text-foreground mb-4 text-sm">Entregas por Sprint CS</h3>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={kpis.demandasPorSprint}>
                  <defs>
                    <linearGradient id="csGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(199,89%,48%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(199,89%,48%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="sprint" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip />
                  <Area type="monotone" dataKey="finalizadas" stroke="hsl(199,89%,48%)" fill="url(#csGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5 animate-fade-in">
              <h3 className="font-semibold text-foreground mb-4 text-sm">Volume por Sistema</h3>
              <div className="space-y-3">
                {Object.entries(systemCounts)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 6)
                  .map(([sys, count], i) => (
                    <MiniProgressBar key={sys} label={sys} value={count} max={maxSystem} color={COLORS[i % COLORS.length]} />
                  ))}
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ── Operacional ── */}
        <TabsContent value="operacional" className="space-y-5 animate-fade-in">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricTile label="Sem Dt Entrega" value={kpis.operacional.semDtEntrega} icon={FileText} accent="bg-[hsl(43,85%,46%)]" />
            <MetricTile label="Responsáveis Ativos" value={kpis.operacional.responsaveisAtivos} icon={Users} />
            <MetricTile label="Filas Ativas" value={kpis.operacional.filasAtivas} icon={Layers} accent="bg-[hsl(199,89%,48%)]" />
            <MetricTile label="Backlog 30+ Dias" value={kpis.operacional.backlog30Dias} change={15} changeLabel="Alto risco" icon={AlertTriangle} accent="bg-[hsl(0,84%,60%)]" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5 animate-fade-in">
              <h3 className="font-semibold text-foreground mb-4 text-sm">Fila por Responsável</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={kpis.filaPorResp} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis type="category" dataKey="resp" fontSize={11} stroke="hsl(var(--muted-foreground))" width={100} />
                  <Tooltip />
                  <Bar dataKey="qtd" fill="hsl(43,85%,46%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5 animate-fade-in">
              <h3 className="font-semibold text-foreground mb-4 text-sm">Aging da Fila</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={kpis.agingFila}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="faixa" fontSize={10} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip />
                  <Bar dataKey="qtd" radius={[4, 4, 0, 0]}>
                    {kpis.agingFila.map((_, i) => (
                      <Cell key={i} fill={i < 2 ? 'hsl(142,71%,45%)' : i < 3 ? 'hsl(43,85%,46%)' : 'hsl(0,84%,60%)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card className="animate-fade-in overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-foreground text-sm">Fila Operacional</h3>
              <p className="text-xs text-muted-foreground">{data.length} itens em atuação</p>
            </div>
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs font-semibold">Id</TableHead>
                    <TableHead className="text-xs font-semibold">Descrição</TableHead>
                    <TableHead className="text-xs font-semibold">Resp</TableHead>
                    <TableHead className="text-xs font-semibold">Sistema</TableHead>
                    <TableHead className="text-xs font-semibold">Prior.</TableHead>
                    <TableHead className="text-xs font-semibold">Ação</TableHead>
                    <TableHead className="text-xs font-semibold">Tags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((item) => (
                    <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-mono text-xs text-muted-foreground">{item.id}</TableCell>
                      <TableCell className="max-w-[280px] truncate text-sm">{item.descricao}</TableCell>
                      <TableCell className="text-sm">{item.resp || '—'}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{item.sistema}</Badge></TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${item.prioridade <= 1 ? 'bg-[hsl(0,84%,60%)] text-white' : item.prioridade <= 2 ? 'bg-[hsl(43,85%,46%)] text-[hsl(222,47%,11%)]' : 'bg-muted text-muted-foreground'}`}>
                          P{item.prioridade}
                        </Badge>
                      </TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{item.acao}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{item.tags}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ── Performance ── */}
        <TabsContent value="performance" className="space-y-5 animate-fade-in">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricTile label="Throughput Médio" value="4/sprint" change={10} icon={Zap} />
            <MetricTile label="Lead Time Médio" value={`${kpis.performance.leadTimeMedio}d`} icon={TrendingUp} accent="bg-[hsl(199,89%,48%)]" />
            <MetricTile label="Backlog Envelhecido" value={`${kpis.performance.backlogEnvelhecido}%`} change={8} icon={AlertTriangle} accent="bg-[hsl(0,84%,60%)]" />
            <MetricTile label="Taxa Conclusão" value={`${kpis.performance.taxaConclusao}%`} change={-2} icon={Target} accent="bg-[hsl(142,71%,45%)]" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5 animate-fade-in">
              <h3 className="font-semibold text-foreground mb-4 text-sm">Throughput por Sprint CS</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={kpis.throughputPorSprint}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="sprint" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip />
                  <Bar dataKey="valor" fill="hsl(199,89%,48%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5 animate-fade-in">
              <h3 className="font-semibold text-foreground mb-4 text-sm">Taxa de Conclusão por Sprint</h3>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={kpis.taxaConclusaoPorSprint}>
                  <defs>
                    <linearGradient id="taxaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142,71%,45%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(142,71%,45%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="sprint" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis domain={[0, 100]} fontSize={11} stroke="hsl(var(--muted-foreground))" unit="%" />
                  <Tooltip />
                  <Area type="monotone" dataKey="taxa" stroke="hsl(142,71%,45%)" fill="url(#taxaGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card className="p-5 animate-fade-in">
            <h3 className="font-semibold text-foreground mb-4 text-sm">Distribuição por Prioridade</h3>
            <div className="grid grid-cols-5 gap-3">
              {priorityCounts.map((count, i) => (
                <div key={i} className="text-center">
                  <div className={`text-2xl font-bold ${i <= 1 ? 'text-[hsl(0,84%,60%)]' : i <= 2 ? 'text-[hsl(43,85%,46%)]' : 'text-muted-foreground'}`}>{count}</div>
                  <div className="text-xs text-muted-foreground mt-1">P{i}</div>
                  <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{
                      width: `${(count / Math.max(...priorityCounts, 1)) * 100}%`,
                      backgroundColor: i <= 1 ? 'hsl(0,84%,60%)' : i <= 2 ? 'hsl(43,85%,46%)' : 'hsl(var(--muted-foreground))',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </SectorLayout>
  );
}
