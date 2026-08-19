import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { FunnelBands } from '@/components/comercial/FunnelBands';
import { funnelColor } from '@/lib/funilCores';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import {
  Filter, Pencil, Trash2, Plus, Loader2, BarChart3, Info, CalendarDays,
  Target, Search, UserCheck, PhoneCall, MessageSquare, BadgeCheck, ArrowRightLeft,
  Inbox, ClipboardList, MonitorPlay, FileText, Handshake, Trophy, CircleDot,
} from 'lucide-react';
import { toast } from 'sonner';
import { useComercialFunil, FunilEtapa, FunilKey } from '@/hooks/useComercialFunil';
import { visoesDoTrimestre, ymLabel, ymNow, type VisaoTrimestre } from '@/lib/comercialPeriodo';

/** Registro de ícones profissionais por chave (persistida em comercial_funil.icone). */
export const FUNIL_ICONS: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  'target': { icon: Target, label: 'Alvo' },
  'search': { icon: Search, label: 'Busca' },
  'user-check': { icon: UserCheck, label: 'Decisor' },
  'phone-call': { icon: PhoneCall, label: 'Ligação' },
  'message-square': { icon: MessageSquare, label: 'Conversa' },
  'badge-check': { icon: BadgeCheck, label: 'Validado' },
  'arrow-right-left': { icon: ArrowRightLeft, label: 'Transferência' },
  'inbox': { icon: Inbox, label: 'Entrada' },
  'clipboard-list': { icon: ClipboardList, label: 'Diagnóstico' },
  'monitor-play': { icon: MonitorPlay, label: 'Demonstração' },
  'file-text': { icon: FileText, label: 'Proposta' },
  'handshake': { icon: Handshake, label: 'Negociação' },
  'trophy': { icon: Trophy, label: 'Fechamento' },
};

export function EtapaIcon({ icone, className }: { icone: string | null; className?: string }) {
  const entry = icone ? FUNIL_ICONS[icone] : undefined;
  const Icon = entry?.icon ?? CircleDot;
  return <Icon className={className} />;
}

const FUNIS: { key: FunilKey; titulo: string; subtitulo: string }[] = [
  // Sem nome de pessoa no título — o funil é do processo, não de quem opera.
  { key: 'sdr', titulo: 'Funil SDR', subtitulo: 'Da captação do lead à transferência para o Comercial' },
  { key: 'comercial', titulo: 'Funil Comercial', subtitulo: 'Da oportunidade recebida ao fechamento' },
];

interface EtapaFormState {
  id?: string;
  funil: FunilKey;
  etapa: string;
  icone: string;
  ordem: number;
  quantidade: number;
}

interface Props {
  canEdit?: boolean;
}

type HistView = 'mensal' | 'trimestral' | 'acumulado';

/** Visão de um mês fora do trimestre vigente, escolhido no seletor "Outro mês". */
function visaoAvulsa(ym: string): VisaoTrimestre {
  return { key: ym, label: ymLabel(ym), labelCurto: ymLabel(ym), meses: [ym], tipo: 'mes' };
}

export default function FunilVendasTab({ canEdit = false }: Props) {
  // Filtro do modelo da reunião quinzenal (18/08/2026): uma aba por mês já
  // iniciado do trimestre + o acumulado. Substituiu o par "Mês/Trimestre" +
  // seletor de mês, que exigia duas interações para responder "e no trimestre?".
  // Recalculado a cada render de propósito (é uma varredura de 3 meses): com
  // `useMemo(..., [])` a lista congelava no mount e uma aba aberta na virada do
  // trimestre continuaria oferecendo o trimestre velho até dar F5.
  const visoes = visoesDoTrimestre();
  const [visaoKey, setVisaoKey] = useState<string>(() => {
    const doMesCorrente = visoes.find(v => v.tipo === 'mes' && v.meses[0] === ymNow());
    return (doMesCorrente ?? visoes[0]).key;
  });
  /** Mês fora do trimestre — o lançamento retroativo continua possível. */
  const [mesAvulso, setMesAvulso] = useState<string | null>(null);

  // Busca por identidade, não por índice: na virada do trimestre a chave
  // selecionada some da lista e a aba cai no primeiro mês do trimestre novo.
  const visao = mesAvulso
    ? visaoAvulsa(mesAvulso)
    : visoes.find(v => v.key === visaoKey) ?? visoes[0];

  const escopo = visao.meses;
  /** Lançamento é sempre mensal — no acumulado a edição fica desligada. */
  const mesSel = visao.tipo === 'mes' ? visao.meses[0] : null;

  const {
    sdr, comercial, historico, historicoTrimestral,
    isLoading, isError, refetch, createEtapa, updateEtapa, deleteEtapa, upsertLancamento,
  } = useComercialFunil(escopo);
  const [managing, setManaging] = useState<FunilKey | null>(null);
  const [form, setForm] = useState<EtapaFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [histView, setHistView] = useState<HistView>('mensal');

  const byFunil = useMemo(() => ({ sdr, comercial }), [sdr, comercial]);

  const histData = useMemo(() => {
    if (histView === 'trimestral') return historicoTrimestral;
    if (histView === 'acumulado') {
      return historico.map(h => ({ ...h, sdr: h.sdrAcum, comercial: h.comercialAcum }));
    }
    return historico;
  }, [histView, historico, historicoTrimestral]);

  function selecionarVisao(key: string) {
    setMesAvulso(null);
    setVisaoKey(key);
    setManaging(null);
  }

  const openCreate = (funil: FunilKey) => {
    const list = byFunil[funil];
    setForm({ funil, etapa: '', icone: '', ordem: (list[list.length - 1]?.ordem ?? 0) + 1, quantidade: 0 });
  };

  const openEdit = (e: FunilEtapa) => {
    setForm({ id: e.id, funil: e.funil, etapa: e.etapa, icone: e.icone ?? '', ordem: e.ordem, quantidade: e.quantidade });
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form || !form.etapa.trim() || !mesSel) return;
    setSaving(true);
    try {
      let etapaId = form.id;
      if (form.id) {
        await updateEtapa.mutateAsync({
          id: form.id,
          etapa: form.etapa.trim(),
          icone: form.icone || null,
          ordem: form.ordem,
        });
      } else {
        etapaId = await createEtapa.mutateAsync({
          funil: form.funil,
          etapa: form.etapa.trim(),
          icone: form.icone || null,
          ordem: form.ordem,
        });
      }
      if (etapaId) {
        await upsertLancamento.mutateAsync({ etapa_id: etapaId, mes: mesSel, quantidade: form.quantidade });
      }
      toast.success(`Categoria "${form.etapa.trim()}" salva (${ymLabel(mesSel)}).`);
      setForm(null);
    } catch (err) {
      toast.error(`Falha ao salvar categoria: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: FunilEtapa) => {
    if (!window.confirm(`Remover a etapa "${e.etapa}" do funil?`)) return;
    try {
      await deleteEtapa.mutateAsync(e.id);
      toast.success(`Etapa "${e.etapa}" removida.`);
    } catch (err) {
      toast.error(`Falha ao remover etapa: ${(err as Error).message}`);
    }
  };

  const handleQtyBlur = async (e: FunilEtapa, value: string) => {
    if (!mesSel) return;
    const qty = Math.max(0, parseInt(value, 10) || 0);
    if (qty === e.quantidade) return;
    try {
      await upsertLancamento.mutateAsync({ etapa_id: e.id, mes: mesSel, quantidade: qty });
      toast.success(`${e.etapa}: ${qty} lançado em ${ymLabel(mesSel)}.`);
    } catch (err) {
      toast.error(`Falha ao lançar quantidade de "${e.etapa}": ${(err as Error).message}`);
    }
  };

  if (isError) return <DashboardEmptyState variant="error" onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Funil de Vendas</h2>
          <p className="text-sm text-muted-foreground">
            Lançamento sempre mensal — o trimestre é a <strong>soma</strong> dos meses, não um lançamento à parte.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {visoes.map(v => {
            const ativa = !mesAvulso && v.key === visao.key;
            return (
              <Button
                key={v.key}
                type="button"
                size="sm"
                variant={ativa ? 'default' : 'outline'}
                className="h-8 rounded-full px-4 text-xs"
                aria-pressed={ativa}
                onClick={() => selecionarVisao(v.key)}
              >
                {v.label}
              </Button>
            );
          })}
          <div className="flex items-center gap-1.5 pl-1">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            <label htmlFor="funil-mes-avulso" className="sr-only">Outro mês</label>
            <Input
              id="funil-mes-avulso"
              type="month"
              value={mesAvulso ?? ''}
              onChange={(e) => { setMesAvulso(e.target.value || null); setManaging(null); }}
              className="h-8 w-36 text-xs"
              title="Outro mês — para consultar ou lançar fora do trimestre vigente"
            />
          </div>
        </div>
      </div>

      {visao.tipo === 'acumulado' && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          {visao.label} — soma de {visao.meses.map(ymLabel).join(' + ')}.
          Para lançar quantitativos, escolha um <strong>mês</strong>.
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {FUNIS.map(({ key, titulo, subtitulo }) => {
          const etapas = byFunil[key];
          const topo = etapas[0]?.quantidade ?? 0;
          const base = etapas[etapas.length - 1]?.quantidade ?? 0;
          const conversao = topo > 0 ? Math.round((base / topo) * 1000) / 10 : null;
          const isManaging = managing === key;

          return (
            <Card key={key} className="p-5 border flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border bg-muted/40">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{titulo}</h3>
                    <p className="text-xs text-muted-foreground">{subtitulo}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px] whitespace-nowrap font-mono">
                    {visao.labelCurto}
                  </Badge>
                  {conversao !== null && (
                    <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                      conversão {conversao}%
                    </Badge>
                  )}
                  {canEdit && mesSel && (
                    <Button
                      size="sm"
                      variant={isManaging ? 'default' : 'outline'}
                      className="h-7 text-xs"
                      onClick={() => setManaging(isManaging ? null : key)}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      {isManaging ? 'Concluir' : 'Gerenciar'}
                    </Button>
                  )}
                </div>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <FunnelBands etapas={etapas} animacaoKey={visao.key} />
              )}

              {canEdit && isManaging && mesSel && (
                <div className="border-t pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Etapas · lançamento de {ymLabel(mesSel)}
                    </p>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openCreate(key)}>
                      <Plus className="h-3 w-3 mr-1" />
                      Categoria
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    {etapas.map((e, i) => (
                      <div key={e.id} className="flex items-center gap-2 text-sm">
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded-md flex-shrink-0"
                          style={{ backgroundColor: `${funnelColor(i, etapas.length)}1f`, color: funnelColor(i, etapas.length) }}
                        >
                          <EtapaIcon icone={e.icone} className="h-3.5 w-3.5" />
                        </span>
                        <span className="flex-1 truncate text-xs">{e.etapa}</span>
                        <Input
                          type="number"
                          min={0}
                          defaultValue={e.quantidade}
                          key={`${e.id}-${e.quantidade}`}
                          className="h-7 w-20 text-xs font-mono text-right"
                          onBlur={(ev) => handleQtyBlur(e, ev.target.value)}
                        />
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(e)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(e)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="p-5 border flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border bg-muted/40">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Histórico dos funis</h3>
              <p className="text-xs text-muted-foreground">
                {histView === 'acumulado'
                  ? 'Acumulado no ano — reinicia em janeiro'
                  : histView === 'trimestral'
                    ? 'Soma dos lançamentos de cada trimestre'
                    : 'Total lançado em cada mês'}
              </p>
            </div>
          </div>
          <ToggleGroup
            type="single"
            value={histView}
            onValueChange={(v) => v && setHistView(v as HistView)}
            className="bg-muted/50 rounded-md p-0.5"
          >
            <ToggleGroupItem value="mensal" className="h-7 px-3 text-xs">Mensal</ToggleGroupItem>
            <ToggleGroupItem value="trimestral" className="h-7 px-3 text-xs">Trimestral</ToggleGroupItem>
            {/* "no ano" no rótulo, não só no subtítulo: desde que o filtro do topo
                ganhou a aba "Acumulado" (do trimestre), um "Acumulado" solto aqui
                virou o MESMO nome para duas janelas diferentes na mesma tela. */}
            <ToggleGroupItem value="acumulado" className="h-7 px-3 text-xs">Acumulado no ano</ToggleGroupItem>
          </ToggleGroup>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : histData.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Sem lançamentos ainda — lance quantitativos em um mês para o histórico aparecer.
          </p>
        ) : (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="sdr" name="SDR" fill="#0284c7" radius={[3, 3, 0, 0]} />
                <Bar dataKey="comercial" name="Comercial" fill="#9333ea" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {form?.id ? 'Editar categoria' : 'Nova categoria'} · {form?.funil === 'sdr' ? 'Funil SDR' : 'Funil Comercial'}
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Categoria (etapa)</label>
                <Input
                  value={form?.etapa ?? ''}
                  onChange={(e) => setForm(f => f ? { ...f, etapa: e.target.value } : f)}
                  placeholder="Ex: Qualificação"
                  required
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Ícone</label>
                  <Select
                    value={form?.icone || '__none__'}
                    onValueChange={(v) => setForm(f => f ? { ...f, icone: v === '__none__' ? '' : v } : f)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem ícone</SelectItem>
                      {Object.entries(FUNIL_ICONS).map(([key, { icon: Icon, label }]) => (
                        <SelectItem key={key} value={key}>
                          <span className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" />
                            {label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Ordem</label>
                  <Input
                    type="number"
                    value={form?.ordem ?? 0}
                    onChange={(e) => setForm(f => f ? { ...f, ordem: parseInt(e.target.value, 10) || 0 } : f)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Qtd ({mesSel ? ymLabel(mesSel) : '—'})</label>
                  <Input
                    type="number"
                    min={0}
                    value={form?.quantidade ?? 0}
                    onChange={(e) => setForm(f => f ? { ...f, quantidade: Math.max(0, parseInt(e.target.value, 10) || 0) } : f)}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Salvar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
