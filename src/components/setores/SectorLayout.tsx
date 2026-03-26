import { ReactNode, useState, lazy, Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Clock, LayoutDashboard, Upload, Settings, Lock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { MetricMetadataProvider } from '@/contexts/MetricMetadataContext';
import { useHubAreas } from '@/hooks/useHubAreas';
import { useHubIsAdmin } from '@/hooks/useHubPermissions';
import type { Integration } from './SectorIntegrations';

// Lazy-loaded heavy tab contents to avoid loading when tab is not active
const SectorImportArea = lazy(() => import('./SectorImportArea').then(m => ({ default: m.SectorImportArea })));
const SectorSettings = lazy(() => import('./SectorSettings').then(m => ({ default: m.SectorSettings })));
const SectorIntegrations = lazy(() => import('./SectorIntegrations').then(m => ({ default: m.SectorIntegrations })));

interface SyncFunction {
  name: string;
  label: string;
  payload?: Record<string, unknown>;
}

interface SectorLayoutProps {
  title: string;
  subtitle?: string;
  lastUpdate?: string;
  children: ReactNode;
  integrations?: Integration[];
  templateKey?: string;
  areaKey?: string;
  syncFunctions?: SyncFunction[];
  extraTabs?: { id: string; label: string; icon: ReactNode; content: ReactNode }[];
  /** When true, only shows dashboard content (no tabs for settings/imports/integrations) */
  kioskMode?: boolean;
}

export function SectorLayout({ title, subtitle, lastUpdate, children, integrations, templateKey, areaKey, syncFunctions, extraTabs, kioskMode }: SectorLayoutProps) {
  // Detect kiosk mode from parent or prop
  const isKiosk = kioskMode ?? document.querySelector('[data-kiosk="true"]') !== null;
  const isAdmin = useHubIsAdmin();
  const { isOwner, isOperacional, getAreaRole } = useHubAreas();

  const areaRole = areaKey ? getAreaRole(areaKey) : null;
  const canImport = areaKey ? (isOwner(areaKey) || isAdmin) : isAdmin;
  const canSettings = areaKey ? (isOperacional(areaKey) || isAdmin) : isAdmin;
  const showImports = (areaKey === 'customer-service' || areaKey === 'comercial') && canImport;

  if (isKiosk) {
    return (
      <MetricMetadataProvider areaKey={areaKey}>
        <div className="space-y-4 animate-fade-in">
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
      </MetricMetadataProvider>
    );
  }

  return (
    <MetricMetadataProvider areaKey={areaKey}>
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
          {showImports && (
            <TabsTrigger value="imports" className="gap-1">
              <Upload className="h-3.5 w-3.5" />
              Importações
            </TabsTrigger>
          )}
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

        {showImports && (
          <TabsContent value="imports" className="mt-4" forceMount={undefined}>
            <Suspense fallback={<div className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-32 w-full" /></div>}>
              <SectorImportArea sectorName={title} templateKey={templateKey} areaKey={areaKey} />
            </Suspense>
          </TabsContent>
        )}

        <TabsContent value="settings" className="mt-4" forceMount={undefined}>
          <Suspense fallback={<div className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-32 w-full" /></div>}>
            <div className="space-y-4">
              <SectorSettings sectorName={title} syncFunctions={syncFunctions} />
              {integrations && (
                <SectorIntegrations integrations={integrations} sectorName={title} />
              )}
            </div>
          </Suspense>
        </TabsContent>
        </Tabs>
      </div>
    </MetricMetadataProvider>
  );
}
