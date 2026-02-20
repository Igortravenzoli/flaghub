import { SectorLayout } from '@/components/setores/SectorLayout';
import { Card } from '@/components/ui/card';
import { infraestruturaData } from '@/data/mockSectorData';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import type { Integration } from '@/components/setores/SectorIntegrations';

const integrations: Integration[] = [
  { name: 'Zabbix API', type: 'api', status: 'up', lastCheck: '20/02/2026 09:00', latency: '45ms', description: 'Monitoramento de infraestrutura' },
  { name: 'SQL Server (Planet)', type: 'database', status: 'up', lastCheck: '20/02/2026 09:00', latency: '12ms', description: 'Banco principal Planet' },
  { name: 'SQL Server (FlagCloud)', type: 'database', status: 'up', lastCheck: '20/02/2026 09:00', latency: '18ms', description: 'Banco FlagCloud' },
  { name: 'IBM Cloud API', type: 'api', status: 'up', lastCheck: '20/02/2026 08:55', latency: '230ms', description: 'Servidores IBM' },
  { name: 'Grafana API', type: 'api', status: 'down', lastCheck: '20/02/2026 08:30', latency: '—', description: 'Dashboards de monitoramento' },
];

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

export default function InfraestruturaDashboard() {
  const d = infraestruturaData;
  const maxAmb = Math.max(...d.porAmbiente.map((a) => a.conexoes));
  const maxDist = Math.max(...d.porDistribuidora.map((a) => a.conexoes));

  return (
    <SectorLayout title="Infraestrutura" subtitle="Conexões, Faturamento e Monitoramento" lastUpdate={d.ultimaAtualizacao} integrations={integrations}>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="p-5 text-center animate-fade-in">
          <p className="text-4xl font-bold text-foreground">{d.conexoesAtivas}</p>
          <p className="text-xs text-muted-foreground">Conexões Ativas</p>
        </Card>
        <Card className="p-5 text-center animate-fade-in">
          <p className="text-2xl font-bold text-foreground">R$ {(d.faturamento.reduce((s, f) => s + f.valor, 0) / 1e6).toFixed(1)}M</p>
          <p className="text-xs text-muted-foreground">Faturamento Total</p>
        </Card>
        <Card className="p-5 text-center animate-fade-in">
          <p className="text-2xl font-bold text-foreground">{d.porAmbiente.length}</p>
          <p className="text-xs text-muted-foreground">Ambientes Ativos</p>
        </Card>
      </div>

      {/* Histograma de Acessos */}
      <Card className="p-5 animate-fade-in">
        <h3 className="font-semibold text-foreground mb-4">Histograma de Acessos (24h)</h3>
        <p className="text-xs text-muted-foreground mb-3">Picos: 07:00–08:00 e 16:00–18:00</p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={d.histogramaAcessos}>
            <defs>
              <linearGradient id="colorAcessos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="hora" fontSize={10} stroke="hsl(var(--muted-foreground))" />
            <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
            <Tooltip />
            <Area type="monotone" dataKey="acessos" stroke="hsl(199, 89%, 48%)" fill="url(#colorAcessos)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5 animate-fade-in">
          <h3 className="font-semibold text-foreground mb-4">Conexões por Ambiente</h3>
          <div className="space-y-2">
            {d.porAmbiente.map((a) => (
              <HorizontalBar key={a.ambiente} label={a.ambiente} value={a.conexoes} max={maxAmb} />
            ))}
          </div>
        </Card>
        <Card className="p-5 animate-fade-in">
          <h3 className="font-semibold text-foreground mb-4">Conexões por Distribuidora</h3>
          <div className="space-y-2">
            {d.porDistribuidora.map((a) => (
              <HorizontalBar key={a.distribuidora} label={a.distribuidora} value={a.conexoes} max={maxDist} />
            ))}
          </div>
        </Card>
      </div>

      {/* Faturamento */}
      <Card className="p-5 animate-fade-in">
        <h3 className="font-semibold text-foreground mb-4">Faturamento por Ambiente</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {d.faturamento.map((f, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors">
              <div>
                <p className="text-xs text-muted-foreground">{f.ambiente}</p>
                <p className="text-sm font-medium text-foreground truncate">{f.distribuidora}</p>
              </div>
              <p className="text-sm font-bold text-foreground">R$ {f.valor >= 1e6 ? `${(f.valor / 1e6).toFixed(2)}M` : `${(f.valor / 1e3).toFixed(0)}k`}</p>
            </div>
          ))}
        </div>
      </Card>
    </SectorLayout>
  );
}
