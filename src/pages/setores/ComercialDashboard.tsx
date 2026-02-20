import { SectorLayout } from '@/components/setores/SectorLayout';
import { Card } from '@/components/ui/card';
import { TrendingUp, Users, Heart, BarChart3 } from 'lucide-react';
import { comercialData } from '@/data/mockSectorData';
import { Progress } from '@/components/ui/progress';
import { useCountUp } from '@/hooks/useCountUp';
import type { Integration } from '@/components/setores/SectorIntegrations';

const integrations: Integration[] = [
  { name: 'CRM API', type: 'api', status: 'up', lastCheck: '20/02/2026 09:00', latency: '150ms', description: 'Pipeline & Clientes' },
  { name: 'ERP SQL Server', type: 'database', status: 'up', lastCheck: '20/02/2026 09:00', latency: '25ms', description: 'Dados financeiros' },
];

function AnimatedNumber({ value, prefix, suffix }: { value: number; prefix?: string; suffix?: string }) {
  const animated = useCountUp(value);
  return <>{prefix}{animated}{suffix}</>;
}

function BlockCard({ icon: Icon, title, children, delay = 0 }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode; delay?: number }) {
  return (
    <Card className="p-5 animate-fade-in hover:shadow-md transition-all duration-500" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </Card>
  );
}

export default function ComercialDashboard() {
  const d = comercialData;
  return (
    <SectorLayout title="Dashboard Único Q1 2026" subtitle="Comercial — Visão Consolidada" lastUpdate="19/02/2026 09:30" integrations={integrations}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BlockCard icon={TrendingUp} title="Topo Executivo" delay={0}>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Receita Q1</p>
              <p className="text-2xl font-bold text-foreground">R$ <AnimatedNumber value={parseFloat((d.executivo.receitaQ1 / 1e6).toFixed(1)) * 10} suffix="" />
                <span className="text-lg">{((d.executivo.receitaQ1 / 1e6) % 1).toFixed(1).substring(1)}M</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Meta atingida</p>
              <div className="flex items-center gap-2">
                <Progress value={d.executivo.metaAtingida} className="flex-1 transition-all duration-1000" />
                <span className="text-sm font-semibold text-foreground"><AnimatedNumber value={d.executivo.metaAtingida} suffix="%" /></span>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Forecast</p>
              <p className="text-lg font-semibold text-foreground">R$ {(d.executivo.forecast / 1e6).toFixed(1)}M</p>
            </div>
          </div>
        </BlockCard>

        <BlockCard icon={BarChart3} title="Bloco Pipeline" delay={100}>
          <div className="space-y-2">
            {d.pipeline.map((p, i) => (
              <div key={p.etapa} className="flex items-center justify-between animate-fade-in" style={{ animationDelay: `${200 + i * 80}ms` }}>
                <span className="text-sm text-foreground">{p.etapa}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{p.deals} deals</span>
                  <span className="text-sm font-semibold text-foreground">R$ {(p.valor / 1e3).toFixed(0)}k</span>
                </div>
              </div>
            ))}
          </div>
        </BlockCard>

        <BlockCard icon={Users} title="Bloco Clientes" delay={200}>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div className="text-center rounded-lg bg-[hsl(var(--success))]/10 p-3 animate-scale-in" style={{ animationDelay: '300ms' }}>
              <p className="text-2xl font-bold text-[hsl(var(--success))]">+<AnimatedNumber value={d.clientes.novos} /></p>
              <p className="text-xs text-muted-foreground">Novos</p>
            </div>
            <div className="text-center rounded-lg bg-[hsl(var(--critical))]/10 p-3 animate-scale-in" style={{ animationDelay: '400ms' }}>
              <p className="text-2xl font-bold text-[hsl(var(--critical))]">-<AnimatedNumber value={d.clientes.perdidos} /></p>
              <p className="text-xs text-muted-foreground">Perdidos</p>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Motivos de Churn</p>
            {d.clientes.motivosChurn.map((m) => (
              <div key={m.motivo} className="flex justify-between text-sm">
                <span className="text-foreground">{m.motivo}</span>
                <span className="text-muted-foreground">{m.qtd}</span>
              </div>
            ))}
          </div>
        </BlockCard>

        <BlockCard icon={Heart} title="Bloco Satisfação" delay={300}>
          <div className="text-center mb-4">
            <p className="text-4xl font-bold text-primary"><AnimatedNumber value={d.satisfacao.nps} /></p>
            <p className="text-sm text-muted-foreground">NPS Score</p>
          </div>
          <Card className="p-3 bg-[hsl(var(--critical))]/10 border-[hsl(var(--critical))]/20 animate-scale-in" style={{ animationDelay: '500ms' }}>
            <p className="text-sm font-semibold text-[hsl(var(--critical))]">{d.satisfacao.alertasCriticos} alertas críticos</p>
            <p className="text-xs text-muted-foreground">Requerem atenção imediata</p>
          </Card>
        </BlockCard>
      </div>
    </SectorLayout>
  );
}
