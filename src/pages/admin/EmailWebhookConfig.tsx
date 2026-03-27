import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Mail, Webhook, Save, Eye, EyeOff, Plus, Trash2, TestTube, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface WebhookEntry {
  id: string;
  label: string;
  type: 'teams' | 'telegram';
  url: string;
}

export default function EmailWebhookConfig() {
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpTls, setSmtpTls] = useState(true);
  const [showPass, setShowPass] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);

  const [webhooks, setWebhooks] = useState<WebhookEntry[]>([]);
  const [newWebhookLabel, setNewWebhookLabel] = useState('');
  const [newWebhookType, setNewWebhookType] = useState<'teams' | 'telegram'>('teams');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [savingWebhooks, setSavingWebhooks] = useState(false);

  // Load saved config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const { data: channels, error } = await supabase
          .from('alert_channels')
          .select('*')
          .order('label');
        if (error) throw error;

        // Load SMTP config
        const smtpChannel = channels?.find(
          (c) => c.channel_type === 'email' && c.label === 'SMTP Principal'
        );
        if (smtpChannel?.config && typeof smtpChannel.config === 'object') {
          const cfg = smtpChannel.config as Record<string, unknown>;
          setSmtpHost((cfg.host as string) || '');
          setSmtpPort(String(cfg.port || '587'));
          setSmtpUser((cfg.user as string) || '');
          setSmtpFrom((cfg.from as string) || '');
          setSmtpTls(cfg.tls !== false);
          // password is never stored in config for security — user must re-enter
        }

        // Load webhooks
        const webhookChannels = channels?.filter(
          (c) => c.channel_type === 'teams' || c.channel_type === 'telegram'
        ) || [];
        setWebhooks(
          webhookChannels.map((wh) => ({
            id: wh.id,
            label: wh.label,
            type: wh.channel_type as 'teams' | 'telegram',
            url: ((wh.config as Record<string, unknown>)?.url as string) || '',
          }))
        );
      } catch (err: any) {
        console.error('Erro ao carregar configurações:', err);
      } finally {
        setLoadingConfig(false);
      }
    };
    loadConfig();
  }, []);

  const handleSaveSMTP = async () => {
    if (!smtpHost || !smtpUser || !smtpFrom) {
      toast.error('Preencha todos os campos obrigatórios (host, usuário, remetente)');
      return;
    }
    setSavingSmtp(true);
    try {
      const config = { host: smtpHost, port: smtpPort, user: smtpUser, from: smtpFrom, tls: smtpTls };
      const { error } = await supabase.from('alert_channels').upsert(
        { channel_type: 'email', label: 'SMTP Principal', config: config as any, is_active: true },
        { onConflict: 'channel_type,label' }
      );
      if (error) throw error;
      toast.success('Configurações SMTP salvas com sucesso');
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err.message || String(err)));
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleTestSMTP = async () => {
    if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
      toast.error('Preencha os campos SMTP antes de testar (incluindo senha)');
      return;
    }
    setTestingSmtp(true);
    toast.info('Testando conexão SMTP...');
    try {
      const { data, error } = await supabase.functions.invoke('smtp-test', {
        body: {
          host: smtpHost,
          port: Number(smtpPort) || 587,
          user: smtpUser,
          pass: smtpPass,
          from: smtpFrom,
          tls: smtpTls,
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(data.message || 'Teste SMTP concluído com sucesso!');
      } else {
        toast.error('Falha no teste: ' + (data?.error || 'Erro desconhecido'));
      }
    } catch (err: any) {
      toast.error('Erro ao testar SMTP: ' + (err.message || String(err)));
    } finally {
      setTestingSmtp(false);
    }
  };

  const addWebhook = async () => {
    if (!newWebhookLabel || !newWebhookUrl) {
      toast.error('Preencha label e URL do webhook');
      return;
    }
    setSavingWebhooks(true);
    try {
      const { data, error } = await supabase.from('alert_channels').insert({
        channel_type: newWebhookType,
        label: newWebhookLabel,
        config: { url: newWebhookUrl } as any,
        is_active: true,
      }).select().single();
      if (error) throw error;
      setWebhooks([...webhooks, {
        id: data.id,
        label: newWebhookLabel,
        type: newWebhookType,
        url: newWebhookUrl,
      }]);
      setNewWebhookLabel('');
      setNewWebhookUrl('');
      toast.success('Webhook salvo com sucesso');
    } catch (err: any) {
      toast.error('Erro ao salvar webhook: ' + (err.message || String(err)));
    } finally {
      setSavingWebhooks(false);
    }
  };

  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);

  const testWebhook = async (wh: WebhookEntry) => {
    setTestingWebhookId(wh.id);
    try {
      const payload = wh.type === 'teams'
        ? { "@type": "MessageCard", "@context": "http://schema.org/extensions", summary: "HubFusion Test", themeColor: "0076D7", title: "🔔 HubFusion - Teste de Webhook", text: `Webhook **${wh.label}** configurado com sucesso!` }
        : { text: `🔔 HubFusion - Teste de Webhook\n\nWebhook "${wh.label}" configurado com sucesso!` };

      const res = await fetch(wh.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wh.type === 'telegram' ? { chat_id: new URL(wh.url).searchParams.get('chat_id') || '', text: payload.text, parse_mode: 'HTML' } : payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(`Teste enviado para ${wh.type === 'teams' ? 'Teams' : 'Telegram'} com sucesso!`);
    } catch (err: any) {
      toast.error('Falha no teste: ' + (err.message || String(err)));
    } finally {
      setTestingWebhookId(null);
    }
  };

  const removeWebhook = async (id: string) => {
    try {
      const { error } = await supabase.from('alert_channels').delete().eq('id', id);
      if (error) throw error;
      setWebhooks(webhooks.filter(w => w.id !== id));
      toast.success('Webhook removido');
    } catch (err: any) {
      toast.error('Erro ao remover: ' + (err.message || String(err)));
    }
  };

  if (loadingConfig) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
              <Input placeholder="smtp.office365.com" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Porta</Label>
              <Input placeholder="587" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Usuário</Label>
              <Input placeholder="noreply@flag.com.br" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
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
                <Button variant="ghost" size="icon" className="absolute right-0 top-0 h-full w-10" onClick={() => setShowPass(!showPass)}>
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">A senha não é exibida após salvar por segurança.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Email Remetente</Label>
              <Input placeholder="alertas@flag.com.br" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Label className="text-xs">TLS/STARTTLS</Label>
              <Switch checked={smtpTls} onCheckedChange={setSmtpTls} />
            </div>
          </div>
          <Separator />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleTestSMTP} disabled={testingSmtp}>
              {testingSmtp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
              {testingSmtp ? 'Testando...' : 'Testar Conexão'}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSaveSMTP} disabled={savingSmtp}>
              {savingSmtp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {savingSmtp ? 'Salvando...' : 'Salvar SMTP'}
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
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeWebhook(wh.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Separator />

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Label</Label>
              <Input placeholder="Ex: Canal Operações" value={newWebhookLabel} onChange={(e) => setNewWebhookLabel(e.target.value)} />
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
              <Input placeholder="https://..." value={newWebhookUrl} onChange={(e) => setNewWebhookUrl(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={addWebhook} disabled={savingWebhooks}>
              {savingWebhooks ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Adicionar Webhook
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
