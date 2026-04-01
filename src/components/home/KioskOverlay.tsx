import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Minimize2, Clock, Monitor } from 'lucide-react';
import type { SectorInfo } from '@/data/mockSectorData';
import KioskSectorView from './KioskSectorView';
import Dashboard from '@/pages/Dashboard';
import ProdutosDashboard from '@/pages/setores/ProdutosDashboard';

/** Sectors that have curated kiosk views */
const CURATED_SECTORS = new Set(['helpdesk', 'fabrica', 'comercial', 'customer-service', 'qualidade', 'infraestrutura']);

const fallbackComponents: Record<string, React.ComponentType> = {
  tickets_os: Dashboard,
  produtos: ProdutosDashboard,
};

/** Refresh interval: 3 minutes */
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
  const [now, setNow] = useState(new Date());

  // Force dark theme in kiosk mode
  useEffect(() => {
    const root = document.documentElement;
    prevThemeRef.current = root.classList.contains('dark') ? 'dark' : 'light';
    root.classList.remove('light');
    root.classList.add('dark');
    return () => {
      root.classList.remove('dark');
      if (prevThemeRef.current) root.classList.add(prevThemeRef.current);
    };
  }, []);

  // Clock tick
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(iv);
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
      <div className="fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">Nenhuma área selecionada</p>
        <Button variant="outline" size="sm" onClick={onExit} className="ml-4">
          Sair
        </Button>
      </div>
    );
  }

  const isCurated = CURATED_SECTORS.has(currentSector.slug);
  const FallbackComponent = fallbackComponents[currentSector.slug];

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 overflow-auto" data-kiosk="true">
      {/* ── Top Bar: Sector name + clock + rotation + exit ── */}
      <div className="fixed top-0 left-0 right-0 z-[110] flex items-center justify-between px-6 py-3 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/50">
        {/* Left: sector name + indicator */}
        <div className="flex items-center gap-3">
          <Monitor className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-300 uppercase tracking-wider">{currentSector.name}</span>
          {rotateEnabled && activeSectors.length > 1 && (
            <span className="text-[10px] font-mono text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
              {(currentIndex % activeSectors.length) + 1}/{activeSectors.length}
            </span>
          )}
        </div>

        {/* Right: clock + exit */}
        <div className="flex items-center gap-3 opacity-50 hover:opacity-100 transition-opacity">
          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <Button variant="ghost" size="sm" onClick={onExit} className="text-slate-400 hover:text-white h-7 px-2">
            <Minimize2 className="h-3.5 w-3.5 mr-1" /> Sair
          </Button>
        </div>
      </div>

      {/* ── Dashboard content ── */}
      <div className="px-6 pt-16 pb-4 h-[calc(100vh-0px)] flex flex-col">
        <div className="flex-1 min-h-0">
          {isCurated ? (
            <KioskSectorView sectorSlug={currentSector.slug} sectorName={currentSector.name} />
          ) : FallbackComponent ? (
            <FallbackComponent />
          ) : (
            <p className="text-slate-500 text-center mt-20">Dashboard "{currentSector.name}" não encontrado</p>
          )}
        </div>
      </div>
    </div>
  );
}
