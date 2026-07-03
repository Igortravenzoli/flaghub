import { ExecutivoTab } from '@/components/qualidade/ExecutivoTab';

/** Modo TV de Qualidade = Visão Executiva (escopo: ano vigente). */
export default function QualidadeKiosk() {
  const now = new Date();
  const anoStart = new Date(now.getFullYear(), 0, 1);
  return <ExecutivoTab tvMode dateStart={anoStart} dateEnd={now} periodLabel="Ano vigente" />;
}
