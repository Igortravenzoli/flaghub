import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Minimize2, Clock } from 'lucide-react';
import type { SectorInfo } from '@/data/mockSectorData';
import KioskSectorView from './KioskSectorView';

// Fallback: full dashboards for sectors without curated kiosk views
import QualidadeDashboard from '@/pages/setores/QualidadeDashboard';
import ComercialDashboard from '@/pages/setores/ComercialDashboard';
import CustomerServiceDashboard from '@/pages/setores/CustomerServiceDashboard';
import FabricaDashboard from '@/pages/setores/FabricaDashboard';
import InfraestruturaDashboard from '@/pages/setores/InfraestruturaDashboard';
import ProdutosDashboard from '@/pages/setores/ProdutosDashboard';
import HelpdeskDashboard from '@/pages/setores/HelpdeskDashboard';
import Dashboard from '@/pages/Dashboard';

/** Sectors that have curated kiosk views */
const CURATED_SECTORS = new Set(['helpdesk', 'fabrica', 'comercial', 'customer-service', 'qualidade', 'infraestrutura']);

const fallbackComponents: Record<string, React.ComponentType> = {
  tickets_os: Dashboard,
  produtos: ProdutosDashboard,
};

/** Refresh interval: 3 minutes (not aggressive) */
const REFRESH_INTERVAL_MS = 180_000;

interface KioskOverlayProps {
  activeSectors: SectorInfo[];
  currentIndex: number;
  rotateEnabled: boolean;
  onExit: () => void;
}

export default function KioskOverlay({ activeSectors, currentIndex, rotateEnabled, onExit }: KioskOverlayProps) {
  const currentSector = activeSectors[currentIndex % activeSectors.length];
  const prevThemeRef = useRef<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());

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

  // Smart auto-refresh: trigger refetch every 3 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      window.dispatchEvent(new Event('focus'));
      setLastRefresh(new Date());
    }, REFRESH_INTERVAL_MS);
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

  const isCurated = CURATED_SECTORS.has(currentSector.slug);
  const FallbackComponent = fallbackComponents[currentSector.slug];

  return (
    <div className="fixed inset-0 z-[100] bg-background overflow-auto" data-kiosk="true">
      {/* Top bar — minimal controls + last update */}
      <div className="fixed top-4 right-4 z-[110] flex items-center gap-2 opacity-30 hover:opacity-100 transition-opacity duration-300">
        {/* Discrete last-update indicator */}
        <Badge variant="outline" className="font-mono text-[10px] bg-card/80 backdrop-blur-sm gap-1">
          <Clock className="h-3 w-3" />
          {lastRefresh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </Badge>

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
      <div className="p-6 pt-8">
        {isCurated ? (
          <KioskSectorView sectorSlug={currentSector.slug} sectorName={currentSector.name} />
        ) : FallbackComponent ? (
          <FallbackComponent />
        ) : (
          <p className="text-muted-foreground text-center mt-20">Dashboard "{currentSector.name}" não encontrado</p>
        )}
      </div>
    </div>
  );
}
