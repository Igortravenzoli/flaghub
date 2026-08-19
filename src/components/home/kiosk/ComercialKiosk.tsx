import { ExecutivoTab } from '@/components/comercial/ExecutivoTab';
import { ComercialTvView } from '@/components/comercial/ComercialTvView';
import { usePaginaKiosk } from '@/contexts/KioskRotationContext';
import { useComercialKpis } from '@/hooks/useComercialKpis';
import { trimestreVigente, visoesDoTrimestre } from '@/lib/comercialPeriodo';

/**
 * Modo TV de Comercial — **trimestre vigente**, em páginas.
 *
 * Histórico: era "ano vigente" até 30/07/2026, com cada card lendo uma janela
 * diferente; virou trimestre fixo numa página só. Em 18/08/2026 ganhou a
 * segunda página (modelo da reunião quinzenal):
 *
 *   página 1 ... Funil de Vendas, com as visões do trimestre em abas CLICÁVEIS
 *   página 2 ... Visão Executiva (carteira, produtos, satisfação, alertas)
 *
 * O funil vem primeiro (ordem invertida em 19/08/2026, decisão do Igor): é a
 * tela da reunião quinzenal, e a primeira página é a que o telão mostra por
 * mais tempo quando alguém passa os olhos e segue andando.
 *
 * Duas páginas, não N: uma página por recorte faria o Comercial sozinho ocupar
 * metade da volta da rotação entre setores. Quem quiser abrir um mês específico
 * durante a reunião clica na aba; a faixa de KPIs já compara os meses sem clique.
 *
 * O funil saiu da Visão Executiva no telão: lá ele dividia uma coluna em modo
 * compacto e ninguém lia as quantidades a 4 m. Aqui cada funil tem meia tela.
 *
 * Nada aqui cita trimestre: `trimestreVigente` e `visoesDoTrimestre` saem do
 * calendário a cada render, então a virada do Q4 não pede build novo.
 */
export default function ComercialKiosk() {
  const trimestre = trimestreVigente();
  const visoes = visoesDoTrimestre();
  const pagina = usePaginaKiosk(2);
  const { stats } = useComercialKpis('todos', trimestre.from, trimestre.to);

  if (pagina > 0) {
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

  return (
    <ComercialTvView
      visoes={visoes}
      trimestreLabel={trimestre.label}
      qKey={trimestre.qKey}
    />
  );
}
