import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Package, TrendingUp, LayoutGrid, Factory, ShieldCheck, Headphones, Wifi, WifiOff, Server } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import KioskOverlay from '@/components/home/KioskOverlay';
import KioskConfigDialog from '@/components/home/KioskConfigDialog';
import { useComercialKpis } from '@/hooks/useComercialKpis';
import { useHelpdeskKpis } from '@/hooks/useHelpdeskKpis';
import { useFabricaKpis } from '@/hooks/useFabricaKpis';
import { useQualidadeKpis } from '@/hooks/useQualidadeKpis';
import { useCustomerServiceKpis } from '@/hooks/useCustomerServiceKpis';
import { useInfraestruturaKpis } from '@/hooks/useInfraestruturaKpis';
import { useSprintFilter } from '@/hooks/useSprintFilter';
import { getCurrentOfficialSprintCode, extractSprintCodeFromPath } from '@/lib/sprintCalendar';
import { sectors as mockSectors, SectorInfo } from '@/data/mockSectorData';
import { useAuth } from '@/hooks/useAuth';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Package, TrendingUp, LayoutGrid, Factory, ShieldCheck, Headphones, Server,
};

interface SectorCardData {
  slug: string;
  name: string;
  icon: string;
  kpiLabel: string;
  kpiValue: string | number | null;
  kpiSource: string;
  isLoading: boolean;
  path: string;
  hasConnection?: boolean;
  connectionStatus?: 'up' | 'down';
}

export default function Home() {
  const navigate = useNavigate();
  const { isMonitor } = useAuth();
  const [kioskActive, setKioskActive] = useState(false);
  const [kioskCurrentIndex, setKioskCurrentIndex] = useState(0);
  const [kioskRotate, setKioskRotate] = useState(false);
  const [kioskInterval, setKioskInterval] = useState(30);
  const [kioskSelectedSlugs, setKioskSelectedSlugs] = useState<string[]>([]);
  const [monitorAutoStarted, setMonitorAutoStarted] = useState(false);

  // Real data hooks
  const comercial = useComercialKpis();
  const helpdesk = useHelpdeskKpis();

  // Fábrica: use official current sprint
  const fabricaAll = useFabricaKpis(undefined, undefined, 'all', {
    includeTimeLogs: false,
    includeWorkItemMeta: false,
  });
  const fabricaOfficialSprint = (() => {
    const officialCode = getCurrentOfficialSprintCode();
    const found = fabricaAll.sortedSprints.find(sp =>
      extractSprintCodeFromPath(sp) === officialCode
    );
    return found || fabricaAll.currentSprint || 'all';
  })();
  const fabrica = useFabricaKpis(undefined, undefined, fabricaOfficialSprint, {
    includeTimeLogs: false,
    includeWorkItemMeta: false,
  });

  const qualidadeBase = useQualidadeKpis();
  const { currentSprint: qualidadeSprint } = useSprintFilter(qualidadeBase.allItems);
  const qualidade = useQualidadeKpis(undefined, undefined, qualidadeSprint || 'all');

  const cs = useCustomerServiceKpis();
  const infraBase = useInfraestruturaKpis();
  const { currentSprint: infraSprint } = useSprintFilter(infraBase.allItems);
  const infra = useInfraestruturaKpis(undefined, undefined, infraSprint || 'all');

  // Build sector cards with real data
  const sectorCards: SectorCardData[] = [
    {
      slug: 'comercial', name: 'Comercial', icon: 'TrendingUp',
      kpiLabel: 'Clientes Ativos / Bloqueados', kpiValue: `${comercial.stats.ativos || 0} / ${comercial.stats.bloqueados || 0}`,
      kpiSource: 'useComercialKpis.stats',
      isLoading: comercial.isLoading, path: '/setor/comercial',
      hasConnection: true, connectionStatus: comercial.isError ? 'down' : 'up',
    },
    {
      slug: 'customer-service', name: 'Customer Service', icon: 'LayoutGrid',
      kpiLabel: 'Implantações (Total / Em andamento)', kpiValue: `${cs.implTotal || 0} / ${cs.implAndamento || 0}`,
      kpiSource: 'useCustomerServiceKpis.implTotal/implAndamento',
      isLoading: cs.isLoading, path: '/setor/customer-service',
      hasConnection: true, connectionStatus: cs.isError ? 'down' : 'up',
    },
    {
      slug: 'fabrica', name: 'Fábrica', icon: 'Factory',
      kpiLabel: 'Tasks (A Fazer / Em progresso)', kpiValue: `${fabrica.toDo || 0} / ${fabrica.inProgress || 0}`,
      kpiSource: 'useFabricaKpis.toDo/inProgress',
      isLoading: fabrica.isLoading, path: '/setor/fabrica',
      hasConnection: true, connectionStatus: fabrica.isError ? 'down' : 'up',
    },
    {
      slug: 'infraestrutura', name: 'Infraestrutura', icon: 'Server',
      kpiLabel: 'Atividades (Total / Em andamento)', kpiValue: `${infra.total || 0} / ${infra.emAndamento || 0}`,
      kpiSource: 'useInfraestruturaKpis.total/emAndamento',
      isLoading: infra.isLoading, path: '/setor/infraestrutura',
      hasConnection: true, connectionStatus: infra.isError ? 'down' : 'up',
    },
    {
      slug: 'qualidade', name: 'Qualidade', icon: 'ShieldCheck',
      kpiLabel: 'Tasks (Fila atual / Em teste)', kpiValue: `${qualidade.filaAtual || 0} / ${qualidade.emTeste || 0}`,
      kpiSource: 'useQualidadeKpis.filaAtual/emTeste',
      isLoading: qualidade.isLoading, path: '/setor/qualidade',
      hasConnection: true, connectionStatus: qualidade.isError ? 'down' : 'up',
    },
    {
      slug: 'helpdesk', name: 'Helpdesk', icon: 'Headphones',
      kpiLabel: 'Atendimentos do Dia', kpiValue: helpdesk.totalRegistros || null,
      kpiSource: 'useHelpdeskKpis.totalRegistros',
      isLoading: helpdesk.isLoading, path: '/setor/helpdesk',
      hasConnection: true, connectionStatus: helpdesk.isError ? 'down' : 'up',
    },
  ];

  const activeSectors = mockSectors.filter((s) => kioskSelectedSlugs.includes(s.slug));

  // Auto-start Kiosk for monitor user
  useEffect(() => {
    if (isMonitor && !monitorAutoStarted && !kioskActive) {
      const allSlugs = mockSectors.map(s => s.slug);
      setKioskSelectedSlugs(allSlugs);
      setKioskRotate(true);
      setKioskInterval(30);
      setKioskCurrentIndex(0);
      setKioskActive(true);
      setMonitorAutoStarted(true);
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, [isMonitor, monitorAutoStarted, kioskActive]);

  const exitKiosk = useCallback(() => {
    setKioskActive(false);
    document.exitFullscreen?.().catch(() => {});
  }, []);

  // Rotation timer
  useEffect(() => {
    if (!kioskActive || !kioskRotate || activeSectors.length <= 1) return;
    const interval = setInterval(() => {
      setKioskCurrentIndex((prev) => (prev + 1) % activeSectors.length);
    }, kioskInterval * 1000);
    return () => clearInterval(interval);
  }, [kioskActive, kioskRotate, kioskInterval, activeSectors.length]);

  // ESC to exit
  useEffect(() => {
    if (!kioskActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitKiosk();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [kioskActive, exitKiosk]);

  const startKiosk = (config: { selectedSlugs: string[]; rotateEnabled: boolean; intervalSec: number }) => {
    setKioskSelectedSlugs(config.selectedSlugs);
    setKioskRotate(config.rotateEnabled);
    setKioskInterval(config.intervalSec);
    setKioskCurrentIndex(0);
    setKioskActive(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  if (kioskActive && activeSectors.length > 0) {
    return (
      <KioskOverlay
        activeSectors={activeSectors}
        currentIndex={kioskCurrentIndex}
        rotateEnabled={kioskRotate}
        onExit={exitKiosk}
      />
    );
  }

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary">
          <Monitor className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">FLAG Hub</h1>
          <p className="text-sm text-muted-foreground">Central de KPIs — Selecione uma área para acessar o dashboard</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sectorCards.map((sector) => {
          const Icon = iconMap[sector.icon] || Headphones;
          return (
            <Card
              key={sector.slug}
              onClick={() => navigate(sector.path)}
              className="group cursor-pointer p-6 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1 border-border bg-card"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-xl bg-primary/10">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                {sector.hasConnection && (
                  <div className="flex items-center gap-1 text-xs">
                    {sector.connectionStatus === 'up' ? (
                      <Badge className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]">UP</Badge>
                    ) : (
                      <Badge className="bg-[hsl(var(--critical))] text-[hsl(var(--critical-foreground))]">DOWN</Badge>
                    )}
                  </div>
                )}
              </div>

              <h3 className="text-lg font-semibold text-foreground mb-1">{sector.name}</h3>

              <div className="mt-3 space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground">{sector.kpiLabel}</p>
                  {sector.isLoading ? (
                    <Skeleton className="h-8 w-20 mt-1" />
                  ) : sector.kpiValue !== null ? (
                    <p className="text-2xl font-bold text-foreground">{sector.kpiValue}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1 italic">Sem dados</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/80 mt-1">Origem: {sector.kpiSource}</p>
                </div>
              </div>
            </Card>
          );
        })}

        {/* Kiosk Mode Card */}
        <KioskConfigDialog
          sectors={sectorCards.map((s) => ({ slug: s.slug, name: s.name }))}
          onStart={startKiosk}
        />
      </div>
    </div>
  );
}
