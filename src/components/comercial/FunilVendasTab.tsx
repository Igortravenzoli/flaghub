import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import {
  Filter, Pencil, Trash2, Plus, Loader2, BarChart3, Info,
  Target, Search, UserCheck, PhoneCall, MessageSquare, BadgeCheck, ArrowRightLeft,
  Inbox, ClipboardList, MonitorPlay, FileText, Handshake, Trophy, CircleDot,
} from 'lucide-react';
import { toast } from 'sonner';
import { useComercialFunil, FunilEtapa, FunilKey } from '@/hooks/useComercialFunil';
import { mesesDoTrimestre, qKeyDoMes, qLabel, ymLabel, ymNow } from '@/lib/comercialPeriodo';

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

/** Paleta inspirada no modelo: topo quente → base fria (7 posições). */
const FUNNEL_COLORS = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0284c7', '#4f46e5', '#9333ea'];

export function funnelColor(index: number, total: number): string {
  if (total <= 1) return FUNNEL_COLORS[0];
  const pos = Math.round((index / (total - 1)) * (FUNNEL_COLORS.length - 1));
  return FUNNEL_COLORS[pos];
}

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((n & 255) * factor));
  return `rgb(${r},${g},${b})`;
}

interface FunnelVizProps {
  etapas: FunilEtapa[];
  compact?: boolean;
}

/** Funil 3D estilizado em perspectiva (SVG com sombreamento e aros elípticos). */
export function FunnelViz({ etapas, compact = false }: FunnelVizProps) {
  const total = etapas.length;
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  if (total === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma etapa cadastrada.</p>;
  }

  const W = 400;
  const cx = W / 2;
  const bandH = compact ? 30 : 48;
  const gap = compact ? 5 : 8;
  const maxRx = 186;
  const minRx = 78;
  const ryF = 0.13;
  const fontSize = compact ? 12 : 14;
  const topQty = etapas[0]?.quantidade ?? 0;
  const H = 14 + total * (bandH + gap) + (compact ? 14 : 24);
  const rxAt = (i: number) => maxRx - ((maxRx - minRx) * i) / total;

  let y = 12;
  const bands = etapas.map((e, i) => {
    const color = funnelColor(i, total);
    const rxT = rxAt(i);
    const rxB = rxAt(i + 1);
    const ryT = Math.max(compact ? 4 : 6, rxT * ryF);
    const ryB = Math.max(compact ? 3 : 5, rxB * ryF);
    const yT = y;
    const yB = y + bandH;
    y = yB + gap;
    const pct = topQty > 0 ? Math.round((e.quantidade / topQty) * 100) : null;
    const gid = `fnl-${uid}-${i}`;
    return { e, i, color, rxT, rxB, ryT, ryB, yT, yB, pct, gid };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img" aria-label="Funil de vendas">
      <defs>
        {bands.map(({ color, gid }) => (
          <linearGradient key={gid} id={gid} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={shade(color, 0.55)} />
            <stop offset="0.28" stopColor={shade(color, 1.22)} />
            <stop offset="0.55" stopColor={color} />
            <stop offset="1" stopColor={shade(color, 0.5)} />
          </linearGradient>
        ))}
      </defs>
      <style>{`
        @keyframes fnl-band-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <ellipse cx={cx} cy={y + (compact ? 2 : 6)} rx={minRx * 1.15} ry={compact ? 6 : 10} fill="#000" opacity="0.14" />
      {bands.map(({ e, i, color, rxT, rxB, ryT, ryB, yT, yB, gid }) => (
        <g
          key={`body-${e.id}`}
          style={{ animation: `fnl-band-in 0.45s ease-out ${i * 0.18}s both` }}
        >
          <path
            d={`M ${cx - rxT} ${yT} A ${rxT} ${ryT} 0 0 0 ${cx + rxT} ${yT} L ${cx + rxB} ${yB} A ${rxB} ${ryB} 0 0 1 ${cx - rxB} ${yB} Z`}
            fill={`url(#${gid})`}
          />
          {i === 0 && (
            <ellipse cx={cx} cy={yT} rx={rxT} ry={ryT} fill={shade(color, 0.72)} />
          )}
        </g>
      ))}
      {/* Rótulos por último, acima de qualquer forma — cada um centralizado
          na face frontal da própria faixa (entre os arcos superior e inferior) */}
      {bands.map(({ e, i, yT, yB, ryT, ryB, pct }) => (
        <text
          key={`label-${e.id}`}
          x={cx}
          y={(yT + ryT + yB + ryB) / 2 + fontSize * 0.36}
          textAnchor="middle"
          fill="#fff"
          fontSize={fontSize}
          fontWeight={700}
          style={{
            paintOrder: 'stroke',
            stroke: 'rgba(0,0,0,0.55)',
            strokeWidth: 3.5,
            strokeLinejoin: 'round',
            animation: `fnl-band-in 0.45s ease-out ${i * 0.18 + 0.1}s both`,
          }}
        >
          {e.etapa} · {e.quantidade}{pct !== null && i > 0 ? ` (${pct}%)` : ''}
        </text>
      ))}
    </svg>
  );
}

const FUNIS: { key: FunilKey; titulo: string; subtitulo: string }[] = [
  { key: 'sdr', titulo: 'SDR (Geral)', subtitulo: 'Da captação do lead à transferência para o Comercial' },
  { key: 'comercial', titulo: 'Comercial (Geral)', subtitulo: 'Da oportunidade recebida ao fechamento' },
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

type FunilView = 'mes' | 'trimestre';
type HistView = 'mensal' | 'trimestral' | 'acumulado';

export default function FunilVendasTab({ canEdit = false }: Props) {
  const [view, setView] = useState<FunilView>('mes');
  const [mesSel, setMesSel] = useState<string>(ymNow());
  // Trimestre acompanha o mês selecionado — trocar de visão nunca "pula" de período.
  const qSel = qKeyDoMes(mesSel);
  const escopo = view === 'mes' ? [mesSel] : mesesDoTrimestre(qSel);
  const escopoLabel = view === 'mes' ? ymLabel(mesSel) : qLabel(qSel);

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

  const openCreate = (funil: FunilKey) => {
    const list = byFunil[funil];
    setForm({ funil, etapa: '', icone: '', ordem: (list[list.length - 1]?.ordem ?? 0) + 1, quantidade: 0 });
  };

  const openEdit = (e: FunilEtapa) => {
    setForm({ id: e.id, funil: e.funil, etapa: e.etapa, icone: e.icone ?? '', ordem: e.ordem, quantidade: e.quantidade });
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form || !form.etapa.trim()) return;
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Funil de Vendas</h2>
          <p className="text-sm text-muted-foreground">
            Lançamento sempre mensal — o trimestre é a <strong>soma</strong> dos meses, não um lançamento à parte.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as FunilView)}
            className="bg-muted/50 rounded-md p-0.5"
          >
            <ToggleGroupItem value="mes" className="h-7 px-3 text-xs">Mês</ToggleGroupItem>
            <ToggleGroupItem value="trimestre" className="h-7 px-3 text-xs">Trimestre</ToggleGroupItem>
          </ToggleGroup>
          <div className="flex items-center gap-2">
            <label htmlFor="funil-mes" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {view === 'mes' ? 'Mês' : 'Trimestre'}
            </label>
            <Input
              id="funil-mes"
              type="month"
              value={mesSel}
              onChange={(e) => e.target.value && setMesSel(e.target.value)}
              className="h-8 w-40 text-xs"
            />
          </div>
        </div>
      </div>

      {view === 'trimestre' && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          {qLabel(qSel)} — soma de {mesesDoTrimestre(qSel).map(ymLabel).join(' + ')}.
          Para lançar quantitativos, volte para a visão <strong>Mês</strong>.
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
                    {escopoLabel}
                  </Badge>
                  {conversao !== null && (
                    <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                      conversão {conversao}%
                    </Badge>
                  )}
                  {canEdit && view === 'mes' && (
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
                <div className="px-2">
                  <FunnelViz etapas={etapas} />
                </div>
              )}

              {canEdit && isManaging && view === 'mes' && (
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
            <ToggleGroupItem value="acumulado" className="h-7 px-3 text-xs">Acumulado</ToggleGroupItem>
          </ToggleGroup>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : histData.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Sem lançamentos ainda — lance quantitativos na visão Mês para o histórico aparecer.
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
                {form?.id ? 'Editar categoria' : 'Nova categoria'} · {form?.funil === 'sdr' ? 'SDR (Geral)' : 'Comercial (Geral)'}
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
                  <label className="block text-xs font-semibold mb-1">Qtd ({ymLabel(mesSel)})</label>
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
