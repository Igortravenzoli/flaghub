import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Bell, Clock, RefreshCw, Mail, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface SectorSettingsProps {
  sectorName: string;
  /** Edge function name(s) to invoke for immediate sync */
  syncFunctions?: { name: string; label: string; payload?: Record<string, unknown> }[];
}

export function SectorSettings({ sectorName, syncFunctions = [] }: SectorSettingsProps) {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState('5');
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [criticalOnly, setCriticalOnly] = useState(true);
  const [emailTo, setEmailTo] = useState('');
  const [kioskAutoRotate, setKioskAutoRotate] = useState(false);
  const [kioskInterval, setKioskInterval] = useState('30');
  const [syncingFns, setSyncingFns] = useState<Set<string>>(new Set());
  const [syncResults, setSyncResults] = useState<Record<string, 'ok' | 'error'>>({});

  const handleSave = () => {
    toast.success(`Configurações de ${sectorName} salvas com sucesso`);
  };

  const handleSync = async (fnName: string, label: string, payload?: Record<string, unknown>) => {
    setSyncingFns(prev => new Set(prev).add(fnName));
    setSyncResults(prev => { const n = { ...prev }; delete n[fnName]; return n; });

    try {
      const { error } = await supabase.functions.invoke(fnName, {
        body: payload ?? {},
      });
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

      {/* Auto Refresh */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <RefreshCw className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-foreground">Atualização Automática</h4>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Atualizar dados automaticamente</Label>
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          </div>
          {autoRefresh && (
            <div className="flex items-center gap-3">
              <Label className="shrink-0">Intervalo</Label>
              <Select value={refreshInterval} onValueChange={setRefreshInterval}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 minuto</SelectItem>
                  <SelectItem value="5">5 minutos</SelectItem>
                  <SelectItem value="15">15 minutos</SelectItem>
                  <SelectItem value="30">30 minutos</SelectItem>
                  <SelectItem value="60">1 hora</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </Card>

      {/* Email Alerts */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-foreground">Alertas por Email</h4>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Ativar alertas por email</Label>
            <Switch checked={emailAlerts} onCheckedChange={setEmailAlerts} />
          </div>
          {emailAlerts && (
            <>
              <div className="flex items-center justify-between">
                <Label>Somente alertas críticos</Label>
                <Switch checked={criticalOnly} onCheckedChange={setCriticalOnly} />
              </div>
              <div className="space-y-2">
                <Label>Email de destino</Label>
                <Input
                  type="email"
                  placeholder="operacao@flag.com.br"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Kiosk Mode */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-foreground">Modo Kiosk / TV</h4>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Rotação automática de painéis</Label>
            <Switch checked={kioskAutoRotate} onCheckedChange={setKioskAutoRotate} />
          </div>
          {kioskAutoRotate && (
            <div className="flex items-center gap-3">
              <Label className="shrink-0">Intervalo</Label>
              <Select value={kioskInterval} onValueChange={setKioskInterval}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 segundos</SelectItem>
                  <SelectItem value="30">30 segundos</SelectItem>
                  <SelectItem value="60">1 minuto</SelectItem>
                  <SelectItem value="120">2 minutos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <h4 className="font-semibold text-foreground mb-2">Retenção de Dados</h4>
        <p className="text-sm text-muted-foreground">
          A configuração de retenção foi centralizada no menu Admin para controle estruturado.
        </p>
      </Card>

      <Button onClick={handleSave} className="w-full gap-2">
        <Save className="h-4 w-4" />
        Salvar Configurações de {sectorName}
      </Button>
    </div>
  );
}
