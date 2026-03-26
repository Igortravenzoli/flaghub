import { useMemo } from 'react';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { Badge } from '@/components/ui/badge';
import { Clock, FileText, Users, TrendingUp, Monitor, Server, Wrench, Shield, Layers, Package, CheckCircle, AlertTriangle, HeartPulse, Code2, Bug, Plane, ListTodo } from 'lucide-react';
import { MetricMetadataProvider } from '@/contexts/MetricMetadataContext';
import { useHelpdeskKpis } from '@/hooks/useHelpdeskKpis';
import { useFabricaKpis } from '@/hooks/useFabricaKpis';
import { useComercialKpis } from '@/hooks/useComercialKpis';
import { useCustomerServiceKpis } from '@/hooks/useCustomerServiceKpis';
import { useQualidadeKpis } from '@/hooks/useQualidadeKpis';
import { useInfraestruturaKpis } from '@/hooks/useInfraestruturaKpis';
import { usePbiHealthBatch } from '@/hooks/usePbiHealthBatch';
import { Skeleton } from '@/components/ui/skeleton';

interface KioskSectorViewProps {
  sectorSlug: string;
  sectorName: string;
}

// ── Helpdesk KPI View ──
function HelpdeskKiosk() {
  const kpis = useHelpdeskKpis(null, null);
  const { totalRegistros, totalHoras, horasDiaTotal, totalConsultores, registrosPorSistema, lastSync, isLoading } = kpis;

  const top3Sistemas = useMemo(() =>
    registrosPorSistema.slice().sort((a, b) => b.quantidade - a.quantidade).slice(0, 3),
    [registrosPorSistema]
  );

  return (
    <MetricMetadataProvider areaKey="helpdesk">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <DashboardKpiCard label="Registros Hoje" value={totalRegistros} icon={FileText} isLoading={isLoading} />
        <DashboardKpiCard label="Horas Acumuladas" value={totalHoras} suffix="h" icon={Clock} isLoading={isLoading} delay={80} />
        <DashboardKpiCard label="Horas Hoje" value={horasDiaTotal} suffix="h" icon={TrendingUp} isLoading={isLoading} delay={160} />
        <DashboardKpiCard label="Consultores Ativos" value={totalConsultores} icon={Users} isLoading={isLoading} delay={240} />
      </div>
      {top3Sistemas.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-4">
          {top3Sistemas.map((s, i) => (
            <DashboardKpiCard key={s.nome} label={s.nome} value={s.quantidade} icon={Monitor} isLoading={isLoading} delay={320 + i * 80} />
          ))}
        </div>
      )}
      {lastSync && (
        <p className="text-xs text-muted-foreground/60 mt-4 text-right">
          Última coleta: {new Date(lastSync).toLocaleTimeString('pt-BR')}
        </p>
      )}
    </MetricMetadataProvider>
  );
}

// ── Fábrica KPI View ──
function FabricaKiosk() {
  const { items, isLoading } = useFabricaKpis();
  const health = usePbiHealthBatch(items?.map(i => i.id) || [], 'fabrica');

  const stats = useMemo(() => {
    if (!items) return { total: 0, inProgress: 0, aguardandoTeste: 0, avioes: 0, bugs: 0 };
    const inProgressStates = new Set(['In Progress', 'Active', 'Em desenvolvimento', 'Aguardando Teste']);
    const testStates = new Set(['Aguardando Teste']);
    return {
      total: items.length,
      inProgress: items.filter(i => inProgressStates.has(i.state || '')).length,
      aguardandoTeste: items.filter(i => testStates.has(i.state || '')).length,
      avioes: items.filter(i => (i.tags || '').toLowerCase().includes('aviao')).length,
      bugs: items.filter(i => i.work_item_type === 'Bug').length,
    };
  }, [items]);

  return (
    <MetricMetadataProvider areaKey="fabrica">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <DashboardKpiCard label="Atividades Sprint" value={stats.total} icon={Code2} isLoading={isLoading} />
        <DashboardKpiCard label="Em Andamento" value={stats.inProgress} icon={ListTodo} isLoading={isLoading} delay={80} />
        <DashboardKpiCard label="Aguardando Teste" value={stats.aguardandoTeste} icon={Clock} isLoading={isLoading} delay={160} />
        <DashboardKpiCard label="Aviões" value={stats.avioes} icon={Plane} isLoading={isLoading} delay={240} />
      </div>
      {health.overview && (
        <div className="mt-4 grid grid-cols-3 gap-4">
          <DashboardKpiCard label="Saúde Verde" value={Number(health.overview.verde_count || 0)} icon={HeartPulse} isLoading={false} delay={320} />
          <DashboardKpiCard label="Saúde Amarela" value={Number(health.overview.amarelo_count || 0)} icon={AlertTriangle} isLoading={false} delay={400} />
          <DashboardKpiCard label="Saúde Vermelha" value={Number(health.overview.vermelho_count || 0)} icon={AlertTriangle} isLoading={false} delay={480} />
        </div>
      )}
    </MetricMetadataProvider>
  );
}

// ── Comercial KPI View ──
function ComercialKiosk() {
  const { data, isLoading } = useComercialKpis();

  const stats = useMemo(() => {
    if (!data) return { total: 0, ativos: 0, inativos: 0, bloqueados: 0 };
    return {
      total: data.length,
      ativos: data.filter(c => c.status?.toLowerCase() === 'ativo').length,
      inativos: data.filter(c => c.status?.toLowerCase() === 'inativo').length,
      bloqueados: data.filter(c => c.status?.toLowerCase() === 'bloqueado').length,
    };
  }, [data]);

  return (
    <MetricMetadataProvider areaKey="comercial">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <DashboardKpiCard label="Total Clientes" value={stats.total} icon={Users} isLoading={isLoading} />
        <DashboardKpiCard label="Ativos" value={stats.ativos} icon={CheckCircle} isLoading={isLoading} delay={80} />
        <DashboardKpiCard label="Inativos" value={stats.inativos} icon={AlertTriangle} isLoading={isLoading} delay={160} />
        <DashboardKpiCard label="Bloqueados" value={stats.bloqueados} icon={Shield} isLoading={isLoading} delay={240} />
      </div>
    </MetricMetadataProvider>
  );
}

// ── Customer Service KPI View ──
function CustomerServiceKiosk() {
  const { items, implantacoes, filaManual, isLoading } = useCustomerServiceKpis();

  const stats = useMemo(() => {
    const implAtivas = implantacoes?.filter(i => !['Finalizado', 'Encerrado', 'Concluído'].includes(i.status_implantacao || '')).length || 0;
    const implFinalizadas = (implantacoes?.length || 0) - implAtivas;
    return {
      totalFila: filaManual?.length || 0,
      implAtivas,
      implFinalizadas,
      totalDevops: items?.length || 0,
    };
  }, [items, implantacoes, filaManual]);

  return (
    <MetricMetadataProvider areaKey="customer-service">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <DashboardKpiCard label="Implantações Ativas" value={stats.implAtivas} icon={Package} isLoading={isLoading} />
        <DashboardKpiCard label="Fila" value={stats.totalFila} icon={Layers} isLoading={isLoading} delay={80} />
        <DashboardKpiCard label="Finalizadas" value={stats.implFinalizadas} icon={CheckCircle} isLoading={isLoading} delay={160} />
        <DashboardKpiCard label="Itens DevOps" value={stats.totalDevops} icon={Code2} isLoading={isLoading} delay={240} />
      </div>
    </MetricMetadataProvider>
  );
}

// ── Qualidade KPI View ──
function QualidadeKiosk() {
  const { items, isLoading } = useQualidadeKpis();
  const health = usePbiHealthBatch(items?.map(i => i.id).filter(Boolean) as number[] || [], 'qualidade');

  const stats = useMemo(() => {
    if (!items) return { total: 0, emTeste: 0, aguardandoDeploy: 0, retornoQa: 0 };
    return {
      total: items.length,
      emTeste: items.filter(i => i.state === 'Em Teste').length,
      aguardandoDeploy: items.filter(i => i.state === 'Aguardando Deploy').length,
      retornoQa: items.filter(i => (i as any).qa_retorno_count > 0).length,
    };
  }, [items]);

  return (
    <MetricMetadataProvider areaKey="qualidade">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <DashboardKpiCard label="PBIs Monitorados" value={stats.total} icon={Layers} isLoading={isLoading} />
        <DashboardKpiCard label="Em Teste" value={stats.emTeste} icon={Clock} isLoading={isLoading} delay={80} />
        <DashboardKpiCard label="Aguardando Deploy" value={stats.aguardandoDeploy} icon={Package} isLoading={isLoading} delay={160} />
        <DashboardKpiCard label="Retorno QA" value={stats.retornoQa} icon={Bug} isLoading={isLoading} delay={240} />
      </div>
      {health.overview && (
        <div className="mt-4 grid grid-cols-3 gap-4">
          <DashboardKpiCard label="Verde" value={Number(health.overview.verde_count || 0)} icon={HeartPulse} isLoading={false} delay={320} />
          <DashboardKpiCard label="Amarelo" value={Number(health.overview.amarelo_count || 0)} icon={AlertTriangle} isLoading={false} delay={400} />
          <DashboardKpiCard label="Vermelho" value={Number(health.overview.vermelho_count || 0)} icon={AlertTriangle} isLoading={false} delay={480} />
        </div>
      )}
    </MetricMetadataProvider>
  );
}

// ── Infraestrutura KPI View ──
function InfraestruturaKiosk() {
  const { items, isLoading } = useInfraestruturaKpis();

  const stats = useMemo(() => {
    if (!items) return { total: 0, pendentes: 0, emAndamento: 0, bloqueios: 0 };
    const pendStates = new Set(['New', 'To Do']);
    const progressStates = new Set(['In Progress', 'Active']);
    return {
      total: items.length,
      pendentes: items.filter(i => pendStates.has(i.state || '')).length,
      emAndamento: items.filter(i => progressStates.has(i.state || '')).length,
      bloqueios: items.filter(i => i.priority === 1).length,
    };
  }, [items]);

  return (
    <MetricMetadataProvider areaKey="infraestrutura">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <DashboardKpiCard label="Itens em Fila" value={stats.total} icon={Server} isLoading={isLoading} />
        <DashboardKpiCard label="Pendentes" value={stats.pendentes} icon={Clock} isLoading={isLoading} delay={80} />
        <DashboardKpiCard label="Em Andamento" value={stats.emAndamento} icon={Wrench} isLoading={isLoading} delay={160} />
        <DashboardKpiCard label="Alta Prioridade" value={stats.bloqueios} icon={Shield} isLoading={isLoading} delay={240} />
      </div>
    </MetricMetadataProvider>
  );
}

// ── Sector Router ──
const SECTOR_VIEWS: Record<string, React.ComponentType> = {
  helpdesk: HelpdeskKiosk,
  fabrica: FabricaKiosk,
  comercial: ComercialKiosk,
  'customer-service': CustomerServiceKiosk,
  qualidade: QualidadeKiosk,
  infraestrutura: InfraestruturaKiosk,
};

export default function KioskSectorView({ sectorSlug, sectorName }: KioskSectorViewProps) {
  const Component = SECTOR_VIEWS[sectorSlug];

  if (!Component) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Kiosk não configurado para "{sectorName}"</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-2xl font-bold text-foreground tracking-tight">{sectorName}</h2>
      <Component />
    </div>
  );
}
