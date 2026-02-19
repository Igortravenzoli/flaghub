import { SectorLayout } from '@/components/setores/SectorLayout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wifi } from 'lucide-react';
import { infraestruturaData } from '@/data/mockSectorData';

function HorizontalBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = (value / max) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-foreground w-40 truncate">{label}</span>
      <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
        <div className="h-full bg-[hsl(var(--info))] rounded" style={{ width: `${pct}%` }} />
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
    <SectorLayout title="Infraestrutura" subtitle="Conexões e Faturamento" lastUpdate={d.ultimaAtualizacao}>
      {/* KPI + Indicadores */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-5 text-center">
          <p className="text-4xl font-bold text-foreground">{d.conexoesAtivas}</p>
          <p className="text-xs text-muted-foreground">Conexões Ativas</p>
        </Card>
        <Card className="p-4 flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Zabbix</span>
          <Badge className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] gap-1"><Wifi className="h-3 w-3" /> UP</Badge>
        </Card>
        <Card className="p-4 flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Banco</span>
          <Badge className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] gap-1"><Wifi className="h-3 w-3" /> UP</Badge>
        </Card>
        <Card className="p-5 text-center">
          <p className="text-2xl font-bold text-foreground">R$ {(d.faturamento.reduce((s, f) => s + f.valor, 0) / 1e6).toFixed(1)}M</p>
          <p className="text-xs text-muted-foreground">Faturamento Total</p>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold text-foreground mb-4">Conexões por Ambiente</h3>
          <div className="space-y-2">
            {d.porAmbiente.map((a) => (
              <HorizontalBar key={a.ambiente} label={a.ambiente} value={a.conexoes} max={maxAmb} />
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold text-foreground mb-4">Conexões por Distribuidora</h3>
          <div className="space-y-2">
            {d.porDistribuidora.map((a) => (
              <HorizontalBar key={a.distribuidora} label={a.distribuidora} value={a.conexoes} max={maxDist} />
            ))}
          </div>
        </Card>
      </div>

      {/* Faturamento */}
      <Card className="p-5">
        <h3 className="font-semibold text-foreground mb-4">Faturamento por Ambiente</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {d.faturamento.map((f, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted">
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
