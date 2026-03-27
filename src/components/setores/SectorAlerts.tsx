import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Bell, Plus, Trash2, Send, Clock, AlertTriangle, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { useAlertRules, useAlertChannels, useAlertDeliveries, useAlertMutations } from '@/hooks/useAlertRules';
import { useAuth } from '@/hooks/useAuth';
import { useHubAreas } from '@/hooks/useHubAreas';
import { useHubIsAdmin } from '@/hooks/useHubPermissions';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SectorAlertsProps {
  sector: string;
  sectorLabel: string;
}

// Pre-defined KPIs per sector for dropdown selection
const SECTOR_KPIS: Record<string, { key: string; label: string }[]> = {
  tickets_os: [
    { key: 'total_tickets', label: 'Total de Tickets' },
    { key: 'tickets_sem_os', label: 'Tickets sem OS' },
    { key: 'tickets_criticos', label: 'Tickets Críticos' },
    { key: 'tickets_observacao', label: 'Tickets em Observação' },
    { key: 'taxa_correlacao', label: 'Taxa de Correlação (%)' },
    { key: 'total_registros', label: 'Total Registros Helpdesk' },
    { key: 'horas_acumuladas', label: 'Horas Acumuladas' },
    { key: 'consultores_ativos', label: 'Consultores Ativos' },
  ],
  fabrica: [
    { key: 'pbis_total', label: 'Total de PBIs' },
    { key: 'pbis_vermelho', label: 'PBIs em Vermelho' },
    { key: 'pbis_amarelo', label: 'PBIs em Amarelo' },
    { key: 'overflow_count', label: 'Transbordos' },
    { key: 'avg_lead_time', label: 'Lead Time Médio (dias)' },
    { key: 'backlog_count', label: 'Itens no Backlog' },
    { key: 'fabrica_count', label: 'Itens em Fábrica' },
    { key: 'qualidade_count', label: 'Itens em Qualidade' },
  ],
  comercial: [
    { key: 'clientes_novos', label: 'Clientes Novos' },
    { key: 'clientes_encerrados', label: 'Clientes Encerrados' },
    { key: 'valor_mensal_total', label: 'Valor Mensal Total' },
    { key: 'vendas_total', label: 'Total de Vendas' },
    { key: 'nps_medio', label: 'NPS Médio' },
  ],
  'customer-service': [
    { key: 'fila_total', label: 'Total na Fila' },
    { key: 'fila_prioridade_alta', label: 'Fila Prioridade Alta' },
    { key: 'implantacoes_ativas', label: 'Implantações Ativas' },
    { key: 'horas_implantacao', label: 'Horas de Implantação' },
  ],
  infraestrutura: [
    { key: 'itens_total', label: 'Total de Itens' },
    { key: 'itens_criticos', label: 'Itens Críticos' },
    { key: 'itens_atrasados', label: 'Itens Atrasados' },
  ],
  qualidade: [
    { key: 'bugs_total', label: 'Total de Bugs' },
    { key: 'bugs_criticos', label: 'Bugs Críticos' },
    { key: 'bugs_atrasados', label: 'Bugs Atrasados' },
    { key: 'taxa_retorno_qa', label: 'Taxa Retorno QA (%)' },
  ],
};

const CONDITION_OPTIONS = [
  { value: 'above', label: 'Acima de' },
  { value: 'below', label: 'Abaixo de' },
  { value: 'equals', label: 'Igual a' },
  { value: 'changed', label: 'Mudou' },
];

function DeliveryLog({ ruleId }: { ruleId: string }) {
  const { data: deliveries, isLoading } = useAlertDeliveries(ruleId);

  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!deliveries?.length) return <p className="text-xs text-muted-foreground py-2">Nenhum disparo registrado.</p>;

  return (
    <div className="space-y-1.5 mt-2">
      {deliveries.slice(0, 5).map((d) => (
        <div key={d.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded border border-border bg-muted/30">
          <div className="flex items-center gap-1.5">
            {d.status === 'delivered' ? (
              <CheckCircle2 className="h-3 w-3 text-primary" />
            ) : d.status === 'error' ? (
              <XCircle className="h-3 w-3 text-destructive" />
            ) : (
              <Clock className="h-3 w-3 text-muted-foreground" />
            )}
            <span className="text-muted-foreground">
              {formatDistanceToNow(new Date(d.created_at), { addSuffix: true, locale: ptBR })}
            </span>
          </div>
          <Badge variant={d.status === 'delivered' ? 'default' : d.status === 'error' ? 'destructive' : 'secondary'} className="text-[10px] h-4">
            {d.status === 'delivered' ? 'Entregue' : d.status === 'error' ? 'Erro' : d.status}
          </Badge>
        </div>
      ))}
    </div>
  );
}

export function SectorAlerts({ sector, sectorLabel }: SectorAlertsProps) {
  const { isAdmin: isAuthAdmin } = useAuth();
  const isHubAdmin = useHubIsAdmin();
  const { isOwner } = useHubAreas();
  const isAdmin = isHubAdmin || isAuthAdmin;
  const isSectorOwner = isOwner(sector);
  const canManage = isAdmin || isSectorOwner;

  const { data: rules, isLoading: rulesLoading } = useAlertRules(sector);
  const { data: channels, isLoading: channelsLoading } = useAlertChannels();
  const { createRule, updateRule, deleteRule } = useAlertMutations();
  const [expandedRule, setExpandedRule] = useState<string | null>(null);

  // New rule form
  const [showForm, setShowForm] = useState(false);
  const [metricKey, setMetricKey] = useState('');
  const [condition, setCondition] = useState('above');
  const [threshold, setThreshold] = useState('');
  const [channelId, setChannelId] = useState('');

  const availableKpis = SECTOR_KPIS[sector] ?? [];

  const handleCreate = async () => {
    if (!metricKey) {
      toast.error('Selecione a métrica');
      return;
    }
    try {
      await createRule.mutateAsync({
        sector,
        metric_key: metricKey,
        condition_type: condition,
        threshold: threshold ? Number(threshold) : null,
        enabled: true,
        channel_id: channelId || null,
        recipients: null,
      });
      toast.success('Regra de alerta criada');
      setShowForm(false);
      setMetricKey('');
      setThreshold('');
      setChannelId('');
    } catch (err: any) {
      toast.error('Erro ao criar regra', { description: err?.message });
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await updateRule.mutateAsync({ id, enabled });
      toast.success(enabled ? 'Alerta ativado' : 'Alerta desativado');
    } catch (err: any) {
      toast.error('Erro ao atualizar', { description: err?.message });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRule.mutateAsync(id);
      toast.success('Regra removida');
    } catch (err: any) {
      toast.error('Erro ao remover', { description: err?.message });
    }
  };

  const isLoading = rulesLoading || channelsLoading;
  const getKpiLabel = (key: string) => availableKpis.find(k => k.key === key)?.label ?? key;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-foreground">Alertas — {sectorLabel}</h4>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-3.5 w-3.5" />
            Nova Regra
          </Button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-4 p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Métrica (KPI)</Label>
              <Select value={metricKey} onValueChange={setMetricKey}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Selecionar KPI..." />
                </SelectTrigger>
                <SelectContent>
                  {availableKpis.map((kpi) => (
                    <SelectItem key={kpi.key} value={kpi.key}>{kpi.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Condição</Label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Limiar</Label>
              <Input
                type="number"
                placeholder="ex: 100"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="h-8 text-sm"
                disabled={condition === 'changed'}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Canal</Label>
              <Select value={channelId} onValueChange={setChannelId}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Selecionar canal" />
                </SelectTrigger>
                <SelectContent>
                  {(channels ?? []).filter(c => c.is_active).map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>
                      {ch.label} ({ch.channel_type})
                    </SelectItem>
                  ))}
                  {(!channels || channels.filter(c => c.is_active).length === 0) && (
                    <SelectItem value="__none" disabled>Nenhum canal cadastrado (configure em Admin)</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="sm" className="gap-1.5" onClick={handleCreate} disabled={createRule.isPending}>
              <Send className="h-3.5 w-3.5" />
              Criar Regra
            </Button>
          </div>
        </div>
      )}

      {/* Rules list */}
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : !rules?.length ? (
        <div className="text-center py-8 text-muted-foreground">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhuma regra de alerta configurada para este setor.</p>
          {canManage && <p className="text-xs mt-1">Clique em "Nova Regra" para começar.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => {
            const isExpanded = expandedRule === rule.id;
            const channel = channels?.find(c => c.id === rule.channel_id);
            const condLabel = CONDITION_OPTIONS.find(c => c.value === rule.condition_type)?.label ?? rule.condition_type;

            return (
              <div key={rule.id} className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center justify-between gap-3 p-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={(v) => handleToggle(rule.id, v)}
                      disabled={!canManage}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {getKpiLabel(rule.metric_key)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {condLabel}{rule.threshold != null ? ` ${rule.threshold}` : ''} 
                        {channel ? ` → ${channel.label}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {rule.last_triggered_at && (
                      <Badge variant="outline" className="text-[10px] h-5 gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {formatDistanceToNow(new Date(rule.last_triggered_at), { addSuffix: true, locale: ptBR })}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setExpandedRule(isExpanded ? null : rule.id)}
                    >
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(rule.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-border px-3 pb-3">
                    <p className="text-xs font-medium text-muted-foreground mt-2 mb-1">Histórico de Disparos</p>
                    <DeliveryLog ruleId={rule.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
