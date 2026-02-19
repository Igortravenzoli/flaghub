import { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock } from 'lucide-react';

interface SectorLayoutProps {
  title: string;
  subtitle?: string;
  lastUpdate?: string;
  children: ReactNode;
}

export function SectorLayout({ title, subtitle, lastUpdate, children }: SectorLayoutProps) {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {lastUpdate && (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            {lastUpdate}
          </Badge>
        )}
      </div>
      {children}
    </div>
  );
}
