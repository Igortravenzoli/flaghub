import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, Bell, Clock, RefreshCw, Mail, Shield, Save } from 'lucide-react';
import { toast } from 'sonner';

interface SectorSettingsProps {
  sectorName: string;
}

export function SectorSettings({ sectorName }: SectorSettingsProps) {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState('5');
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [criticalOnly, setCriticalOnly] = useState(true);
  const [emailTo, setEmailTo] = useState('');
  const [kioskAutoRotate, setKioskAutoRotate] = useState(false);
  const [kioskInterval, setKioskInterval] = useState('30');

  const handleSave = () => {
    toast.success(`Configurações de ${sectorName} salvas com sucesso`);
  };

  return (
    <div className="space-y-4 animate-fade-in">
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

      {/* Data Retention */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-foreground">Retenção de Dados</h4>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Período de retenção dos dados importados para este setor.
        </p>
        <Select defaultValue="90">
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="60">60 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
            <SelectItem value="180">180 dias</SelectItem>
            <SelectItem value="365">1 ano</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Button onClick={handleSave} className="w-full gap-2">
        <Save className="h-4 w-4" />
        Salvar Configurações de {sectorName}
      </Button>
    </div>
  );
}
