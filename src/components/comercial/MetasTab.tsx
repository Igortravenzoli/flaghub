import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetasFormDialog, MetaFormData } from "./MetasFormDialog";
import {
  useComercialMetas,
  useCreateMetaComercial,
  useUpdateMetaComercial,
  useDeleteMetaComercial,
} from "@/hooks/useComercialMetas";
import { useComercialVendas } from "@/hooks/useComercialVendas";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  CartesianGrid, ReferenceLine, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";

interface MetasTabProps {
  canViewValues?: boolean;
  showValues?: boolean;
}

const QUARTER_MONTHS: Record<string, number[]> = {
  Q1: [1, 2, 3],
  Q2: [4, 5, 6],
  Q3: [7, 8, 9],
  Q4: [10, 11, 12],
};

function getMesNumero(mes: string): number | null {
  const m = mes.toLowerCase();
  const isoMatch = m.match(/\d{4}-(\d{2})/);
  if (isoMatch) return parseInt(isoMatch[1], 10);
  const PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  for (let i = 0; i < PT.length; i++) {
    if (m.startsWith(PT[i])) return i + 1;
  }
  return null;
}

const STATUS_LABELS: Record<MetaFormData["status"], string> = {
  ativo: "Ativo",
  em_lancamento: "Em Lançamento",
  batido_meta: "Meta Batida",
  nao_batido: "Meta Não Batida",
};

const STATUS_COLORS: Record<MetaFormData["status"], string> = {
  ativo: "#0ea5e9",
  em_lancamento: "#f59e0b",
  batido_meta: "#16a34a",
  nao_batido: "#ef4444",
};

function pct(realizado: number, meta: number): number {
  if (meta <= 0) return 0;
  return Math.round((realizado / meta) * 1000) / 10;
}

function PctBar({ value, className }: { value: number; className?: string }) {
  const capped = Math.min(value, 100);
  const color = value >= 100 ? "#16a34a" : value >= 70 ? "#f59e0b" : "#ef4444";
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${capped}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-mono w-12 text-right" style={{ color }}>{value.toFixed(1)}%</span>
    </div>
  );
}

function CustomTooltipProduto({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const meta = payload.find((p: any) => p.dataKey === "metaQty")?.value ?? 0;
  const realizado = payload.find((p: any) => p.dataKey === "realizadoQty")?.value ?? 0;
  const p = pct(realizado, meta);
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md space-y-1">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-muted-foreground">Meta: <span className="font-mono text-foreground">{meta}</span></p>
      <p className="text-muted-foreground">Realizado: <span className="font-mono text-foreground">{realizado}</span></p>
      <p className="text-muted-foreground">Atingimento: <span className="font-mono" style={{ color: p >= 100 ? "#16a34a" : p >= 70 ? "#f59e0b" : "#ef4444" }}>{p.toFixed(1)}%</span></p>
    </div>
  );
}

const MetasTab: React.FC<MetasTabProps> = ({ canViewValues = false, showValues = false }) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedMes, setSelectedMes] = useState<string>("");

  const { data: metas = [], isLoading, isError, refetch } = useComercialMetas();
  const { stats: vendasStats, isLoading: vendasLoading } = useComercialVendas();
  const createMeta = useCreateMetaComercial();
  const updateMeta = useUpdateMetaComercial();
  const deleteMeta = useDeleteMetaComercial();

  const currentFormData = editingId ? metas.find((m) => m.id === editingId) : undefined;

  // Derive available months and default to latest
  const meses = useMemo(() => {
    const unique = [...new Set(metas.map(m => m.mes))].sort();
    return unique;
  }, [metas]);

  const activeMes = selectedMes || meses[meses.length - 1] || "";

  // Metas for selected month or quarter
  const metasMes = useMemo(() => {
    if (!activeMes) return [];
    const quarterMonths = QUARTER_MONTHS[activeMes];
    if (quarterMonths) {
      return metas.filter(m => {
        const n = getMesNumero(m.mes);
        return n !== null && quarterMonths.includes(n);
      });
    }
    return metas.filter(m => m.mes === activeMes);
  }, [metas, activeMes]);

  const isQuarterView = activeMes.startsWith('Q');

  // Chart data: aggregate by product name (sum across months when quarter selected)
  const chartData = useMemo(() => {
    const map = new Map<string, { metaQty: number; realizadoQty: number }>();
    metasMes.forEach(m => {
      const key = m.nome_indicador;
      const cur = map.get(key) ?? { metaQty: 0, realizadoQty: 0 };
      map.set(key, {
        metaQty: cur.metaQty + (parseFloat(m.valor) || 0),
        realizadoQty: cur.realizadoQty + (parseInt(m.realizado) || 0),
      });
    });
    return Array.from(map.entries()).map(([nome, { metaQty, realizadoQty }]) => ({
      produto: nome.length > 24 ? nome.slice(0, 24) + "…" : nome,
      produtoFull: nome,
      metaQty,
      realizadoQty,
      pctAtingimento: pct(realizadoQty, metaQty),
    }));
  }, [metasMes]);

  // Aggregated KPIs for selected month
  const kpisMes = useMemo(() => {
    const batidas = metasMes.filter(m => {
      const metaQty = parseFloat(m.valor) || 0;
      const realizadoQty = parseInt(m.realizado) || 0;
      return metaQty > 0 && realizadoQty >= metaQty;
    }).length;
    const semRealizado = metasMes.filter(m => !m.realizado || parseInt(m.realizado) === 0).length;
    const pctBatidas = metasMes.length > 0 ? Math.round((batidas / metasMes.length) * 1000) / 10 : 0;
    // R$ total: if produto has unit price → qty × vu; else valor_meta IS the R$ value directly
    const totalR$ = canViewValues
      ? metasMes.reduce((s, m) => {
          const qty = parseFloat(m.valor) || 0;
          const vu = parseFloat(m.valor_unitario) || 0;
          return s + (vu > 0 ? qty * vu : qty);
        }, 0)
      : null;
    const realizadoR$ = canViewValues
      ? metasMes.reduce((s, m) => {
          const qty = parseInt(m.realizado) || 0;
          const vu = parseFloat(m.valor_unitario) || 0;
          return s + (vu > 0 ? qty * vu : qty);
        }, 0)
      : null;
    return { batidas, semRealizado, pctBatidas, totalR$, realizadoR$, total: metasMes.length };
  }, [metasMes, canViewValues]);

  // Meta Faturamento: from PipeDrive stats (latest month with data)
  const faturamentoStats = useMemo(() => {
    const comDados = vendasStats.vendasPorMes.filter(m => m.percentualMeta > 0);
    const latest = comDados[comDados.length - 1];
    const mesesBatidos = comDados.filter(m => m.atingiuMeta).length;
    return { latest, mesesBatidos, total: comDados.length };
  }, [vendasStats]);

  async function handleSubmit(meta: MetaFormData) {
    try {
      if (editingId) {
        await updateMeta.mutateAsync({ id: editingId, payload: meta });
      } else {
        await createMeta.mutateAsync(meta);
      }
      setEditingId(null);
      setDialogOpen(false);
    } catch {
      window.alert('Falha ao salvar meta. Verifique a conexão com o Supabase.');
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Excluir esta meta?')) return;
    try {
      await deleteMeta.mutateAsync(id);
      if (editingId === id) { setEditingId(null); setDialogOpen(false); }
    } catch {
      window.alert('Falha ao excluir meta.');
    }
  }

  async function handleStatusChange(id: string, status: MetaFormData["status"]) {
    const base = metas.find((m) => m.id === id);
    if (!base) return;
    try {
      await updateMeta.mutateAsync({ id, payload: { ...base, status } });
    } catch {
      window.alert('Falha ao atualizar status da meta.');
    }
  }

  function openCreateDialog() { setEditingId(null); setDialogOpen(true); }
  function openEditDialog(id: string) { setEditingId(id); setDialogOpen(true); }

  const faturamentoPct = faturamentoStats.latest?.percentualMeta ?? 0;
  const faturamentoCor = faturamentoPct >= 100 ? "#16a34a" : faturamentoPct >= 70 ? "#f59e0b" : "#ef4444";

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Metas Comerciais</h2>
          <p className="text-sm text-muted-foreground">Acompanhamento por produto e faturamento</p>
        </div>
        <Button variant="default" onClick={openCreateDialog}>+ Nova Meta</Button>
      </div>

      {isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 text-destructive px-3 py-2 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Não foi possível carregar metas.
          <Button type="button" variant="link" className="h-auto p-0 ml-1 text-destructive" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {/* ── Pillar 1: Meta Faturamento ────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_2fr] gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Meta de Faturamento</CardTitle>
            <p className="text-xs text-muted-foreground">Referência: R$ 110K mensal (PipeDrive)</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {vendasLoading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : !faturamentoStats.latest ? (
              <p className="text-sm text-muted-foreground">Sem fechamentos registrados.</p>
            ) : (
              <>
                <div className="space-y-1">
                  <div className="flex items-end justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {faturamentoStats.latest.mes}
                    </span>
                    <span className="text-3xl font-bold font-mono" style={{ color: faturamentoCor }}>
                      {faturamentoPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(faturamentoPct, 100)}%`, backgroundColor: faturamentoCor }}
                    />
                  </div>
                  {canViewValues && (
                    <p className="text-xs text-muted-foreground text-right">
                      {showValues
                        ? `R$ ${(faturamentoPct / 100 * 110000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} / R$ 110.000`
                        : <span className="font-mono tracking-widest">R$ ••• / R$ •••</span>
                      }
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Meses na meta</p>
                    <p className="text-xl font-bold text-foreground mt-1">{faturamentoStats.mesesBatidos}/{faturamentoStats.total}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Média mensal</p>
                    <p className="text-xl font-bold text-foreground mt-1">
                      {faturamentoStats.total > 0
                        ? (vendasStats.vendasPorMes.filter(m => m.percentualMeta > 0).reduce((s, m) => s + m.percentualMeta, 0) / faturamentoStats.total).toFixed(1)
                        : '0'}%
                    </p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Pillar 2 header KPIs ────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Meta Produto</CardTitle>
                <p className="text-xs text-muted-foreground">Acompanhamento por quantidade</p>
              </div>
              {meses.length > 0 && (
                <Select value={activeMes} onValueChange={setSelectedMes}>
                  <SelectTrigger className="w-[155px] h-8 text-xs">
                    <SelectValue placeholder="Mês / Trimestre" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Q1" className="text-xs font-medium">1º Tri — Jan/Fev/Mar</SelectItem>
                    <SelectItem value="Q2" className="text-xs font-medium">2º Tri — Abr/Mai/Jun</SelectItem>
                    <SelectItem value="Q3" className="text-xs font-medium">3º Tri — Jul/Ago/Set</SelectItem>
                    <SelectItem value="Q4" className="text-xs font-medium">4º Tri — Out/Nov/Dez</SelectItem>
                    {meses.map(m => (
                      <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-4">Carregando...</p>
            ) : metasMes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                {meses.length === 0 ? 'Nenhuma meta cadastrada.' : `Sem metas para ${activeMes}.`}
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border bg-muted/30 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Produtos</p>
                  <p className="text-xl font-bold text-foreground mt-1">{kpisMes.total}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Metas batidas</p>
                  <p className="text-xl font-bold mt-1" style={{ color: kpisMes.batidas === kpisMes.total && kpisMes.total > 0 ? "#16a34a" : kpisMes.batidas > 0 ? "#f59e0b" : "#ef4444" }}>
                    {kpisMes.batidas}/{kpisMes.total}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">% Batidas</p>
                  <p className="text-xl font-bold mt-1" style={{ color: kpisMes.pctBatidas >= 100 ? "#16a34a" : kpisMes.pctBatidas >= 50 ? "#f59e0b" : "#ef4444" }}>
                    {kpisMes.pctBatidas.toFixed(0)}%
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Sem realizado</p>
                  <p className="text-xl font-bold mt-1" style={{ color: kpisMes.semRealizado > 0 ? "#f59e0b" : "#16a34a" }}>
                    {kpisMes.semRealizado}
                  </p>
                </div>
                {canViewValues && kpisMes.totalR$ !== null && (
                  <>
                    <div className="col-span-2 rounded-lg border bg-muted/30 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">R$ Meta Produtos</p>
                      <p className="text-xl font-bold text-foreground mt-1 font-mono">
                        {showValues
                          ? `R$ ${kpisMes.totalR$!.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                          : <span className="tracking-widest text-muted-foreground">R$ •••</span>
                        }
                      </p>
                    </div>
                    <div className="col-span-2 rounded-lg border bg-muted/30 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">R$ Realizado Produtos</p>
                      <p className="text-xl font-bold mt-1 font-mono" style={{ color: pct(kpisMes.realizadoR$ ?? 0, kpisMes.totalR$ ?? 1) >= 100 ? "#16a34a" : "#f59e0b" }}>
                        {showValues
                          ? `R$ ${(kpisMes.realizadoR$ ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                          : <span className="tracking-widest text-muted-foreground">R$ •••</span>
                        }
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Bar chart: Meta vs Realizado por Produto ─────────── */}
      {!isLoading && chartData.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-1">
            Meta vs Realizado por Produto —{' '}
            {isQuarterView ? `${activeMes[1]}º Trimestre` : activeMes}
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            {isQuarterView ? 'Valores acumulados no trimestre por produto' : 'Quantidade de unidades por produto'}
          </p>
          <div style={{ height: Math.max(180, chartData.length * 52) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ left: 10, right: 40, top: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="produto"
                  width={140}
                  tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }}
                />
                <Tooltip content={<CustomTooltipProduto />} />
                <Legend
                  verticalAlign="top"
                  formatter={(value) => value === 'metaQty' ? 'Meta' : 'Realizado'}
                />
                <Bar dataKey="metaQty" name="metaQty" fill="hsl(var(--muted-foreground))" opacity={0.4} radius={[0, 4, 4, 0]} maxBarSize={18} />
                <Bar dataKey="realizadoQty" name="realizadoQty" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {chartData.map((entry, i) => {
                    const color = entry.pctAtingimento >= 100 ? "#16a34a" : entry.pctAtingimento >= 70 ? "#f59e0b" : "#ef4444";
                    return <Cell key={i} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* ── Product table ─────────────────────────────────────── */}
      {!isLoading && metas.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-muted border-b">
                <th className="px-3 py-2 text-left font-semibold">Produto</th>
                <th className="px-3 py-2 text-left font-semibold">Mês</th>
                <th className="px-3 py-2 text-center font-semibold">Meta Qtd</th>
                {canViewValues && <th className="px-3 py-2 text-right font-semibold">V. Unit</th>}
                {canViewValues && <th className="px-3 py-2 text-right font-semibold">Meta Valor</th>}
                <th className="px-3 py-2 text-center font-semibold">Realizado</th>
                <th className="px-3 py-2 text-left font-semibold min-w-[150px]">% Atingimento</th>
                <th className="px-3 py-2 text-left font-semibold min-w-[200px]">Status</th>
                <th className="px-3 py-2 text-left font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {metas.map((meta) => {
                const metaQty = parseFloat(meta.valor) || 0;
                const realizadoQty = parseInt(meta.realizado) || 0;
                const p = pct(realizadoQty, metaQty);
                const vu = parseFloat(meta.valor_unitario) || 0;
                const metaValor = vu > 0 ? metaQty * vu : metaQty;
                const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

                return (
                  <tr key={meta.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-medium max-w-[220px]">
                      <span title={meta.nome_indicador} className="block truncate">{meta.nome_indicador}</span>
                      {meta.observacao && (
                        <span className="text-xs text-muted-foreground block truncate">{meta.observacao}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground font-mono whitespace-nowrap">{meta.mes}</td>

                    {/* Meta Qtd — sempre visível, é quantidade não valor financeiro */}
                    <td className="px-3 py-2 text-center font-mono">
                      {metaQty > 0 ? metaQty.toLocaleString('pt-BR') : '—'}
                    </td>

                    {/* V. Unit — proprietário + ocultar valores */}
                    {canViewValues && (
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {vu > 0
                          ? showValues
                            ? brl(vu)
                            : <span className="text-muted-foreground tracking-widest">R$ •••</span>
                          : <span className="text-muted-foreground">—</span>
                        }
                      </td>
                    )}

                    {/* Meta Valor (qtd × vu, ou qtd direto se sem preço unitário) — proprietário + ocultar */}
                    {canViewValues && (
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {metaQty > 0
                          ? showValues
                            ? brl(metaValor)
                            : <span className="text-muted-foreground tracking-widest">R$ •••</span>
                          : <span className="text-muted-foreground">—</span>
                        }
                      </td>
                    )}

                    {/* Realizado Qtd */}
                    <td className="px-3 py-2 text-center font-mono">
                      {meta.realizado ? (
                        <span style={{ color: p >= 100 ? "#16a34a" : p >= 70 ? "#f59e0b" : "#ef4444" }}>
                          {realizadoQty.toLocaleString('pt-BR')}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* % Atingimento — sempre visível (percentual não é dado financeiro) */}
                    <td className="px-3 py-2">
                      {metaQty > 0 && meta.realizado ? (
                        <PctBar value={p} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="px-3 py-2 min-w-[200px]">
                      <Select value={meta.status} onValueChange={(v) => handleStatusChange(meta.id, v as MetaFormData["status"])}>
                        <SelectTrigger className="h-7 text-xs" style={{ borderColor: STATUS_COLORS[meta.status] + '60' }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(STATUS_LABELS) as MetaFormData["status"][]).map(s => (
                            <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => openEditDialog(meta.id)}>
                          Editar
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2 text-destructive hover:text-destructive" onClick={() => handleDelete(meta.id)}>
                          ✕
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && metas.length === 0 && !isError && (
        <div className="rounded-lg border border-dashed flex flex-col items-center justify-center py-12 text-center gap-2">
          <p className="text-muted-foreground text-sm">Nenhuma meta cadastrada.</p>
          <Button variant="outline" size="sm" onClick={openCreateDialog}>+ Cadastrar primeira meta</Button>
        </div>
      )}

      <MetasFormDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingId(null); }}
        onSubmit={handleSubmit}
        initialData={currentFormData}
        mode={editingId ? "edit" : "create"}
      />
    </div>
  );
};

export default MetasTab;
