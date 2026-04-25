import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { Card } from '@/components/ui/card';
import { Package, Send, Eye } from 'lucide-react';
import type { Integration } from '@/components/setores/SectorIntegrations';

const integrations: Integration[] = [];

export default function ProdutosDashboard() {
  const filters = useDashboardFilters('mes_atual');

  return (
    <SectorLayout title="Produtos" subtitle="Dashboard de Métricas de Produto" lastUpdate="" integrations={integrations}>
      <DashboardFilterBar
        preset={filters.preset}
        onPresetChange={filters.setPreset}
        presetLabel={filters.presetLabel}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        onCustomRange={filters.setCustomRange}
      />

      <DashboardEmptyState
        title="Dados de Produtos"
        description="A integração com fontes de dados de Produtos ainda não foi configurada. Os KPIs serão exibidos após a configuração da origem de dados (ex: RD Station, analytics interno)."
        icon={Package}
      />
    </SectorLayout>
  );
}
