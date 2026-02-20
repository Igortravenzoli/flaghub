import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp, Mail, Headphones, Server, Code, ShieldCheck, HeadphonesIcon,
  LayoutGrid, Wifi, WifiOff, Clock,
} from 'lucide-react';
import type { SectorInfo } from '@/data/mockSectorData';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingUp, Mail, Headphones, Server, Code, ShieldCheck, HeadphonesIcon, LayoutGrid,
};

export function SectorCard({ sector }: { sector: SectorInfo }) {
  const navigate = useNavigate();
  const Icon = iconMap[sector.icon] || Headphones;

  const handleClick = () => {
    if (sector.slug === 'helpdesk') {
      navigate('/dashboard');
    } else {
      navigate(`/setor/${sector.slug}`);
    }
  };

  return (
    <Card
      onClick={handleClick}
      className="group cursor-pointer p-6 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1 border-border bg-card"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="p-3 rounded-xl bg-primary/10">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <Badge
          variant={sector.status === 'up' ? 'default' : sector.status === 'partial' ? 'secondary' : 'destructive'}
          className={
            sector.status === 'up'
              ? 'bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]'
              : sector.status === 'partial'
              ? 'bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]'
              : 'bg-[hsl(var(--critical))] text-[hsl(var(--critical-foreground))]'
          }
        >
          {sector.status === 'up' ? 'UP' : sector.status === 'partial' ? 'PARCIAL' : 'DOWN'}
        </Badge>
      </div>

      <h3 className="text-lg font-semibold text-foreground mb-1">{sector.name}</h3>

      <div className="mt-3 space-y-2">
        <div>
          <p className="text-xs text-muted-foreground">{sector.kpiLabel}</p>
          <p className="text-2xl font-bold text-foreground">{sector.kpiValue}</p>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {sector.lastUpdate}
          </div>
          {sector.hasConnection && (
            <div className="flex items-center gap-1 text-xs">
              {sector.connectionStatus === 'up' ? (
                <Wifi className="h-3 w-3 text-[hsl(var(--success))]" />
              ) : (
                <WifiOff className="h-3 w-3 text-[hsl(var(--critical))]" />
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
