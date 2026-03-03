import { useState } from 'react';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { sprintTasksData, infraestruturaData } from '@/data/mockSectorData';
import { useMemo } from 'react';
import { useCountUp } from '@/hooks/useCountUp';
import { Plane, Bug, ListTodo, Code2, AlertTriangle, Users, Maximize2, Minimize2, Server } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import type { Integration } from '@/components/setores/SectorIntegrations';

const integrations: Integration[] = [
  { name: 'Azure DevOps API', type: 'api', status: 'up', lastCheck: '20/02/2026 09:00', latency: '95ms', description: 'Work Items, Boards & Sprints' },
  { name: 'Zabbix API', type: 'api', status: 'up', lastCheck: '20/02/2026 09:00', latency: '45ms', description: 'Monitoramento de infraestrutura' },
  { name: 'SQL Server (Planet)', type: 'database', status: 'up', lastCheck: '20/02/2026 09:00', latency: '12ms', description: 'Banco principal Planet' },
];

function MacroCard({ label, value, icon: Icon, color, subtitle, delay = 0 }: {
  label: string; value: number; icon: React.ComponentType<{ className?: string }>; color: string; subtitle?: string; delay?: number;
}) {
  const animated = useCountUp(value);
  return (
    <Card className="p-5 text-center animate-fade-in hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5" style={{ animationDelay: `${delay}ms` }}>
      <div className={`mx-auto w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${color}`}>
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-3xl font-bold font-mono text-foreground">{animated}</p>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-1">{label}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </Card>
  );
}

function HorizontalBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = (value / max) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-foreground w-40 truncate">{label}</span>
      <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
        <div className="h-full bg-[hsl(var(--info))] rounded transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold text-foreground w-8 text-right">{value}</span>
    </div>
  );
}

export default function FabricaDashboard() {
  const data = sprintTasksData;
  const d = infraestruturaData;
  const [boardFullscreen, setBoardFullscreen] = useState(false);

  const stats = useMemo(() => {
    const inProgress = data.filter((t) => t.state === 'In Progress').length;
    const toDo = data.filter((t) => t.state === 'To Do').length;
    const done = data.filter((t) => t.state === 'Done').length;
    const allTags = data.flatMap(t => t.tags.split(';').map(s => s.trim()).filter(Boolean));
    const bugs = allTags.filter(t => t === 'BUG').length;
    const transbordo = allTags.filter(t => t === 'TRANSBORDO').length;
    const retornoQA = allTags.filter(t => t === 'RETORNO QA').length;
    const porProgramador: Record<string, number> = {};
    data.forEach(t => {
      const name = t.assignedTo ? t.assignedTo.split(' ').slice(0, 2).join(' ') : 'Não atribuído';
      porProgramador[name] = (porProgramador[name] || 0) + 1;
    });
    return { inProgress, toDo, done, bugs, transbordo, retornoQA, porProgramador };
  }, [data]);

  const maxAmb = Math.max(...d.porAmbiente.map((a) => a.conexoes));
  const maxDist = Math.max(...d.porDistribuidora.map((a) => a.conexoes));

  const stateBadge = (state: string) => {
    switch (state) {
      case 'In Progress': return <Badge className="bg-[hsl(var(--info))] text-[hsl(var(--info-foreground))] animate-pulse font-mono text-xs">▶ EM PROGRESSO</Badge>;
      case 'To Do': return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border border-amber-300 dark:border-amber-700 font-mono text-xs">◻ TO DO</Badge>;
      case 'Done': return <Badge className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] font-mono text-xs">✓ DONE</Badge>;
      default: return <Badge variant="secondary" className="font-mono text-xs">{state}</Badge>;
    }
  };

  const tagBadge = (tag: string) => {
    if (tag === 'TRANSBORDO') return 'bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]';
    if (tag === 'BUG') return 'bg-[hsl(var(--critical))] text-[hsl(var(--critical-foreground))]';
    if (tag === 'RETORNO QA') return 'bg-purple-500 text-white';
    return '';
  };

  const extraTabs = [
    {
      id: 'infra',
      label: 'Infraestrutura',
      icon: <Server className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card className="p-5 text-center"><p className="text-4xl font-bold text-foreground">{d.conexoesAtivas}</p><p className="text-xs text-muted-foreground">Conexões Ativas</p></Card>
            <Card className="p-5 text-center"><p className="text-2xl font-bold text-foreground">R$ {(d.faturamento.reduce((s, f) => s + f.valor, 0) / 1e6).toFixed(1)}M</p><p className="text-xs text-muted-foreground">Faturamento Total</p></Card>
            <Card className="p-5 text-center"><p className="text-2xl font-bold text-foreground">{d.porAmbiente.length}</p><p className="text-xs text-muted-foreground">Ambientes Ativos</p></Card>
          </div>
          <Card className="p-5">
            <h3 className="font-semibold text-foreground mb-4">Histograma de Acessos (24h)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={d.histogramaAcessos}>
                <defs><linearGradient id="colorAcessos" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hora" fontSize={10} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <Tooltip />
                <Area type="monotone" dataKey="acessos" stroke="hsl(199, 89%, 48%)" fill="url(#colorAcessos)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5"><h3 className="font-semibold text-foreground mb-4">Conexões por Ambiente</h3><div className="space-y-2">{d.porAmbiente.map((a) => <HorizontalBar key={a.ambiente} label={a.ambiente} value={a.conexoes} max={maxAmb} />)}</div></Card>
            <Card className="p-5"><h3 className="font-semibold text-foreground mb-4">Conexões por Distribuidora</h3><div className="space-y-2">{d.porDistribuidora.map((a) => <HorizontalBar key={a.distribuidora} label={a.distribuidora} value={a.conexoes} max={maxDist} />)}</div></Card>
          </div>
        </div>
      ),
    },
  ];

  return (
    <SectorLayout title="Fábrica" subtitle="Programação + Infraestrutura — Sprint S4-2026" lastUpdate="20/02/2026 09:00" integrations={integrations} extraTabs={extraTabs}>
      {/* KPI Macro Counters */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MacroCard label="Total Tasks" value={data.length} icon={ListTodo} color="bg-primary/10 text-primary" delay={0} />
        <MacroCard label="Em Progresso" value={stats.inProgress} icon={Code2} color="bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]" delay={80} />
        <MacroCard label="To Do" value={stats.toDo} icon={ListTodo} color="bg-accent text-accent-foreground" delay={160} />
        <MacroCard label="🐛 Bugs" value={stats.bugs} icon={Bug} color="bg-[hsl(var(--critical))]/10 text-[hsl(var(--critical))]" delay={240} />
        <MacroCard label="Transbordos" value={stats.transbordo} icon={AlertTriangle} color="bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]" delay={320} />
        <MacroCard label="Retorno QA" value={stats.retornoQA} icon={Bug} color="bg-purple-500/10 text-purple-500" delay={400} />
      </div>

      {/* Tasks por Colaborador */}
      <Card className="p-5 animate-fade-in" style={{ animationDelay: '300ms' }}>
        <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Tasks por Colaborador</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {Object.entries(stats.porProgramador).sort(([, a], [, b]) => b - a).map(([name, count], i) => (
            <div key={name} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-sm animate-fade-in" style={{ animationDelay: `${400 + i * 50}ms` }}>
              <span className="text-foreground truncate">{name}</span>
              <Badge variant="secondary" className="ml-1 font-mono">{count}</Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* Sprint Board Table */}
      <Card className={`bg-card text-card-foreground overflow-hidden animate-fade-in border ${boardFullscreen ? 'fixed inset-0 z-50 rounded-none m-0' : ''}`} style={{ animationDelay: '500ms' }}>
        <div className="p-4 border-b border-border flex items-center gap-3">
          <Plane className="h-5 w-5 text-[hsl(var(--warning))]" />
          <h3 className="font-bold text-lg font-mono tracking-wider">PAINEL DE MONITORAMENTO — SPRINT S4-2026</h3>
          <div className="ml-auto flex gap-2 items-center">
            {stats.transbordo > 0 && <Badge className="bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] font-mono">⚡ {stats.transbordo} TRANSBORDOS</Badge>}
            {stats.retornoQA > 0 && <Badge className="bg-purple-500 text-white font-mono">↩ {stats.retornoQA} RETORNO QA</Badge>}
            <Button variant="ghost" size="icon" onClick={() => setBoardFullscreen(!boardFullscreen)} className="text-muted-foreground hover:text-foreground hover:bg-muted h-8 w-8">
              {boardFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className={`overflow-auto ${boardFullscreen ? 'max-h-[calc(100vh-60px)]' : 'max-h-[500px]'}`}>
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-muted/50">
                <TableHead className="text-primary font-mono">ID</TableHead>
                <TableHead className="text-primary font-mono">TASK</TableHead>
                <TableHead className="text-primary font-mono">COLABORADOR</TableHead>
                <TableHead className="text-primary font-mono">STATUS</TableHead>
                <TableHead className="text-primary font-mono">TAGS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item, i) => (
                <TableRow key={item.id} className="border-border hover:bg-muted/50 transition-colors animate-fade-in" style={{ animationDelay: `${600 + i * 30}ms` }}>
                  <TableCell className="font-mono text-xs text-primary">#{item.id}</TableCell>
                  <TableCell className="text-sm max-w-[350px] truncate text-foreground">{item.title}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.assignedTo || '—'}</TableCell>
                  <TableCell>{stateBadge(item.state)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {item.tags.split(';').map(t => t.trim()).filter(Boolean).map((tag) => (
                        <Badge key={tag} className={`text-xs font-mono ${tagBadge(tag)}`} variant={tagBadge(tag) ? undefined : 'secondary'}>{tag}</Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </SectorLayout>
  );
}
