import { ExecutivoTab } from '@/components/comercial/ExecutivoTab';
import { useComercialKpis } from '@/hooks/useComercialKpis';
import { trimestreVigente } from '@/lib/comercialPeriodo';

/**
 * Modo TV de Comercial = Visão Executiva do **trimestre vigente**.
 *
 * Era "ano vigente" até 30/07/2026 — e, pior, cada card lia uma janela diferente
 * (ano nas vendas, último mês nos funis, mock nos clientes). Agora todos os cards
 * recebem o mesmo recorte, e o rótulo do trimestre fica visível no topo.
 * Escopo fixo de propósito: telão não tem operador para trocar filtro.
 */
export default function ComercialKiosk() {
  const trimestre = trimestreVigente();
  const { stats } = useComercialKpis('todos', trimestre.from, trimestre.to);
  return (
    <ExecutivoTab
      // Modo TV (telão): não exibe valores monetários — somente percentuais.
      tvMode
      canViewValues={false}
      showValues={false}
      dateFrom={trimestre.from}
      dateTo={trimestre.to}
      periodLabel={trimestre.label}
      clientesAtivos={Math.max(0, stats.ativos - stats.ativosInternos)}
      clientesBloqueados={stats.bloqueados}
    />
  );
}
