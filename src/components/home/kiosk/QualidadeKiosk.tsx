import { ExecutivoTab } from '@/components/qualidade/ExecutivoTab';

/** Modo TV de Qualidade = Visão Executiva.
 *  Escopo: TRIMESTRE civil corrente — um ano inteiro deixava o histograma de
 *  entradas em "Em Teste" ilegível no telão (pedido do gestor 17/07). Os KPIs
 *  de retornos/encerramentos seguem anuais (RPC year-based, independem daqui). */
export default function QualidadeKiosk() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const triStart = new Date(now.getFullYear(), q * 3, 1);
  return <ExecutivoTab tvMode dateStart={triStart} dateEnd={now} periodLabel={`T${q + 1}/${now.getFullYear()}`} />;
}
