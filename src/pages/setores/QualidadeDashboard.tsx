import { SectorLayout } from '@/components/setores/SectorLayout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { qualidadeData } from '@/data/mockSectorData';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import type { Integration } from '@/components/setores/SectorIntegrations';
import { FileCheck, Clock, AlertTriangle, BarChart3, TrendingUp } from 'lucide-react';

const integrations: Integration[] = [
  { name: 'Vdesk API', type: 'api', status: 'up', lastCheck: '20/02/2026 09:00', latency: '85ms', description: 'Ordens de Serviço' },
  { name: 'Azure DevOps', type: 'api', status: 'up', lastCheck: '20/02/2026 09:00', latency: '120ms', description: 'Work Items & Boards' },
];

function KPICard({ title, total, sistemaA, sistemaB, icon: Icon }: {
  title: string; total: number | string; sistemaA: number; sistemaB: number; icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="p-5 bg-primary/5 border-primary/20 hover:shadow-lg transition-all duration-300 animate-fade-in">
      <div className="flex items-start justify-between">
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
        <div className="p-1.5 rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      <p className="text-3xl font-bold text-foreground mt-2">{total}</p>
      <div className="flex gap-3 mt-3">
        <div className="text-center flex-1 rounded-lg bg-primary/10 p-2">
          <p className="text-xs text-muted-foreground">Sistema A</p>
          <p className="text-lg font-bold text-foreground">{sistemaA}%</p>
        </div>
        <div className="text-center flex-1 rounded-lg bg-primary/10 p-2">
          <p className="text-xs text-muted-foreground">Sistema B</p>
          <p className="text-lg font-bold text-foreground">{sistemaB}%</p>
        </div>
      </div>
    </Card>
  );
}

export default function QualidadeDashboard() {
  const d = qualidadeData;

  // Top KPI cards from gestão à vista
  const topKPIs = [
    { label: 'Ordens em Aberto', value: d.ordensAberto },
    { label: 'Registro OS Dia', value: d.registroOsDia },
    { label: 'Registro OS D-1', value: d.registroOsD1 },
    { label: 'Sem Recl. AT', value: d.semReclamacaoAT },
    { label: 'Sem Recl. SIS', value: d.semReclamacaoSIS },
  ];

  return (
    <SectorLayout title="Qualidade" subtitle="Gestão à Vista — QA" lastUpdate="20/02/2026 09:00" integrations={integrations}>
      {/* Top macro KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {topKPIs.map((kpi) => (
          <Card key={kpi.label} className="p-4 text-center bg-primary/5 border-primary/20 animate-fade-in hover:shadow-md transition-all">
            <p className="text-xs font-semibold text-primary uppercase tracking-wider">{kpi.label}</p>
            <p className="text-3xl font-bold text-foreground mt-1 font-mono">{kpi.value}</p>
          </Card>
        ))}
      </div>

      {/* OS KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard title="Total de OS's na fila" total={d.osNaFila.total} sistemaA={d.osNaFila.sistemaA} sistemaB={d.osNaFila.sistemaB} icon={FileCheck} />
        <KPICard title="Total OS's encerradas" total={d.osEncerradas.total} sistemaA={d.osEncerradas.sistemaA} sistemaB={d.osEncerradas.sistemaB} icon={TrendingUp} />
        <KPICard title="% OS's Encerradas sem retorno" total={`${d.osEncerradasSemRetorno.total}%`} sistemaA={d.osEncerradasSemRetorno.sistemaA} sistemaB={d.osEncerradasSemRetorno.sistemaB} icon={AlertTriangle} />
      </div>

      {/* Ordens por Status e Sistema */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['desenvolvimento', 'backlog', 'teste'] as const).map((status) => (
          <Card key={status} className="overflow-hidden animate-fade-in">
            <div className="bg-primary px-4 py-2">
              <h4 className="font-bold text-primary-foreground text-sm text-center capitalize">
                Ordens em {status}
              </h4>
            </div>
            <div className="grid grid-cols-3 divide-x divide-border">
              {d.porSistema[status].map((s) => (
                <div key={s.sistema} className="p-4 text-center">
                  <p className="text-xs text-muted-foreground font-medium">{s.sistema}</p>
                  <p className="text-2xl font-bold text-foreground mt-1 font-mono">{s.qtd}</p>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Faixa de Tempo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5 animate-fade-in">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Faixa de Tempo
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={d.faixaTempo} dataKey="qtd" nameKey="faixa" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2} label={({ faixa, pct }) => `${faixa} (${pct}%)`} labelLine={false}>
                {d.faixaTempo.map((entry, i) => (
                  <Cell key={i} fill={entry.cor} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5 animate-fade-in">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Distribuição por Faixa
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={d.faixaTempo}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="faixa" fontSize={10} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={12} stroke="hsl(var(--muted-foreground))" />
              <Tooltip />
              <Bar dataKey="qtd" radius={[4, 4, 0, 0]}>
                {d.faixaTempo.map((entry, i) => (
                  <Cell key={i} fill={entry.cor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Revisão Atual */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 bg-primary/5 border-primary/20 animate-fade-in">
          <h4 className="font-semibold text-foreground">Revisão Atual: Sistema A</h4>
          <p className="text-sm text-muted-foreground mt-1">Versão {d.revisaoAtual.sistemaA.versao} • Liberação {d.revisaoAtual.sistemaA.dataLiberacao}</p>
        </Card>
        <Card className="p-4 bg-primary/5 border-primary/20 animate-fade-in">
          <h4 className="font-semibold text-foreground">Revisão Atual: Sistema B</h4>
          <p className="text-sm text-muted-foreground mt-1">Versão {d.revisaoAtual.sistemaB.versao} • Liberação {d.revisaoAtual.sistemaB.dataLiberacao}</p>
        </Card>
      </div>
    </SectorLayout>
  );
}
