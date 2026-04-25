import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, Database, Globe, Server, Clock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface Integration {
  name: string;
  type: 'api' | 'database' | 'service';
  status: 'up' | 'down';
  lastCheck: string;
  latency?: string;
  description?: string;
}

interface SectorIntegrationsProps {
  integrations: Integration[];
  sectorName: string;
}

const typeIcons = {
  api: Globe,
  database: Database,
  service: Server,
};

export function SectorIntegrations({ integrations, sectorName }: SectorIntegrationsProps) {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-foreground">Integrações — {sectorName}</h4>
        <Button variant="outline" size="sm" className="gap-1">
          <RefreshCw className="h-3 w-3" />
          Verificar Todas
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {integrations.map((integration) => {
          const Icon = typeIcons[integration.type];
          const isUp = integration.status === 'up';

          return (
            <Card
              key={integration.name}
              className={`p-4 transition-all duration-300 border-l-4 ${
                isUp
                  ? 'border-l-[hsl(var(--success))]'
                  : 'border-l-[hsl(var(--critical))] animate-pulse'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isUp ? 'bg-[hsl(var(--success))]/10' : 'bg-[hsl(var(--critical))]/10'}`}>
                    <Icon className={`h-4 w-4 ${isUp ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--critical))]'}`} />
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">{integration.name}</p>
                    {integration.description && (
                      <p className="text-xs text-muted-foreground">{integration.description}</p>
                    )}
                  </div>
                </div>
                <Badge
                  className={`gap-1 ${
                    isUp
                      ? 'bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]'
                      : 'bg-[hsl(var(--critical))] text-[hsl(var(--critical-foreground))]'
                  }`}
                >
                  {isUp ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                  {isUp ? 'UP' : 'DOWN'}
                </Badge>
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {integration.lastCheck}
                </div>
                {integration.latency && (
                  <Badge variant="outline" className="text-xs">{integration.latency}</Badge>
                )}
                <Badge variant="outline" className="text-xs capitalize">{integration.type}</Badge>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
