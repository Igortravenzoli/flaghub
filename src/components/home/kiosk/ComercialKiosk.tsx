import { ComercialTvView } from '@/components/comercial/ComercialTvView';
import { usePaginaKiosk } from '@/contexts/KioskRotationContext';
import { useComercialKpis } from '@/hooks/useComercialKpis';
import { trimestreVigente, visoesDoTrimestre } from '@/lib/comercialPeriodo';

/**
 * Modo TV de Comercial — UMA tela com tudo, no trimestre vigente.
 *
 * Linha do tempo desta tela, para ninguém refazer caminho já andado:
 *   até 30/07/2026 .. Visão Executiva do ANO, com cada card lendo uma janela
 *                     diferente (funil no último mês, clientes em mock);
 *   30/07/2026 ...... trimestre fixo, janela única, uma página;
 *   18/08/2026 ...... funil ganha tela própria (modelo da reunião quinzenal) e
 *                     o setor passa a ter 2 páginas na rotação;
 *   19/08/2026 ...... as 2 páginas viram 1 (`ComercialTvView` completa).
 *
 * `usePaginaKiosk(1)` é declaração, não sobra: sem ela o setor herdaria a
 * contagem de páginas de quem passou antes na rotação.
 */
export default function ComercialKiosk() {
  const trimestre = trimestreVigente();
  const visoes = visoesDoTrimestre();
  usePaginaKiosk(1);
  const { stats, isLoading } = useComercialKpis('todos', trimestre.from, trimestre.to);

  return (
    <ComercialTvView
      visoes={visoes}
      trimestreLabel={trimestre.label}
      qKey={trimestre.qKey}
      dateFrom={trimestre.from}
      dateTo={trimestre.to}
      // Internos fora da conta — regra do Comercial no telão.
      clientesAtivos={Math.max(0, stats.ativos - stats.ativosInternos)}
      clientesBloqueados={stats.bloqueados}
      isLoadingClientes={isLoading}
    />
  );
}
