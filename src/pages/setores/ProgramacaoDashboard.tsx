import { SectorLayout } from '@/components/setores/SectorLayout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plane, Bug, ListTodo, Code2, AlertTriangle, Users } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { sprintTasksData } from '@/data/mockSectorData';
import { useMemo } from 'react';
import type { Integration } from '@/components/setores/SectorIntegrations';

const integrations: Integration[] = [
  { name: 'Azure DevOps API', type: 'api', status: 'up', lastCheck: '20/02/2026 09:00', latency: '95ms', description: 'Work Items, Boards & Sprints' },
  { name: 'GitHub API', type: 'api', status: 'up', lastCheck: '20/02/2026 09:00', latency: '110ms', description: 'Repositórios & Pull Requests' },
];

function MacroCard({ label, value, icon: Icon, color, subtitle }: {
  label: string; value: number; icon: React.ComponentType<{ className?: string }>; color: string; subtitle?: string;
}) {
  return (
    <Card className="p-5 text-center animate-fade-in hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5">
      <div className={`mx-auto w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${color}`}>
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-3xl font-bold font-mono text-foreground">{value}</p>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-1">{label}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </Card>
  );
}

export default function ProgramacaoDashboard() {
  const data = sprintTasksData;

  const stats = useMemo(() => {
    const inProgress = data.filter((d) => d.state === 'In Progress').length;
    const toDo = data.filter((d) => d.state === 'To Do').length;
    const done = data.filter((d) => d.state === 'Done').length;

    // Tags analysis
    const allTags = data.flatMap(d => d.tags.split(';').map(t => t.trim()).filter(Boolean));
    const aviao = allTags.filter(t => t === 'AVIAO').length;
    const bugs = allTags.filter(t => t === 'BUG').length;
    const transbordo = allTags.filter(t => t === 'TRANSBORDO').length;
    const retornoQA = allTags.filter(t => t === 'RETORNO QA').length;

    // By assignee
    const porProgramador: Record<string, number> = {};
    data.forEach(d => {
      const name = d.assignedTo ? d.assignedTo.split(' ').slice(0, 2).join(' ') : 'Não atribuído';
      porProgramador[name] = (porProgramador[name] || 0) + 1;
    });

    // Relevant tags for board
    const tagCounts: Record<string, number> = {};
    allTags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });

    return { inProgress, toDo, done, aviao, bugs, transbordo, retornoQA, porProgramador, tagCounts };
  }, [data]);

  // Airport-style state badge
  const stateBadge = (state: string) => {
    switch (state) {
      case 'In Progress': return <Badge className="bg-[hsl(var(--info))] text-[hsl(var(--info-foreground))] animate-pulse font-mono text-xs">▶ EM PROGRESSO</Badge>;
      case 'To Do': return <Badge variant="outline" className="font-mono text-xs">◻ TO DO</Badge>;
      case 'Done': return <Badge className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] font-mono text-xs">✓ DONE</Badge>;
      default: return <Badge variant="secondary" className="font-mono text-xs">{state}</Badge>;
    }
  };

  const tagBadge = (tag: string) => {
    if (tag === 'TRANSBORDO') return 'bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]';
    if (tag === 'BUG') return 'bg-[hsl(var(--critical))] text-[hsl(var(--critical-foreground))]';
    if (tag === 'RETORNO QA') return 'bg-purple-500 text-white';
    if (tag === 'AVIAO') return 'bg-[hsl(var(--info))] text-[hsl(var(--info-foreground))]';
    return '';
  };

  return (
    <SectorLayout title="Programação" subtitle="Sprint Board — S4-2026" lastUpdate="20/02/2026 09:00" integrations={integrations}>
      {/* KPI Macro Counters */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MacroCard label="Total Tasks" value={data.length} icon={ListTodo} color="bg-primary/10 text-primary" />
        <MacroCard label="Em Progresso" value={stats.inProgress} icon={Code2} color="bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]" />
        <MacroCard label="To Do" value={stats.toDo} icon={ListTodo} color="bg-muted text-muted-foreground" />
        <MacroCard label="✈ Aviões" value={stats.aviao} icon={Plane} color="bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]" subtitle="Tag AVIAO" />
        <MacroCard label="🐛 Bugs" value={stats.bugs} icon={Bug} color="bg-[hsl(var(--critical))]/10 text-[hsl(var(--critical))]" />
        <MacroCard label="Transbordos" value={stats.transbordo} icon={AlertTriangle} color="bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]" />
      </div>

      {/* Tasks por Programador */}
      <Card className="p-5 animate-fade-in">
        <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Tasks por Programador
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {Object.entries(stats.porProgramador)
            .sort(([, a], [, b]) => b - a)
            .map(([name, count]) => (
              <div key={name} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-sm">
                <span className="text-foreground truncate">{name}</span>
                <Badge variant="secondary" className="ml-1 font-mono">{count}</Badge>
              </div>
            ))}
        </div>
      </Card>

      {/* Airport Board */}
      <Card className="bg-[hsl(222,47%,11%)] text-[hsl(210,40%,98%)] overflow-hidden animate-fade-in">
        <div className="p-4 border-b border-white/10 flex items-center gap-3">
          <Plane className="h-5 w-5 text-[hsl(var(--warning))]" />
          <h3 className="font-bold text-lg font-mono tracking-wider">PAINEL DE MONITORAMENTO — SPRINT S4-2026</h3>
          <div className="ml-auto flex gap-2">
            {stats.aviao > 0 && <Badge className="bg-[hsl(var(--info))] text-white font-mono animate-pulse">✈ {stats.aviao} AVIÕES</Badge>}
            {stats.transbordo > 0 && <Badge className="bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] font-mono">⚡ {stats.transbordo} TRANSBORDOS</Badge>}
            {stats.retornoQA > 0 && <Badge className="bg-purple-500 text-white font-mono">↩ {stats.retornoQA} RETORNO QA</Badge>}
          </div>
        </div>
        <div className="overflow-auto max-h-[500px]">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-white/5">
                <TableHead className="text-[hsl(var(--warning))] font-mono">ID</TableHead>
                <TableHead className="text-[hsl(var(--warning))] font-mono">TASK</TableHead>
                <TableHead className="text-[hsl(var(--warning))] font-mono">PROGRAMADOR</TableHead>
                <TableHead className="text-[hsl(var(--warning))] font-mono">STATUS</TableHead>
                <TableHead className="text-[hsl(var(--warning))] font-mono">TAGS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item) => (
                <TableRow key={item.id} className="border-white/5 hover:bg-white/5 transition-colors">
                  <TableCell className="font-mono text-xs text-[hsl(var(--info))]">#{item.id}</TableCell>
                  <TableCell className="text-sm max-w-[350px] truncate">{item.title}</TableCell>
                  <TableCell className="text-sm text-white/70">{item.assignedTo || '—'}</TableCell>
                  <TableCell>{stateBadge(item.state)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {item.tags.split(';').map(t => t.trim()).filter(Boolean).map((tag) => (
                        <Badge key={tag} className={`text-xs font-mono ${tagBadge(tag)}`} variant={tagBadge(tag) ? undefined : 'outline'}>
                          {tag}
                        </Badge>
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
