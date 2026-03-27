import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { SectorAlerts } from './SectorAlerts';

interface SectorSettingsProps {
  sectorName: string;
  sectorKey?: string;
  syncFunctions?: { name: string; label: string; payload?: Record<string, unknown> }[];
}

export function SectorSettings({ sectorName, sectorKey, syncFunctions = [] }: SectorSettingsProps) {
  const [syncingFns, setSyncingFns] = useState<Set<string>>(new Set());
  const [syncResults, setSyncResults] = useState<Record<string, 'ok' | 'error'>>({});

  const handleSync = async (fnName: string, label: string, payload?: Record<string, unknown>) => {
    setSyncingFns(prev => new Set(prev).add(fnName));
    setSyncResults(prev => { const n = { ...prev }; delete n[fnName]; return n; });

    try {
      const { error } = await supabase.functions.invoke(fnName, { body: payload ?? {} });
      if (error) throw error;
      setSyncResults(prev => ({ ...prev, [fnName]: 'ok' }));
      toast.success(`${label} atualizado com sucesso`);
    } catch (err: any) {
      setSyncResults(prev => ({ ...prev, [fnName]: 'error' }));
      toast.error(`Erro ao atualizar ${label}`, { description: err?.message });
    } finally {
      setSyncingFns(prev => { const n = new Set(prev); n.delete(fnName); return n; });
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Immediate Sync */}
      {syncFunctions.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw className="h-4 w-4 text-primary" />
            <h4 className="font-semibold text-foreground">Atualização Imediata de KPIs</h4>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Solicite a atualização dos dados diretamente da fonte. O processo pode levar alguns segundos.
          </p>
          <div className="space-y-3">
            {syncFunctions.map((fn) => {
              const isSyncing = syncingFns.has(fn.name);
              const result = syncResults[fn.name];
              return (
                <div key={fn.name} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{fn.label}</p>
                    {isSyncing && (
                      <p className="text-xs text-primary animate-pulse mt-1">Atualizando — Aguarde...</p>
                    )}
                    {result === 'ok' && (
                      <p className="text-xs text-[hsl(var(--success))] flex items-center gap-1 mt-1">
                        <CheckCircle2 className="h-3 w-3" /> Atualizado com sucesso
                      </p>
                    )}
                    {result === 'error' && (
                      <p className="text-xs text-destructive mt-1">Falha na atualização</p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    disabled={isSyncing}
                    onClick={() => handleSync(fn.name, fn.label, fn.payload)}
                  >
                    {isSyncing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    {isSyncing ? 'Atualizando...' : 'Atualizar Agora'}
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Sector Alerts */}
      {sectorKey && <SectorAlerts sector={sectorKey} sectorLabel={sectorName} />}
    </div>
  );
}
