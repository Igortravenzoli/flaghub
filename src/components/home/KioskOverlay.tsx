import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Minimize2 } from 'lucide-react';
import type { SectorInfo } from '@/data/mockSectorData';

// Lazy-load sector dashboards for kiosk
import QualidadeDashboard from '@/pages/setores/QualidadeDashboard';
import ComercialDashboard from '@/pages/setores/ComercialDashboard';
import CustomerServiceDashboard from '@/pages/setores/CustomerServiceDashboard';
import FabricaDashboard from '@/pages/setores/FabricaDashboard';
import InfraestruturaDashboard from '@/pages/setores/InfraestruturaDashboard';
import ProdutosDashboard from '@/pages/setores/ProdutosDashboard';
import HelpdeskDashboard from '@/pages/setores/HelpdeskDashboard';
import Dashboard from '@/pages/Dashboard';

const sectorComponents: Record<string, React.ComponentType> = {
  tickets_os: Dashboard,
  qualidade: QualidadeDashboard,
  comercial: ComercialDashboard,
  'customer-service': CustomerServiceDashboard,
  fabrica: FabricaDashboard,
  infraestrutura: InfraestruturaDashboard,
  produtos: ProdutosDashboard,
  helpdesk: HelpdeskDashboard,
};

interface KioskOverlayProps {
  activeSectors: SectorInfo[];
  currentIndex: number;
  rotateEnabled: boolean;
  onExit: () => void;
}

export default function KioskOverlay({ activeSectors, currentIndex, rotateEnabled, onExit }: KioskOverlayProps) {
  const currentSector = activeSectors[currentIndex % activeSectors.length];
  const SectorComponent = sectorComponents[currentSector?.slug];
  const prevThemeRef = useRef<string | null>(null);

  // Force dark theme in kiosk mode
  useEffect(() => {
    const root = document.documentElement;
    prevThemeRef.current = root.classList.contains('dark') ? 'dark' : 'light';
    root.classList.remove('light');
    root.classList.add('dark');

    return () => {
      root.classList.remove('dark');
      if (prevThemeRef.current) {
        root.classList.add(prevThemeRef.current);
      }
    };
  }, []);

  // Auto-refresh data periodically (every 2 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      // Dispatch a custom event that React Query hooks can listen to, or just refocus to trigger refetch
      window.dispatchEvent(new Event('focus'));
    }, 120_000);
    return () => clearInterval(interval);
  }, []);

  if (!currentSector) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Nenhuma área selecionada</p>
        <Button variant="outline" size="sm" onClick={onExit} className="ml-4">
          Sair
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-background overflow-auto">
      {/* Top bar */}
      <div className="fixed top-4 right-4 z-[110] flex items-center gap-2">
        {rotateEnabled && activeSectors.length > 1 && (
          <Badge variant="secondary" className="font-mono text-xs bg-card/80 backdrop-blur-sm">
            {currentSector.name} • {(currentIndex % activeSectors.length) + 1}/{activeSectors.length}
          </Badge>
        )}
        <Button variant="outline" size="sm" onClick={onExit} className="bg-card/80 backdrop-blur-sm shadow-lg">
          <Minimize2 className="h-4 w-4 mr-1" /> Sair
        </Button>
      </div>

      {/* Dashboard content */}
      <div className="p-6">
        {SectorComponent ? <SectorComponent /> : <p className="text-muted-foreground text-center mt-20">Dashboard "{currentSector.name}" não encontrado</p>}
      </div>
    </div>
  );
}
