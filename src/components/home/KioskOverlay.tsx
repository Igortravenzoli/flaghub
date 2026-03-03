import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Minimize2 } from 'lucide-react';
import type { SectorInfo } from '@/data/mockSectorData';

// Lazy-load sector dashboards for kiosk
import QualidadeDashboard from '@/pages/setores/QualidadeDashboard';
import ComercialDashboard from '@/pages/setores/ComercialDashboard';
import CustomerServiceDashboard from '@/pages/setores/CustomerServiceDashboard';
import FabricaDashboard from '@/pages/setores/FabricaDashboard';
import ProdutosDashboard from '@/pages/setores/ProdutosDashboard';
import Dashboard from '@/pages/Dashboard';

const sectorComponents: Record<string, React.ComponentType> = {
  tickets_os: Dashboard,
  qualidade: QualidadeDashboard,
  comercial: ComercialDashboard,
  'customer-service': CustomerServiceDashboard,
  fabrica: FabricaDashboard,
  produtos: ProdutosDashboard,
};

interface KioskOverlayProps {
  activeSectors: SectorInfo[];
  currentIndex: number;
  kioskRandom: boolean;
  onExit: () => void;
}

export default function KioskOverlay({ activeSectors, currentIndex, kioskRandom, onExit }: KioskOverlayProps) {
  const currentSector = activeSectors[currentIndex % activeSectors.length];
  const SectorComponent = sectorComponents[currentSector.slug];

  return (
    <div className="fixed inset-0 z-[100] bg-background overflow-auto">
      <div className="fixed top-4 right-4 z-[110] flex items-center gap-2">
        {kioskRandom && activeSectors.length > 1 && (
          <Badge variant="secondary" className="font-mono text-xs">
            {currentSector.name} • {currentIndex + 1}/{activeSectors.length}
          </Badge>
        )}
        <Button variant="outline" size="sm" onClick={onExit} className="bg-card/80 backdrop-blur-sm shadow-lg">
          <Minimize2 className="h-4 w-4 mr-1" /> Sair
        </Button>
      </div>
      <div className="p-6">
        {SectorComponent ? <SectorComponent /> : <p>Dashboard não encontrado</p>}
      </div>
    </div>
  );
}
