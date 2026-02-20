import { SectorLayout } from '@/components/setores/SectorLayout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { customerServiceData, csKPIs } from '@/data/mockSectorData';
import { useMemo } from 'react';
import { Eye, Settings2, Zap, FileText, Clock, Users, Layers, AlertTriangle, TrendingUp, Target } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import type { Integration } from '@/components/setores/SectorIntegrations';

const COLORS = ['hsl(43, 85%, 46%)', 'hsl(199, 89%, 48%)', 'hsl(142, 71%, 45%)', 'hsl(0, 84%, 60%)', 'hsl(280, 65%, 60%)', 'hsl(30, 90%, 55%)', 'hsl(190, 70%, 50%)', 'hsl(340, 70%, 55%)', 'hsl(160, 60%, 45%)'];

const integrations: Integration[] = [
  { name: 'Azure DevOps', type: 'api', status: 'up', lastCheck: '20/02/2026 09:00', latency: '120ms', description: 'Work Items & Sprints' },
  { name: 'Vdesk API', type: 'api', status: 'up', lastCheck: '20/02/2026 09:00', latency: '85ms', description: 'Ordens de Serviço' },
];

function KPICard({ label, value, subtitle, icon: Icon, alert }: {
  label: string; value: string | number; subtitle: string; icon: React.ComponentType<{ className?: string }>; alert?: boolean;
}) {
  return (
    <Card className="p-5 animate-fade-in hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
          <p className={`text-xs mt-1 ${alert ? 'text-[hsl(var(--critical))] font-medium' : 'text-muted-foreground'}`}>
            {subtitle}
          </p>
        </div>
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
    </Card>
  );
}

export default function CustomerServiceDashboard() {
  const data = customerServiceData;
  const kpis = csKPIs;

  return (
    <SectorLayout
      title="CS Performance"
      subtitle="Dashboard de Gestão — Customer Success"
      lastUpdate="19/02/2026 08:45"
      integrations={integrations}
    >
      <Tabs defaultValue="executiva" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="executiva" className="gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            Executiva
          </TabsTrigger>
          <TabsTrigger value="operacional" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            Operacional
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Performance
          </TabsTrigger>
        </TabsList>

        {/* ── Executiva ── */}
        <TabsContent value="executiva" className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard label="Em Atuação CS" value={kpis.executiva.emAtuacao} subtitle="Demandas na fila CS sem entrega" icon={TrendingUp} />
            <KPICard label="Lead Time Médio" value={`${kpis.executiva.leadTimeMedio}d`} subtitle="Dt OS → Dt Entrega" icon={Clock} />
            <KPICard label="Acima de 15 Dias" value={`${kpis.executiva.acima15Dias}%`} subtitle="Atenção necessária" icon={AlertTriangle} alert />
            <KPICard label="Taxa Retrabalho" value={`${kpis.executiva.taxaRetrabalho}%`} subtitle="Dentro do esperado" icon={Target} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5 animate-fade-in">
              <h3 className="font-semibold text-foreground mb-4">Demandas Finalizadas por Sprint CS</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={kpis.demandasPorSprint}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="sprint" fontSize={12} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={12} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip />
                  <Bar dataKey="finalizadas" fill="hsl(199, 89%, 48%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5 animate-fade-in">
              <h3 className="font-semibold text-foreground mb-4">Volume por Sistema</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={kpis.volumePorSistema} dataKey="pct" nameKey="sistema" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} label={({ sistema, pct }) => `${sistema} (${pct}%)`} labelLine={false}>
                    {kpis.volumePorSistema.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </TabsContent>

        {/* ── Operacional ── */}
        <TabsContent value="operacional" className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard label="Sem Dt Entrega" value={kpis.operacional.semDtEntrega} subtitle="Demandas sem finalização" icon={FileText} />
            <KPICard label="Responsáveis Ativos" value={kpis.operacional.responsaveisAtivos} subtitle="Com demandas em aberto" icon={Users} />
            <KPICard label="Filas Ativas" value={kpis.operacional.filasAtivas} subtitle="CS + Aprovação UI/UX" icon={Layers} />
            <KPICard label="Backlog 30+ Dias" value={kpis.operacional.backlog30Dias} subtitle="Alto risco" icon={AlertTriangle} alert />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5 animate-fade-in">
              <h3 className="font-semibold text-foreground mb-4">Fila por Responsável</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={kpis.filaPorResp} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" fontSize={12} stroke="hsl(var(--muted-foreground))" />
                  <YAxis type="category" dataKey="resp" fontSize={12} stroke="hsl(var(--muted-foreground))" width={100} />
                  <Tooltip />
                  <Bar dataKey="qtd" fill="hsl(199, 89%, 48%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5 animate-fade-in">
              <h3 className="font-semibold text-foreground mb-4">Aging da Fila</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={kpis.agingFila}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="faixa" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={12} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip />
                  <Bar dataKey="qtd" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Tabela operacional */}
          <Card className="animate-fade-in">
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Id</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Resp</TableHead>
                    <TableHead>Sistema</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Tags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((item) => (
                    <TableRow key={item.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-mono text-xs">{item.id}</TableCell>
                      <TableCell className="max-w-[280px] truncate text-sm">{item.descricao}</TableCell>
                      <TableCell className="text-sm">{item.resp || '—'}</TableCell>
                      <TableCell className="text-sm">{item.sistema}</TableCell>
                      <TableCell>
                        <Badge variant={item.prioridade <= 1 ? 'destructive' : 'secondary'}>{item.prioridade}</Badge>
                      </TableCell>
                      <TableCell><Badge variant="outline">{item.acao}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{item.tags}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ── Performance ── */}
        <TabsContent value="performance" className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard label="Throughput Médio" value="4/sprint" subtitle="Média de entregas por sprint" icon={Zap} />
            <KPICard label="Lead Time Médio" value={`${kpis.performance.leadTimeMedio} dias`} subtitle="Tempo médio de atuação CS" icon={TrendingUp} />
            <KPICard label="Backlog Envelhecido" value={`${kpis.performance.backlogEnvelhecido}%`} subtitle="Risco alto" icon={AlertTriangle} alert />
            <KPICard label="Taxa Conclusão Geral" value={`${kpis.performance.taxaConclusao}%`} subtitle="Média entre sprints" icon={Target} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5 animate-fade-in">
              <h3 className="font-semibold text-foreground mb-4">Throughput por Sprint CS</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={kpis.throughputPorSprint}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="sprint" fontSize={12} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={12} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip />
                  <Bar dataKey="valor" fill="hsl(199, 89%, 48%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5 animate-fade-in">
              <h3 className="font-semibold text-foreground mb-4">Taxa de Conclusão por Sprint</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={kpis.taxaConclusaoPorSprint}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="sprint" fontSize={12} stroke="hsl(var(--muted-foreground))" />
                  <YAxis domain={[0, 100]} fontSize={12} stroke="hsl(var(--muted-foreground))" unit="%" />
                  <Tooltip />
                  <Line type="monotone" dataKey="taxa" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={{ fill: 'hsl(142, 71%, 45%)', r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </SectorLayout>
  );
}
