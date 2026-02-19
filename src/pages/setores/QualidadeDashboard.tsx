import { SectorLayout } from '@/components/setores/SectorLayout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wifi } from 'lucide-react';
import { qualidadeData } from '@/data/mockSectorData';

function KPICard({ title, total, sistemaA, sistemaB, subtitle }: {
  title: string; total: number | string; sistemaA: number; sistemaB: number; subtitle?: string;
}) {
  return (
    <Card className="p-5 bg-primary/10 border-primary/20">
      <h3 className="font-semibold text-sm text-foreground">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      <p className="text-3xl font-bold text-foreground mt-2">= {total}</p>
      <div className="flex gap-4 mt-3">
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
  return (
    <SectorLayout title="KPI's - QA" subtitle="Qualidade" lastUpdate="19/02/2026 09:00">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard title="Total de OS's na fila" total={d.osNaFila.total} sistemaA={d.osNaFila.sistemaA} sistemaB={d.osNaFila.sistemaB} />
        <KPICard title="Total OS's encerradas" total={d.osEncerradas.total} sistemaA={d.osEncerradas.sistemaA} sistemaB={d.osEncerradas.sistemaB} />
        <KPICard title="% de OS's Encerradas sem retorno" total={`${d.osEncerradasSemRetorno.total}%`} sistemaA={d.osEncerradasSemRetorno.sistemaA} sistemaB={d.osEncerradasSemRetorno.sistemaB} />
      </div>

      {/* Conexões */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 flex items-center justify-between">
          <span className="font-medium text-foreground">Conexão Vdesk</span>
          <Badge className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] gap-1">
            <Wifi className="h-3 w-3" /> UP
          </Badge>
        </Card>
        <Card className="p-4 flex items-center justify-between">
          <span className="font-medium text-foreground">Conexão DevOps</span>
          <Badge className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] gap-1">
            <Wifi className="h-3 w-3" /> UP
          </Badge>
        </Card>
      </div>

      {/* Revisão Atual */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 bg-primary/10 border-primary/20">
          <h4 className="font-semibold text-foreground">Revisão Atual: Sistema A</h4>
          <p className="text-sm text-muted-foreground mt-1">Versão {d.revisaoAtual.sistemaA.versao} • Liberação {d.revisaoAtual.sistemaA.dataLiberacao}</p>
        </Card>
        <Card className="p-4 bg-primary/10 border-primary/20">
          <h4 className="font-semibold text-foreground">Revisão Atual: Sistema B</h4>
          <p className="text-sm text-muted-foreground mt-1">Versão {d.revisaoAtual.sistemaB.versao} • Liberação {d.revisaoAtual.sistemaB.dataLiberacao}</p>
        </Card>
      </div>
    </SectorLayout>
  );
}
