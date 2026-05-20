import { SectorLayout } from '@/components/setores/SectorLayout';
import { GerencialQaPanel } from '@/components/qualidade/GerencialQaPanel';

export default function GerencialQaDashboard() {
  return (
    <SectorLayout
      title="Gerencial QA"
      subtitle="Visão executiva de qualidade, retrabalho e eficiência de testes"
      areaKey="qualidade"
    >
      <GerencialQaPanel />
    </SectorLayout>
  );
}
