import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Minimize2, Maximize2, Clock, Monitor, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import KioskSectorView from './KioskSectorView';
import Dashboard from '@/pages/Dashboard';

/** Sectors that have curated kiosk views */
const CURATED_SECTORS = new Set(['helpdesk', 'fabrica', 'comercial', 'customer-service', 'qualidade', 'infraestrutura']);

const fallbackComponents: Record<string, React.ComponentType> = {
  tickets_os: Dashboard,
};

/** Refresh interval: 3 minutes */
const REFRESH_INTERVAL_MS = 180_000;

interface KioskSector {
  slug: string;
  name: string;
}

interface KioskOverlayProps {
  activeSectors: KioskSector[];
  currentIndex: number;
  rotateEnabled: boolean;
  paused: boolean;
  onTogglePause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onGoTo: (index: number) => void;
  onExit: () => void;
}

/** Nome curto para as pílulas de navegação (primeira palavra do nome do setor) */
const shortName = (name: string) => name.split(' ')[0];

export default function KioskOverlay({
  activeSectors,
  currentIndex,
  rotateEnabled,
  paused,
  onTogglePause,
  onPrev,
  onNext,
  onGoTo,
  onExit,
}: KioskOverlayProps) {
  const safeIndex = activeSectors.length > 0 ? currentIndex % activeSectors.length : 0;
  const currentSector = activeSectors[safeIndex];
  const hasMultipleSectors = activeSectors.length > 1;
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

  // Teclado: setas navegam, espaço pausa/retoma (ESC continua tratado pelo Home)
  useEffect(() => {
    if (!hasMultipleSectors) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Não interceptar quando o foco está em elemento interativo (evita toggle duplo no espaço)
      if (target && (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onNext();
      } else if ((e.key === ' ' || e.code === 'Space') && rotateEnabled) {
        e.preventDefault();
        onTogglePause();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hasMultipleSectors, rotateEnabled, onPrev, onNext, onTogglePause]);

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
      {/* ── Top Bar: Sector name + navigation + clock + exit ── */}
      <div className="fixed top-0 left-0 right-0 z-[110] flex items-center justify-between px-6 py-3 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/50">
        {/* Left: sector name + indicator */}
        <div className="flex items-center gap-3">
          <Monitor className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-300 uppercase tracking-wider">{currentSector.name}</span>
          {hasMultipleSectors && (
            <span className="text-[10px] font-mono text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
              {safeIndex + 1}/{activeSectors.length}
            </span>
          )}
        </div>

        {/* Center: navigation controls (hidden with a single sector) */}
        {hasMultipleSectors && (
          <div className="flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              onClick={onPrev}
              aria-label="Setor anterior"
              title="Setor anterior"
              className="text-slate-400 hover:text-white h-7 w-7 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {rotateEnabled && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onTogglePause}
                aria-label={paused ? 'Retomar rotação' : 'Pausar rotação'}
                title={paused ? 'Retomar rotação' : 'Pausar rotação'}
                className="text-slate-400 hover:text-white h-7 w-7 p-0"
              >
                {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onNext}
              aria-label="Próximo setor"
              title="Próximo setor"
              className="text-slate-400 hover:text-white h-7 w-7 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            {/* Pílulas de navegação direta */}
            <div className="hidden md:flex items-center gap-1 ml-2">
              {activeSectors.map((sector, i) => (
                <button
                  key={sector.slug}
                  type="button"
                  onClick={() => onGoTo(i)}
                  aria-label={`Ir para ${sector.name}`}
                  aria-current={i === safeIndex ? 'true' : undefined}
                  title={sector.name}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${
                    i === safeIndex
                      ? 'bg-slate-200 text-slate-900'
                      : 'bg-slate-800/70 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                  }`}
                >
                  {shortName(sector.name)}
                </button>
              ))}
            </div>

            {rotateEnabled && paused && (
              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded">
                Pausado
              </span>
            )}
          </div>
        )}

        {/* Right: clock + exit */}
        <div className="flex items-center gap-3 opacity-50 hover:opacity-100 transition-opacity">
          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
              else document.documentElement.requestFullscreen?.().catch(() => {});
            }}
            className="text-slate-400 hover:text-white h-7 px-2"
            title="Tela cheia"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
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
