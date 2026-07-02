import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { Filter, Pencil, Trash2, Plus, Loader2 } from 'lucide-react';
import { useComercialFunil, FunilEtapa, FunilKey } from '@/hooks/useComercialFunil';

/** Paleta inspirada no modelo: topo quente → base fria (7 posições). */
const FUNNEL_COLORS = ['#dc2626', '#ea580c', '#84cc16', '#14b8a6', '#0284c7', '#4f46e5', '#9333ea'];

export function funnelColor(index: number, total: number): string {
  if (total <= 1) return FUNNEL_COLORS[0];
  // Distribui a paleta ao longo das etapas (sempre termina no roxo)
  const pos = Math.round((index / (total - 1)) * (FUNNEL_COLORS.length - 1));
  return FUNNEL_COLORS[pos];
}

interface FunnelVizProps {
  etapas: FunilEtapa[];
  compact?: boolean;
  showConversao?: boolean;
}

/** Funil visual em trapézios centralizados (CSS clip-path). */
export function FunnelViz({ etapas, compact = false, showConversao = true }: FunnelVizProps) {
  const total = etapas.length;
  if (total === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma etapa cadastrada.</p>;
  }

  const topQty = etapas[0]?.quantidade ?? 0;
  const MIN_W = 34; // largura % da base
  const widthAt = (i: number) => 100 - ((100 - MIN_W) * i) / total;
  const rowH = compact ? 'h-9' : 'h-14';

  return (
    <div className="w-full select-none">
      {etapas.map((e, i) => {
        const wTop = widthAt(i);
        const wBottom = widthAt(i + 1);
        const xTop = (100 - wTop) / 2;
        const xBottom = (100 - wBottom) / 2;
        const pct = topQty > 0 ? Math.round((e.quantidade / topQty) * 100) : null;
        return (
          <div key={e.id} className={`relative ${rowH} ${compact ? 'mb-0.5' : 'mb-1'}`}>
            <div
              className="absolute inset-0 transition-all"
              style={{
                backgroundColor: funnelColor(i, total),
                clipPath: `polygon(${xTop}% 0, ${100 - xTop}% 0, ${100 - xBottom}% 100%, ${xBottom}% 100%)`,
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center gap-2 px-2">
              <span className={`font-semibold text-white drop-shadow-sm truncate ${compact ? 'text-[11px]' : 'text-sm'}`}>
                {e.icone ? `${e.icone} ` : ''}{e.etapa}
              </span>
              <span className={`font-mono font-bold text-white drop-shadow-sm ${compact ? 'text-[11px]' : 'text-sm'}`}>
                {e.quantidade}
              </span>
              {showConversao && !compact && pct !== null && i > 0 && (
                <span className="text-[10px] font-mono text-white/85 drop-shadow-sm">({pct}%)</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
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

export default function FunilVendasTab({ canEdit = false }: Props) {
  const { sdr, comercial, isLoading, isError, refetch, createEtapa, updateEtapa, deleteEtapa } = useComercialFunil();
  const [managing, setManaging] = useState<FunilKey | null>(null);
  const [form, setForm] = useState<EtapaFormState | null>(null);
  const [saving, setSaving] = useState(false);

  const byFunil = useMemo(() => ({ sdr, comercial }), [sdr, comercial]);

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
      if (form.id) {
        await updateEtapa.mutateAsync({
          id: form.id,
          etapa: form.etapa.trim(),
          icone: form.icone.trim() || null,
          ordem: form.ordem,
          quantidade: form.quantidade,
        });
      } else {
        await createEtapa.mutateAsync({
          funil: form.funil,
          etapa: form.etapa.trim(),
          icone: form.icone.trim() || null,
          ordem: form.ordem,
          quantidade: form.quantidade,
        });
      }
      setForm(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: FunilEtapa) => {
    if (!window.confirm(`Remover a etapa "${e.etapa}" do funil?`)) return;
    await deleteEtapa.mutateAsync(e.id);
  };

  const handleQtyBlur = async (e: FunilEtapa, value: string) => {
    const qty = Math.max(0, parseInt(value, 10) || 0);
    if (qty === e.quantidade) return;
    await updateEtapa.mutateAsync({ id: e.id, quantidade: qty });
  };

  if (isError) return <DashboardEmptyState variant="error" onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Funil de Vendas</h2>
          <p className="text-sm text-muted-foreground">
            Etapas e quantitativos dos funis SDR e Comercial — atualização manual pelo gestor.
          </p>
        </div>
      </div>

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
                  {conversao !== null && (
                    <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                      conversão {conversao}%
                    </Badge>
                  )}
                  {canEdit && (
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
                <FunnelViz etapas={etapas} />
              )}

              {canEdit && isManaging && (
                <div className="border-t pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Etapas · quantidade
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
                          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: funnelColor(i, etapas.length) }}
                        />
                        <span className="flex-1 truncate text-xs">
                          {e.icone ? `${e.icone} ` : ''}{e.etapa}
                        </span>
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
                  <label className="block text-xs font-semibold mb-1">Ícone (emoji)</label>
                  <Input
                    value={form?.icone ?? ''}
                    onChange={(e) => setForm(f => f ? { ...f, icone: e.target.value } : f)}
                    placeholder="💬"
                  />
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
                  <label className="block text-xs font-semibold mb-1">Quantidade</label>
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
