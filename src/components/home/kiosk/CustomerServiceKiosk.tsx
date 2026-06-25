import { useMemo } from 'react';
import { CSExecutivoTab } from '@/components/customerservice/CSExecutivoTab';
import { useCustomerServiceKpis, type CSKpiItem } from '@/hooks/useCustomerServiceKpis';

// Mesmas regras do CustomerServiceDashboard
function isCustomerService(item: CSKpiItem): boolean {
  const email = (item.assigned_to_unique || '').toLowerCase();
  if (email === 'cs@flag.com.br') return true;
  const display = (item.assigned_to_display || '').toLowerCase();
  return display === 'cs' || display === 'customer service';
}
function isAprovacaoCS(item: CSKpiItem): boolean {
  const email = (item.assigned_to_unique || '').toLowerCase();
  if (email === 'aprovacaocs@flag.com.br') return true;
  const display = (item.assigned_to_display || '').toLowerCase();
  return display.includes('aprovacaocs') || display.includes('aprovação cs') || display.includes('aprovacao cs');
}

/** Modo TV de Produtos (Customer Service) = Visão Executiva. Fila é estado atual. */
export default function CustomerServiceKiosk() {
  const { devopsItems, totalFilaCS, implAndamento, implFinalizadas, implTotal, isLoading } = useCustomerServiceKpis();

  const aprovacaoCSCount = useMemo(() => devopsItems.filter(isAprovacaoCS).length, [devopsItems]);
  const customerServiceCount = useMemo(() => devopsItems.filter(isCustomerService).length, [devopsItems]);
  const inBacklogCount = useMemo(() => devopsItems.filter(i => i.inBacklog).length, [devopsItems]);
  const alertCounts = useMemo(() => {
    const critical = devopsItems.filter(i => i.aging?.alertLevel === 'critical').length;
    const warning = devopsItems.filter(i => i.aging?.alertLevel === 'warning').length;
    return { critical, warning, total: critical + warning };
  }, [devopsItems]);

  return (
    <CSExecutivoTab
      kpis={{ totalFilaCS, implAndamento, implFinalizadas, implTotal, isLoading }}
      aprovacaoCSCount={aprovacaoCSCount}
      customerServiceCount={customerServiceCount}
      inBacklogCount={inBacklogCount}
      alertCounts={alertCounts}
      devopsItems={devopsItems}
      periodLabel="Estado atual"
    />
  );
}
