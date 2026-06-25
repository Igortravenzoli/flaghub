import { ExecutivoTab } from '@/components/comercial/ExecutivoTab';
import { useComercialKpis } from '@/hooks/useComercialKpis';

/** Modo TV de Comercial = Visão Executiva (escopo: ano vigente). */
export default function ComercialKiosk() {
  const now = new Date();
  const anoStart = new Date(now.getFullYear(), 0, 1);
  const { stats } = useComercialKpis('todos', anoStart, now);
  return (
    <ExecutivoTab
      // Modo TV (telão): não exibe valores monetários — somente percentuais.
      canViewValues={false}
      showValues={false}
      dateFrom={anoStart}
      dateTo={now}
      periodLabel="Ano vigente"
      clientesAtivos={stats.ativos}
      clientesBloqueados={stats.bloqueados}
    />
  );
}
