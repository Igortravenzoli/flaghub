import { ReactNode, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Clock, LayoutDashboard, Upload, Settings, Plug } from 'lucide-react';
import { SectorImportArea } from './SectorImportArea';
import { SectorSettings } from './SectorSettings';
import { SectorIntegrations, Integration } from './SectorIntegrations';

interface SectorLayoutProps {
  title: string;
  subtitle?: string;
  lastUpdate?: string;
  children: ReactNode;
  integrations?: Integration[];
  /** Additional tab content */
  extraTabs?: { id: string; label: string; icon: ReactNode; content: ReactNode }[];
}

export function SectorLayout({ title, subtitle, lastUpdate, children, integrations, extraTabs }: SectorLayoutProps) {
  return (
    <div className="p-6 space-y-6 animate-fade-in">
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

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1">
            <LayoutDashboard className="h-3.5 w-3.5" />
            Dashboard
          </TabsTrigger>
          {extraTabs?.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="gap-1">
              {tab.icon}
              {tab.label}
            </TabsTrigger>
          ))}
          {integrations && (
            <TabsTrigger value="integrations" className="gap-1">
              <Plug className="h-3.5 w-3.5" />
              Integrações
            </TabsTrigger>
          )}
          <TabsTrigger value="imports" className="gap-1">
            <Upload className="h-3.5 w-3.5" />
            Importações
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1">
            <Settings className="h-3.5 w-3.5" />
            Configurações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4 space-y-4">
          {children}
        </TabsContent>

        {extraTabs?.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-4">
            {tab.content}
          </TabsContent>
        ))}

        {integrations && (
          <TabsContent value="integrations" className="mt-4">
            <SectorIntegrations integrations={integrations} sectorName={title} />
          </TabsContent>
        )}

        <TabsContent value="imports" className="mt-4">
          <SectorImportArea sectorName={title} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SectorSettings sectorName={title} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
