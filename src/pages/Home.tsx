import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Tv, Play, Shuffle, Package, TrendingUp, LayoutGrid, Factory, ShieldCheck, Headphones, Clock, Wifi, WifiOff, Server } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import KioskOverlay from '@/components/home/KioskOverlay';
import { useComercialKpis } from '@/hooks/useComercialKpis';
import { useHelpdeskKpis } from '@/hooks/useHelpdeskKpis';
import { useFabricaKpis } from '@/hooks/useFabricaKpis';
import { useQualidadeKpis } from '@/hooks/useQualidadeKpis';
import { useCustomerServiceKpis } from '@/hooks/useCustomerServiceKpis';
import { useInfraestruturaKpis } from '@/hooks/useInfraestruturaKpis';
import { sectors as mockSectors, SectorInfo } from '@/data/mockSectorData';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Package, TrendingUp, LayoutGrid, Factory, ShieldCheck, Headphones,
};

interface SectorCardData {
  slug: string;
  name: string;
  icon: string;
  kpiLabel: string;
  kpiValue: string | number | null;
  isLoading: boolean;
  path: string;
  hasConnection?: boolean;
  connectionStatus?: 'up' | 'down';
}

export default function Home() {
  const navigate = useNavigate();
  const [kioskOpen, setKioskOpen] = useState(false);
  const [kioskRandom, setKioskRandom] = useState(false);
  const [kioskInterval, setKioskInterval] = useState('30');
  const [kioskActive, setKioskActive] = useState(false);
  const [kioskCurrentIndex, setKioskCurrentIndex] = useState(0);

  // Real data hooks
  const comercial = useComercialKpis();
  const helpdesk = useHelpdeskKpis();
  const fabrica = useFabricaKpis();
  const qualidade = useQualidadeKpis();
  const cs = useCustomerServiceKpis();
  const infra = useInfraestruturaKpis();

  // Build sector cards with real data
  const sectorCards: SectorCardData[] = [
    {
      slug: 'produtos', name: 'Produtos', icon: 'Package',
      kpiLabel: 'Dashboard', kpiValue: null, isLoading: false,
      path: '/setor/produtos',
    },
    {
      slug: 'comercial', name: 'Comercial', icon: 'TrendingUp',
      kpiLabel: 'Clientes Ativos', kpiValue: comercial.totalClientes || null,
      isLoading: comercial.isLoading, path: '/setor/comercial',
      hasConnection: true, connectionStatus: comercial.isError ? 'down' : 'up',
    },
    {
      slug: 'customer-service', name: 'Customer Service', icon: 'LayoutGrid',
      kpiLabel: 'Work Items', kpiValue: cs.items?.length || null,
      isLoading: cs.isLoading, path: '/setor/customer-service',
      hasConnection: true, connectionStatus: cs.isError ? 'down' : 'up',
    },
    {
      slug: 'fabrica', name: 'Fábrica', icon: 'Factory',
      kpiLabel: 'Work Items', kpiValue: fabrica.items?.length || null,
      isLoading: fabrica.isLoading, path: '/setor/fabrica',
      hasConnection: true, connectionStatus: fabrica.isError ? 'down' : 'up',
    },
    {
      slug: 'infraestrutura', name: 'Infraestrutura', icon: 'Server',
      kpiLabel: 'Work Items', kpiValue: infra.total || null,
      isLoading: infra.isLoading, path: '/setor/infraestrutura',
      hasConnection: true, connectionStatus: infra.isError ? 'down' : 'up',
    },
    {
      slug: 'qualidade', name: 'Qualidade', icon: 'ShieldCheck',
      kpiLabel: 'Itens na Fila', kpiValue: qualidade.filaQA || null,
      isLoading: qualidade.isLoading, path: '/setor/qualidade',
      hasConnection: true, connectionStatus: qualidade.isError ? 'down' : 'up',
    },
    {
      slug: 'helpdesk', name: 'Helpdesk', icon: 'Headphones',
      kpiLabel: 'Total Registros', kpiValue: helpdesk.totalRegistros || null,
      isLoading: helpdesk.isLoading, path: '/setor/helpdesk',
      hasConnection: true, connectionStatus: helpdesk.isError ? 'down' : 'up',
    },
  ];

  const [selectedSectors, setSelectedSectors] = useState<string[]>(sectorCards.map(s => s.slug));
  const activeSectors = mockSectors.filter(s => selectedSectors.includes(s.slug));

  const exitKiosk = useCallback(() => {
    setKioskActive(false);
    document.exitFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    if (!kioskActive || !kioskRandom || activeSectors.length <= 1) return;
    const interval = setInterval(() => {
      setKioskCurrentIndex(prev => (prev + 1) % activeSectors.length);
    }, parseInt(kioskInterval) * 1000);
    return () => clearInterval(interval);
  }, [kioskActive, kioskRandom, kioskInterval, activeSectors.length]);

  useEffect(() => {
    if (!kioskActive) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') exitKiosk(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [kioskActive, exitKiosk]);

  const startKiosk = () => {
    setKioskOpen(false);
    setKioskCurrentIndex(0);
    setKioskActive(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const toggleSector = (slug: string) => {
    setSelectedSectors(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    );
  };

  if (kioskActive && activeSectors.length > 0) {
    return (
      <KioskOverlay
        activeSectors={activeSectors}
        currentIndex={kioskCurrentIndex}
        kioskRandom={kioskRandom}
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
          <h1 className="text-2xl font-bold text-foreground">Hub de Operações</h1>
          <p className="text-sm text-muted-foreground">Selecione uma área para acessar o dashboard</p>
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
                </div>
              </div>
            </Card>
          );
        })}

        {/* Kiosk Mode Card */}
        <Dialog open={kioskOpen} onOpenChange={setKioskOpen}>
          <DialogTrigger asChild>
            <Card className="p-5 cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 border-2 border-dashed border-primary/30 hover:border-primary/60 flex flex-col items-center justify-center text-center min-h-[160px] group">
              <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors mb-3">
                <Tv className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-bold text-foreground">Modo Kiosk / TV</h3>
              <p className="text-xs text-muted-foreground mt-1">Exibir dashboards em tela cheia</p>
            </Card>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Tv className="h-5 w-5 text-primary" />
                Configurar Modo Kiosk
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Modo Rotativo</Label>
                  <p className="text-xs text-muted-foreground">Alterna entre áreas selecionadas</p>
                </div>
                <Switch checked={kioskRandom} onCheckedChange={setKioskRandom} />
              </div>

              {kioskRandom && (
                <div className="flex items-center gap-3">
                  <Label className="shrink-0 text-sm">Intervalo</Label>
                  <Select value={kioskInterval} onValueChange={setKioskInterval}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 segundos</SelectItem>
                      <SelectItem value="30">30 segundos</SelectItem>
                      <SelectItem value="60">1 minuto</SelectItem>
                      <SelectItem value="120">2 minutos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Áreas a exibir</Label>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedSectors(sectorCards.map(s => s.slug))}>Todos</Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedSectors([])}>Nenhum</Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto">
                  {sectorCards.map(s => (
                    <label key={s.slug} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                      <Checkbox
                        checked={selectedSectors.includes(s.slug)}
                        onCheckedChange={() => toggleSector(s.slug)}
                      />
                      <span className="text-sm text-foreground">{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <Button
                className="w-full gap-2"
                disabled={selectedSectors.length === 0}
                onClick={startKiosk}
              >
                {kioskRandom ? <Shuffle className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {kioskRandom ? 'Iniciar Rotação' : 'Abrir Dashboard'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
