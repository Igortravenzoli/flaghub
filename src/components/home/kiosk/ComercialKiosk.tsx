import { ComercialTvView } from '@/components/comercial/ComercialTvView';
import { usePaginaKiosk } from '@/contexts/KioskRotationContext';
import { useComercialKpis } from '@/hooks/useComercialKpis';
import { trimestreVigente } from '@/lib/comercialPeriodo';

/**
 * Modo TV de Comercial — UMA tela com tudo; abre no trimestre vigente.
 *
 * Linha do tempo desta tela, para ninguém refazer caminho já andado:
 *   até 30/07/2026 .. Visão Executiva do ANO, com cada card lendo uma janela
 *                     diferente (funil no último mês, clientes em mock);
 *   30/07/2026 ...... trimestre fixo, janela única, uma página;
 *   18/08/2026 ...... funil ganha tela própria (modelo da reunião quinzenal) e
 *                     o setor passa a ter 2 páginas na rotação;
 *   19/08/2026 ...... as 2 páginas viram 1 (`ComercialTvView` completa);
 *   20/08/2026 ...... trimestre/abas viraram estado DA VIEW (seletor ‹ › no
 *                     selo) — aqui só resta a foto da base p/ clientes.
 *
 * `usePaginaKiosk(1)` é declaração, não sobra: sem ela o setor herdaria a
 * contagem de páginas de quem passou antes na rotação.
 */
/**
 * PROVISÓRIO (20/08/2026, pedido do Igor): a base VDesk soma 225 ativos (já sem
 * internos), mas o número certo hoje é 218 — fixado até a base ser corrigida.
 * Para voltar ao cálculo, apagar a constante e restaurar a linha comentada.
 */
const CLIENTES_ATIVOS_FIXO_PROVISORIO = 218;

export default function ComercialKiosk() {
  const trimestre = trimestreVigente();
  usePaginaKiosk(1);
  const { stats, isLoading } = useComercialKpis('todos', trimestre.from, trimestre.to);

  return (
    <ComercialTvView
      // Internos fora da conta — regra do Comercial no telão.
      clientesAtivos={CLIENTES_ATIVOS_FIXO_PROVISORIO}
      // clientesAtivos={Math.max(0, stats.ativos - stats.ativosInternos)}
      clientesBloqueados={stats.bloqueados}
      isLoadingClientes={isLoading}
    />
  );
}
