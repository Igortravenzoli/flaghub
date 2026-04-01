import { ReactNode, useState, lazy, Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Clock, LayoutDashboard, Upload, Settings, Lock, ShieldAlert } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { MetricMetadataProvider } from '@/contexts/MetricMetadataContext';
import { useHubAreas } from '@/hooks/useHubAreas';
import { useHubIsAdmin, useAccessRequests } from '@/hooks/useHubPermissions';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
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
  const isHubAdmin = useHubIsAdmin();
  const { isAdmin: isAuthAdmin, user } = useAuth();
  const isAdmin = isHubAdmin || isAuthAdmin;
  const { isOwner, isOperacional, getAreaRole, hasArea, areas, isLoading: isAreasLoading } = useHubAreas();
  const { requestAccess, requests } = useAccessRequests();

  const areaRole = areaKey ? getAreaRole(areaKey) : null;
  const hasMembership = !!areaRole;
  const isAreaOwner = areaKey ? isOwner(areaKey) : false;
  const hasAccess = isAreasLoading || isAdmin || (areaKey ? hasArea(areaKey) : true);

  // Check if user already has a pending request for this area
  const areaRecord = areas.find(a => a.key === areaKey);
  const hasPendingRequest = areaRecord && requests.some(
    r => r.area_id === areaRecord.id && r.user_id === user?.id && r.status === 'pending'
  );

  // Permission checks: always require area membership or admin — no frontend bypasses
  const canImport = areaKey ? (isAreaOwner || isOperacional(areaKey) || isAdmin) : isAdmin;
  const canSettings = areaKey ? (isAreaOwner || hasMembership || isAdmin) : isAdmin;
  const canViewExtraTabs = isAreasLoading || hasMembership || isAdmin;
  const showImports = Boolean(templateKey) && (areaKey === 'customer-service' || areaKey === 'comercial' || areaKey === 'tickets_os') && canImport;

  const handleRequestAccess = async () => {
    if (!areaRecord) return;
    try {
      await requestAccess.mutateAsync({ areaId: areaRecord.id });
      toast.success('Solicitação de acesso enviada!', {
        description: 'Um administrador será notificado para aprovar seu acesso.',
      });
    } catch (err: any) {
      if (err?.message?.includes('duplicate')) {
        toast.info('Solicitação já enviada', { description: 'Aguarde a aprovação do administrador.' });
      } else {
        toast.error('Erro ao solicitar acesso', { description: err?.message });
      }
    }
  };

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

  // Access denied view
  if (!isAreasLoading && !hasAccess) {
    return (
      <MetricMetadataProvider areaKey={areaKey}>
        <div className="p-6 space-y-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
            </div>
          </div>

          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-4 rounded-full bg-muted mb-4">
              <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">Acesso Restrito</h2>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Você não possui permissão para acessar o setor <strong>{title}</strong>.
              Solicite acesso ao administrador para visualizar os dados deste setor.
            </p>
            {hasPendingRequest ? (
              <Badge variant="secondary" className="gap-1.5 px-4 py-2 text-sm">
                <Clock className="h-4 w-4" />
                Solicitação pendente de aprovação
              </Badge>
            ) : (
              <Button onClick={handleRequestAccess} className="gap-2" disabled={requestAccess.isPending}>
                <Lock className="h-4 w-4" />
                Solicitar Acesso
              </Button>
            )}
          </div>
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
          {canViewExtraTabs && extraTabs?.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="gap-1">
              {tab.icon}
              {tab.label}
            </TabsTrigger>
          ))}
          {showHelpTab && (
            <TabsTrigger value="help-kpis" className="gap-1">
              <CircleHelp className="h-3.5 w-3.5" />
              Ajuda
            </TabsTrigger>
          )}
          {showImports && (
            <TabsTrigger value="imports" className="gap-1">
              <Upload className="h-3.5 w-3.5" />
              Importações
            </TabsTrigger>
          )}
          {canSettings && (
            <TabsTrigger value="settings" className="gap-1">
              <Settings className="h-3.5 w-3.5" />
              Configurações
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="dashboard" className="mt-4 space-y-4">
          {children}
        </TabsContent>

        {canViewExtraTabs && extraTabs?.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-4">
            {tab.content}
          </TabsContent>
        ))}

        {showHelpTab && (
          <TabsContent value="help-kpis" className="mt-4">
            <KpiHelpTab />
          </TabsContent>
        )}

        {showImports && (
          <TabsContent value="imports" className="mt-4" forceMount={undefined}>
            <Suspense fallback={<div className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-32 w-full" /></div>}>
              <SectorImportArea sectorName={title} templateKey={templateKey} areaKey={areaKey} />
            </Suspense>
          </TabsContent>
        )}

        {canSettings && (
          <TabsContent value="settings" className="mt-4" forceMount={undefined}>
            <Suspense fallback={<div className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-32 w-full" /></div>}>
              <div className="space-y-4">
                <SectorSettings sectorName={title} sectorKey={areaKey} syncFunctions={syncFunctions} />
                {integrations && (
                  <SectorIntegrations integrations={integrations} sectorName={title} />
                )}
              </div>
            </Suspense>
          </TabsContent>
        )}
        </Tabs>
      </div>
    </MetricMetadataProvider>
  );
}
