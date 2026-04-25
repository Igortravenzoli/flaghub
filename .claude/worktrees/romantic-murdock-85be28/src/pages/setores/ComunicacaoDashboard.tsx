import { SectorLayout } from '@/components/setores/SectorLayout';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { comunicacaoData } from '@/data/mockSectorData';
import { Mail, Send, Eye, Users, Target } from 'lucide-react';
import { useCountUp } from '@/hooks/useCountUp';
import type { Integration } from '@/components/setores/SectorIntegrations';

const integrations: Integration[] = [
  { name: 'RD Station API', type: 'api', status: 'up', lastCheck: '20/02/2026 09:10', latency: '200ms', description: 'Email Marketing & Leads' },
];

function KPI({ icon: Icon, label, value, suffix, delay = 0 }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | string; suffix?: string; delay?: number }) {
  const numericValue = typeof value === 'number' ? value : 0;
  const animated = useCountUp(numericValue);
  return (
    <Card className="p-4 text-center animate-fade-in hover:shadow-md transition-all duration-500 hover:-translate-y-0.5" style={{ animationDelay: `${delay}ms` }}>
      <div className="mx-auto w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <p className="text-2xl font-bold text-foreground">{typeof value === 'number' ? animated : value}{suffix}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Card>
  );
}

export default function ComunicacaoDashboard() {
  const d = comunicacaoData;
  return (
    <SectorLayout title="Comunicação" subtitle="Dashboard RD Station" lastUpdate="19/02/2026 09:10" integrations={integrations}>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPI icon={Send} label="Emails enviados" value={d.kpis.emailsEnviados} delay={0} />
        <KPI icon={Mail} label="Entregues" value={d.kpis.entregues} suffix="%" delay={80} />
        <KPI icon={Eye} label="Aberturas únicas" value={d.kpis.aberturasUnicas} suffix="%" delay={160} />
        <KPI icon={Users} label="Leads" value={d.kpis.leads} delay={240} />
        <KPI icon={Target} label="Conversões" value={d.kpis.conversoes} delay={320} />
      </div>

      <Card className="animate-fade-in" style={{ animationDelay: '400ms' }}>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome do email</TableHead>
                <TableHead>Data de envio</TableHead>
                <TableHead>Selecionados</TableHead>
                <TableHead>Abertura %</TableHead>
                <TableHead>Cliques %</TableHead>
                <TableHead>Bounces %</TableHead>
                <TableHead>Spam %</TableHead>
                <TableHead>Descadastros %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.emails.map((email, i) => (
                <TableRow key={i} className="hover:bg-muted/50 transition-colors animate-fade-in" style={{ animationDelay: `${500 + i * 60}ms` }}>
                  <TableCell className="max-w-[350px] truncate text-sm font-medium text-primary">{email.nome}</TableCell>
                  <TableCell className="text-sm">{email.dataEnvio}</TableCell>
                  <TableCell className="text-sm">{email.selecionados}</TableCell>
                  <TableCell className="text-sm">{email.abertura.toFixed(2)}%</TableCell>
                  <TableCell className="text-sm">{email.cliques.toFixed(2)}%</TableCell>
                  <TableCell className="text-sm">{email.bounces.toFixed(2)}%</TableCell>
                  <TableCell className="text-sm">{email.spam.toFixed(2)}%</TableCell>
                  <TableCell className="text-sm">{email.descadastros.toFixed(2)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </SectorLayout>
  );
}
