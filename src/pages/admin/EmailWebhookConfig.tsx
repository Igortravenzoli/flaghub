import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Mail, Webhook, Save, Eye, EyeOff, Plus, Trash2, TestTube } from 'lucide-react';
import { toast } from 'sonner';

export default function EmailWebhookConfig() {
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpTls, setSmtpTls] = useState(true);
  const [showPass, setShowPass] = useState(false);

  const [webhooks, setWebhooks] = useState<{ id: string; label: string; type: 'teams' | 'telegram'; url: string }[]>([]);
  const [newWebhookLabel, setNewWebhookLabel] = useState('');
  const [newWebhookType, setNewWebhookType] = useState<'teams' | 'telegram'>('teams');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');

  const handleSaveSMTP = () => {
    // TODO: Save to Supabase secrets / alert_channels
    toast.success('Configurações SMTP salvas com sucesso');
  };

  const handleTestSMTP = () => {
    toast.info('Enviando e-mail de teste...');
    // TODO: invoke edge function to test SMTP
  };

  const addWebhook = () => {
    if (!newWebhookLabel || !newWebhookUrl) {
      toast.error('Preencha label e URL do webhook');
      return;
    }
    setWebhooks([...webhooks, {
      id: crypto.randomUUID(),
      label: newWebhookLabel,
      type: newWebhookType,
      url: newWebhookUrl,
    }]);
    setNewWebhookLabel('');
    setNewWebhookUrl('');
    toast.success('Webhook adicionado');
  };

  const removeWebhook = (id: string) => {
    setWebhooks(webhooks.filter(w => w.id !== id));
    toast.success('Webhook removido');
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Email & Webhooks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configuração de SMTP para alertas por e-mail e webhooks para integrações (Teams, Telegram).
        </p>
      </div>

      {/* SMTP Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-5 w-5 text-primary" />
            Configuração SMTP
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Servidor SMTP</Label>
              <Input
                placeholder="smtp.office365.com"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Porta</Label>
              <Input
                placeholder="587"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Usuário</Label>
              <Input
                placeholder="noreply@flag.com.br"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Senha</Label>
              <div className="relative">
                <Input
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full w-10"
                  onClick={() => setShowPass(!showPass)}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Email Remetente</Label>
              <Input
                placeholder="alertas@flag.com.br"
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Label className="text-xs">TLS/STARTTLS</Label>
              <Switch checked={smtpTls} onCheckedChange={setSmtpTls} />
            </div>
          </div>
          <Separator />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleTestSMTP}>
              <TestTube className="h-3.5 w-3.5" />
              Testar Envio
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSaveSMTP}>
              <Save className="h-3.5 w-3.5" />
              Salvar SMTP
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Webhooks Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Webhook className="h-5 w-5 text-primary" />
            Webhooks de Integração
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Configure URLs de webhook para enviar alertas dos setores via Microsoft Teams ou Telegram.
          </p>

          {/* Existing webhooks */}
          {webhooks.length > 0 && (
            <div className="space-y-2">
              {webhooks.map((wh) => (
                <div key={wh.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {wh.type === 'teams' ? 'Teams' : 'Telegram'}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{wh.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{wh.url}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeWebhook(wh.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Separator />

          {/* Add new webhook */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Label</Label>
              <Input
                placeholder="Ex: Canal Operações"
                value={newWebhookLabel}
                onChange={(e) => setNewWebhookLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={newWebhookType}
                onChange={(e) => setNewWebhookType(e.target.value as 'teams' | 'telegram')}
              >
                <option value="teams">Microsoft Teams</option>
                <option value="telegram">Telegram</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">URL Webhook</Label>
              <Input
                placeholder="https://..."
                value={newWebhookUrl}
                onChange={(e) => setNewWebhookUrl(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={addWebhook}>
              <Plus className="h-3.5 w-3.5" />
              Adicionar Webhook
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
