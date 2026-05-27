import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  CartesianGrid, ReferenceLine,
} from "recharts";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface MetasTabProps {
  canViewValues?: boolean;
  showValues?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
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

const META_MENSAL_DEFAULT = 110_000;
const PT_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function brl(value: number, show: boolean): React.ReactNode {
  if (!show) return <span className="font-mono tracking-widest text-muted-foreground">R$ •••</span>;
  return (
    <span className="font-mono">
      {value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
    </span>
  );
}

function pct(realizado: number, meta: number): number {
  if (meta <= 0) return 0;
  return Math.round((realizado / meta) * 1000) / 10;
}

function getMesDate(mes: string): Date | null {
  const m = mes.toLowerCase().match(/^([a-z]{3})-(\d{4})$/);
  if (!m) return null;
  const monthIdx = PT_MONTHS.indexOf(m[1]);
  if (monthIdx === -1) return null;
  return new Date(parseInt(m[2]), monthIdx, 1);
}

function formatYM(ym: string): string {
  const [y, mo] = ym.split("-");
  const idx = parseInt(mo, 10) - 1;
  return `${PT_MONTHS[idx] ?? mo} ${y}`;
}

function getPeriodLabel(dateFrom?: Date, dateTo?: Date): string {
  if (!dateFrom && !dateTo) return "Todo o período";
  const fmt = (d: Date) => `${PT_MONTHS[d.getMonth()]}/${d.getFullYear()}`;
  if (dateFrom && dateTo) {
    const a = fmt(dateFrom), b = fmt(dateTo);
    return a === b ? a : `${a} – ${b}`;
  }
  if (dateFrom) return `a partir de ${fmt(dateFrom)}`;
  return `até ${fmt(dateTo!)}`;
}

// ── Progress bar with overflow extension ──────────────────────────
function ProgressBar({ value, superadaLabel }: { value: number; superadaLabel?: string }) {
  const superada = value >= 100;
  const color = superada ? "#16a34a" : value >= 70 ? "#f59e0b" : "#ef4444";
  const filled = Math.min(value, 100);
  const extensionW = superada ? Math.min((value - 100) * 1.4, 48) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1 h-3 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full transition-all rounded-full"
            style={{ width: `${filled}%`, backgroundColor: color }}
          />
        </div>
        {extensionW > 0 && (
          <div
            className="flex-shrink-0 h-3 rounded-full"
            style={{ width: extensionW, backgroundColor: "#16a34a", opacity: 0.45 }}
          />
        )}
      </div>
      {superada ? (
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
          <span className="text-xs font-semibold text-emerald-600">
            {superadaLabel ?? (value > 100 ? `Meta superada — +${(value - 100).toFixed(1)}% acima` : "Meta atingida")}
          </span>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">
          {filled.toFixed(0)}% atingido · faltam {(100 - filled).toFixed(1)}%
        </span>
      )}
    </div>
  );
}

// ── Small inline bar for table rows ──────────────────────────────
function PctBar({ value }: { value: number }) {
  const capped = Math.min(value, 100);
  const color = value >= 100 ? "#16a34a" : value >= 70 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${capped}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-mono w-12 text-right" style={{ color }}>
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

function CustomTooltipProduto({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]?.payload;
  const pctVal: number = entry?.pctAtingimento ?? 0;
  const metaQty: number = entry?.metaQty ?? 0;
  const realizadoQty: number = entry?.realizadoQty ?? 0;
  const color = pctVal >= 100 ? "#16a34a" : pctVal >= 70 ? "#f59e0b" : "#ef4444";
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md space-y-1">
      <p className="font-medium text-foreground">{entry?.produtoFull ?? label}</p>
      <p className="text-muted-foreground">
        Qtd Meta: <span className="font-mono text-foreground">{metaQty.toLocaleString("pt-BR")}</span>
      </p>
      <p className="text-muted-foreground">
        Qtd Realizada: <span className="font-mono text-foreground">{realizadoQty.toLocaleString("pt-BR")}</span>
      </p>
      <p className="text-muted-foreground">
        Atingimento:{" "}
        <span className="font-mono font-bold" style={{ color }}>
          {pctVal.toFixed(1)}%
        </span>
      </p>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────
const MetasTab: React.FC<MetasTabProps> = ({
  canViewValues = false,
  showValues = false,
  dateFrom,
  dateTo,
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tipoFixoDialog, setTipoFixoDialog] = useState<MetaFormData["tipo"] | undefined>();

  const [copyOpen, setCopyOpen] = useState(false);
  const [copyOrigem, setCopyOrigem] = useState("");
  const [copyDestino, setCopyDestino] = useState("");
  const [copyLoading, setCopyLoading] = useState(false);

  const { data: metas = [], isLoading, isError, refetch } = useComercialMetas();
  const { items: vendasItems, isLoading: vendasLoading } = useComercialVendas();
  const createMeta = useCreateMetaComercial();
  const updateMeta = useUpdateMetaComercial();
  const deleteMeta = useDeleteMetaComercial();

  const currentFormData = editingId ? metas.find((m) => m.id === editingId) : undefined;
  const periodLabel = getPeriodLabel(dateFrom, dateTo);

  // ── Filter metas by page-level period ────────────────────────
  const metasFiltradas = useMemo(() => {
    if (!dateFrom && !dateTo) return metas;
    return metas.filter((meta) => {
      const d = getMesDate(meta.mes);
      if (!d) return false;
      const mesStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const mesEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      if (dateFrom) {
        const fromStart = new Date(dateFrom.getFullYear(), dateFrom.getMonth(), 1);
        if (mesEnd < fromStart) return false;
      }
      if (dateTo) {
        const toEnd = new Date(dateTo.getFullYear(), dateTo.getMonth() + 1, 0);
        if (mesStart > toEnd) return false;
      }
      return true;
    });
  }, [metas, dateFrom, dateTo]);

  // ── Split metas by tipo ───────────────────────────────────────
  const metasProduto = useMemo(
    () => metasFiltradas.filter((m) => m.tipo !== "faturamento"),
    [metasFiltradas]
  );
  const metasFaturamento = useMemo(
    () => metasFiltradas.filter((m) => m.tipo === "faturamento"),
    [metasFiltradas]
  );

  // ── Filter vendas by page-level period ───────────────────────
  const vendasFiltradas = useMemo(() => {
    if (!dateFrom && !dateTo) return vendasItems;
    return vendasItems.filter((item) => {
      const dateStr = item.period_month || item.closed_date;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      const itemMonthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      if (dateFrom) {
        const fromStart = new Date(dateFrom.getFullYear(), dateFrom.getMonth(), 1);
        if (itemMonthStart < fromStart) return false;
      }
      if (dateTo) {
        const toEnd = new Date(dateTo.getFullYear(), dateTo.getMonth() + 1, 0);
        if (d > toEnd) return false;
      }
      return true;
    });
  }, [vendasItems, dateFrom, dateTo]);

  // ── Distinct months count in filtered period ─────────────────
  const numMeses = useMemo(() => {
    const set = new Set<string>();
    for (const m of metasFiltradas) {
      const d = getMesDate(m.mes);
      if (d) set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    for (const v of vendasFiltradas) {
      const pm = v.period_month?.slice(0, 7) || v.closed_date?.slice(0, 7);
      if (pm) set.add(pm);
    }
    return Math.max(1, set.size);
  }, [metasFiltradas, vendasFiltradas]);

  // ── Pillar 1: Meta de Faturamento (combined) ─────────────────
  const faturamentoStats = useMemo(() => {
    const targetCadastrado = metasFaturamento.reduce((s, m) => {
      const raw = m.valor.trim().toLowerCase();
      const v = raw.endsWith("k")
        ? parseFloat(raw.slice(0, -1)) * 1000
        : parseFloat(raw.replace(",", ".")) || 0;
      return s + (Number.isFinite(v) ? v : 0);
    }, 0);
    const target = targetCadastrado > 0 ? targetCadastrado : META_MENSAL_DEFAULT * numMeses;

    const realizadoProdutos = metasProduto.reduce((sum, m) => {
      const qty = parseInt(m.realizado) || 0;
      const vu = parseFloat(m.valor_unitario) || 0;
      return sum + qty * vu;
    }, 0);
    const realizadoVendas = vendasFiltradas.reduce((s, i) => s + (i.deal_value ?? 0), 0);
    const totalRealizado = realizadoProdutos + realizadoVendas;

    const pctAtingimento = target > 0 ? Math.round((totalRealizado / target) * 1000) / 10 : 0;

    // Per-month for mesesBatidos/media (using vendas + produtos)
    const mesMap = new Map<string, number>();
    for (const item of vendasFiltradas) {
      const pm = item.period_month?.slice(0, 7) || item.closed_date?.slice(0, 7);
      if (!pm) continue;
      mesMap.set(pm, (mesMap.get(pm) ?? 0) + (item.deal_value ?? 0));
    }
    for (const m of metasProduto) {
      const d = getMesDate(m.mes);
      if (!d) continue;
      const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const contrib = (parseInt(m.realizado) || 0) * (parseFloat(m.valor_unitario) || 0);
      if (contrib > 0) mesMap.set(pm, (mesMap.get(pm) ?? 0) + contrib);
    }

    const metaMensal = targetCadastrado > 0 ? target / numMeses : META_MENSAL_DEFAULT;
    const comDados = [...mesMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, val]) => {
        const p = Math.round((val / metaMensal) * 1000) / 10;
        return { mes: formatYM(ym), pct: p, atingiu: p >= 100 };
      })
      .filter((m) => m.pct > 0);

    const latest = comDados[comDados.length - 1];
    const mesesBatidos = comDados.filter((m) => m.atingiu).length;
    const media =
      comDados.length > 0
        ? Math.round((comDados.reduce((s, m) => s + m.pct, 0) / comDados.length) * 10) / 10
        : 0;

    return {
      pctAtingimento,
      target,
      totalRealizado,
      realizadoProdutos,
      realizadoVendas,
      latest,
      mesesBatidos,
      total: comDados.length,
      media,
      hasCadastrado: targetCadastrado > 0,
    };
  }, [metasFaturamento, metasProduto, vendasFiltradas, numMeses]);

  // ── Pillar 2: Meta Produtos KPIs ─────────────────────────────
  const kpisProdutos = useMemo(() => {
    const batidas = metasProduto.filter((m) => {
      const metaQty = parseFloat(m.valor) || 0;
      const realizadoQty = parseInt(m.realizado) || 0;
      return metaQty > 0 && realizadoQty >= metaQty;
    }).length;
    const semRealizado = metasProduto.filter(
      (m) => !m.realizado || parseInt(m.realizado) === 0
    ).length;
    const pctBatidas =
      metasProduto.length > 0
        ? Math.round((batidas / metasProduto.length) * 1000) / 10
        : 0;
    return { batidas, semRealizado, pctBatidas, total: metasProduto.length };
  }, [metasProduto]);

  // ── Pillar 3: Venda Produtos ──────────────────────────────────
  const vendaStats = useMemo(() => {
    const count = vendasFiltradas.length;
    const novos = vendasFiltradas.filter(
      (i) =>
        i.observation?.toLowerCase().includes("novo cliente") ||
        i.deal_title?.toLowerCase().includes("novo cliente")
    ).length;
    const totalVal = vendasFiltradas.reduce((s, i) => s + (i.deal_value ?? 0), 0);
    const pctFaturamento =
      faturamentoStats.target > 0
        ? Math.round((totalVal / faturamentoStats.target) * 1000) / 10
        : 0;
    return { count, novos, totalVal, pctFaturamento };
  }, [vendasFiltradas, faturamentoStats.target]);

  // ── Chart: % atingimento por produto ─────────────────────────
  const chartData = useMemo(() => {
    const map = new Map<string, { metaQty: number; realizadoQty: number }>();
    metasProduto.forEach((m) => {
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
  }, [metasProduto]);

  // ── Months available for copy dialog ─────────────────────────
  const mesesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const m of metas) {
      if (m.tipo !== "faturamento") set.add(m.mes);
    }
    return [...set].sort();
  }, [metas]);

  // ── CRUD handlers ─────────────────────────────────────────────
  async function handleSubmit(meta: MetaFormData) {
    try {
      if (editingId) {
        await updateMeta.mutateAsync({ id: editingId, payload: meta });
      } else {
        await createMeta.mutateAsync(meta);
      }
      setEditingId(null);
      setTipoFixoDialog(undefined);
      setDialogOpen(false);
    } catch {
      window.alert("Falha ao salvar meta. Verifique a conexão com o Supabase.");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Excluir esta meta?")) return;
    try {
      await deleteMeta.mutateAsync(id);
      if (editingId === id) {
        setEditingId(null);
        setDialogOpen(false);
      }
    } catch {
      window.alert("Falha ao excluir meta.");
    }
  }

  async function handleStatusChange(id: string, status: MetaFormData["status"]) {
    const base = metas.find((m) => m.id === id);
    if (!base) return;
    try {
      await updateMeta.mutateAsync({ id, payload: { ...base, status } });
    } catch {
      window.alert("Falha ao atualizar status da meta.");
    }
  }

  async function handleCopyMetas() {
    if (!copyOrigem || !copyDestino) return;
    const mesDestinoNorm = copyDestino.trim().toLowerCase();
    const metasParaCopiar = metas.filter(
      (m) => m.mes === copyOrigem.trim().toLowerCase() && m.tipo !== "faturamento"
    );
    if (metasParaCopiar.length === 0) {
      window.alert("Nenhuma meta de produto encontrada no período de origem.");
      return;
    }
    setCopyLoading(true);
    try {
      for (const meta of metasParaCopiar) {
        await createMeta.mutateAsync({
          nome_indicador: meta.nome_indicador,
          tipo: meta.tipo,
          status: meta.status,
          mes: mesDestinoNorm,
          valor: meta.valor,
          realizado: "",
          valor_unitario: meta.valor_unitario,
          observacao: meta.observacao,
          data_inicio_meta: "",
          data_fim_meta: "",
        });
      }
      setCopyOpen(false);
      setCopyOrigem("");
      setCopyDestino("");
    } catch {
      window.alert("Erro ao copiar metas.");
    } finally {
      setCopyLoading(false);
    }
  }

  function openCreateDialog(tipoFixo?: MetaFormData["tipo"]) {
    setEditingId(null);
    setTipoFixoDialog(tipoFixo);
    setDialogOpen(true);
  }

  function openEditDialog(id: string) {
    setEditingId(id);
    setTipoFixoDialog(undefined);
    setDialogOpen(true);
  }

  const faturamentoPct = faturamentoStats.pctAtingimento;

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Metas Comerciais</h2>
          <p className="text-sm text-muted-foreground">
            Acompanhamento por produto e faturamento · {periodLabel}
          </p>
        </div>
        <div className="flex gap-2">
          {canViewValues && (
            <Button variant="outline" size="sm" onClick={() => setCopyOpen(true)}>
              Copiar período
            </Button>
          )}
          <Button variant="default" onClick={() => openCreateDialog()}>
            + Nova Meta
          </Button>
        </div>
      </div>

      {isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 text-destructive px-3 py-2 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Não foi possível carregar metas.
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 ml-1 text-destructive"
            onClick={() => refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      )}

      {/* ── Três pilares ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Pillar 1 — Meta de Faturamento */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-semibold">Meta de Faturamento</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {faturamentoStats.hasCadastrado
                    ? "Target cadastrado · Meta Produtos + Venda Produtos"
                    : `Referência: R$ ${(META_MENSAL_DEFAULT / 1000).toFixed(0)}K/mês (padrão)`}
                </p>
              </div>
              {canViewValues && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs whitespace-nowrap flex-shrink-0"
                  onClick={() => openCreateDialog("faturamento")}
                >
                  Definir meta
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {vendasLoading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-end justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {faturamentoStats.latest?.mes ?? periodLabel}
                    </span>
                    <span
                      className="text-3xl font-bold font-mono"
                      style={{
                        color:
                          faturamentoPct >= 100 ? "#16a34a" : faturamentoPct >= 70 ? "#f59e0b" : "#ef4444",
                      }}
                    >
                      {faturamentoPct.toFixed(1)}%
                    </span>
                  </div>
                  <ProgressBar value={faturamentoPct} />
                </div>

                {canViewValues && (
                  <div className="space-y-1 pt-1 text-xs text-muted-foreground border-t">
                    <div className="flex justify-between pt-1">
                      <span>Target período</span>
                      <span>{brl(faturamentoStats.target, showValues)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Realizado Meta Produtos</span>
                      <span>{brl(faturamentoStats.realizadoProdutos, showValues)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Realizado Venda Produtos</span>
                      <span>{brl(faturamentoStats.realizadoVendas, showValues)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-foreground border-t pt-1">
                      <span>Total realizado</span>
                      <span>{brl(faturamentoStats.totalRealizado, showValues)}</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Meses na meta
                    </p>
                    <p className="text-xl font-bold text-foreground mt-1">
                      {faturamentoStats.mesesBatidos}/{faturamentoStats.total}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Média mensal
                    </p>
                    <p className="text-xl font-bold text-foreground mt-1">
                      {faturamentoStats.media.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Pillar 2 — Meta Produtos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Meta Produtos</CardTitle>
            <p className="text-xs text-muted-foreground">Acompanhamento por quantidade</p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-4">Carregando...</p>
            ) : metasProduto.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                {metas.length === 0
                  ? "Nenhuma meta cadastrada."
                  : "Sem metas no período selecionado."}
              </p>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-end justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      % Metas Batidas
                    </span>
                    <span
                      className="text-3xl font-bold font-mono"
                      style={{
                        color:
                          kpisProdutos.pctBatidas >= 100
                            ? "#16a34a"
                            : kpisProdutos.pctBatidas >= 50
                            ? "#f59e0b"
                            : "#ef4444",
                      }}
                    >
                      {kpisProdutos.pctBatidas.toFixed(0)}%
                    </span>
                  </div>
                  <ProgressBar value={kpisProdutos.pctBatidas} superadaLabel="Todas as metas atingidas" />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Produtos
                    </p>
                    <p className="text-xl font-bold text-foreground mt-1">{kpisProdutos.total}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Metas batidas
                    </p>
                    <p
                      className="text-xl font-bold mt-1"
                      style={{
                        color:
                          kpisProdutos.batidas === kpisProdutos.total && kpisProdutos.total > 0
                            ? "#16a34a"
                            : kpisProdutos.batidas > 0
                            ? "#f59e0b"
                            : "#ef4444",
                      }}
                    >
                      {kpisProdutos.batidas}/{kpisProdutos.total}
                    </p>
                  </div>
                  <div className="col-span-2 rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Sem realizado
                    </p>
                    <p
                      className="text-xl font-bold mt-1"
                      style={{ color: kpisProdutos.semRealizado > 0 ? "#f59e0b" : "#16a34a" }}
                    >
                      {kpisProdutos.semRealizado} produto
                      {kpisProdutos.semRealizado !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pillar 3 — Venda Produtos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Venda Produtos</CardTitle>
            <p className="text-xs text-muted-foreground">Negócios fechados no período</p>
          </CardHeader>
          <CardContent>
            {vendasLoading ? (
              <p className="text-sm text-muted-foreground py-4">Carregando...</p>
            ) : vendaStats.count === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Sem vendas no período.</p>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-end justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Contribuição Faturamento
                    </span>
                    <span
                      className="text-3xl font-bold font-mono"
                      style={{
                        color:
                          vendaStats.pctFaturamento >= 100
                            ? "#16a34a"
                            : vendaStats.pctFaturamento >= 70
                            ? "#f59e0b"
                            : "#ef4444",
                      }}
                    >
                      {vendaStats.pctFaturamento.toFixed(1)}%
                    </span>
                  </div>
                  <ProgressBar value={vendaStats.pctFaturamento} />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Negócios
                    </p>
                    <p className="text-xl font-bold text-foreground mt-1">{vendaStats.count}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Novos clientes
                    </p>
                    <p
                      className="text-xl font-bold mt-1"
                      style={{ color: vendaStats.novos > 0 ? "#16a34a" : "inherit" }}
                    >
                      {vendaStats.novos}
                    </p>
                  </div>
                  {canViewValues && (
                    <div className="col-span-2 rounded-lg border bg-muted/30 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Total negócios
                      </p>
                      <p className="text-xl font-bold text-foreground mt-1">
                        {brl(vendaStats.totalVal, showValues)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Gráfico % atingimento por produto ─────────────────── */}
      {!isLoading && chartData.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-1">
            Meta vs Realizado por Produto — {periodLabel}
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            % de atingimento por produto no período
          </p>
          <div style={{ height: Math.max(180, chartData.length * 52) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ left: 10, right: 40, top: 4, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  type="number"
                  domain={[
                    0,
                    Math.max(120, ...chartData.map((d) => Math.ceil(d.pctAtingimento / 10) * 10)),
                  ]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="produto"
                  width={150}
                  tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }}
                />
                <Tooltip content={<CustomTooltipProduto />} />
                <ReferenceLine
                  x={100}
                  stroke="#16a34a"
                  strokeDasharray="4 4"
                  label={{
                    value: "100%",
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: "#16a34a",
                    dy: -4,
                  }}
                />
                <Bar dataKey="pctAtingimento" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        entry.pctAtingimento >= 100
                          ? "#16a34a"
                          : entry.pctAtingimento >= 70
                          ? "#f59e0b"
                          : "#ef4444"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* ── Tabela Meta Produtos ──────────────────────────────── */}
      {!isLoading && metasProduto.length > 0 && (
        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold">Meta Produtos — {periodLabel}</h3>
            <p className="text-xs text-muted-foreground">
              {metasProduto.length} produto{metasProduto.length !== 1 ? "s" : ""} no período
            </p>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-muted border-b">
                  <th className="px-3 py-2 text-left font-semibold">Produto</th>
                  <th className="px-3 py-2 text-left font-semibold">Mês</th>
                  <th className="px-3 py-2 text-center font-semibold">
                    Qtd Meta
                    <span className="block text-[10px] font-normal text-muted-foreground">unidades</span>
                  </th>
                  <th className="px-3 py-2 text-center font-semibold">
                    Qtd Realizada
                    <span className="block text-[10px] font-normal text-muted-foreground">unidades</span>
                  </th>
                  {canViewValues && (
                    <>
                      <th className="px-3 py-2 text-right font-semibold">
                        Vr. Unit.
                        <span className="block text-[10px] font-normal text-muted-foreground">R$/unid</span>
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Meta Valor
                        <span className="block text-[10px] font-normal text-muted-foreground">R$ total</span>
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Realiz. Valor
                        <span className="block text-[10px] font-normal text-muted-foreground">R$ total</span>
                      </th>
                    </>
                  )}
                  <th className="px-3 py-2 text-left font-semibold min-w-[150px]">% Atingimento</th>
                  <th className="px-3 py-2 text-left font-semibold min-w-[200px]">Status</th>
                  <th className="px-3 py-2 text-left font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {metasProduto.map((meta) => {
                  const metaQty = parseFloat(meta.valor) || 0;
                  const realizadoQty = parseInt(meta.realizado) || 0;
                  const vu = parseFloat(meta.valor_unitario) || 0;
                  const metaValor = metaQty * vu;
                  const realizadoValor = realizadoQty * vu;
                  const p = pct(realizadoQty, metaQty);
                  const hasQty = vu > 0;

                  return (
                    <tr key={meta.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 font-medium max-w-[220px]">
                        <span title={meta.nome_indicador} className="block truncate">
                          {meta.nome_indicador}
                        </span>
                        {meta.observacao && (
                          <span className="text-xs text-muted-foreground block truncate">
                            {meta.observacao}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground font-mono whitespace-nowrap">
                        {meta.mes}
                      </td>

                      <td className="px-3 py-2 text-center font-mono">
                        {hasQty ? (
                          metaQty > 0 ? metaQty.toLocaleString("pt-BR") : "—"
                        ) : (
                          <span className="text-xs text-muted-foreground" title="Produto por valor total">
                            —
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2 text-center font-mono">
                        {hasQty && meta.realizado ? (
                          <span
                            style={{ color: p >= 100 ? "#16a34a" : p >= 70 ? "#f59e0b" : "#ef4444" }}
                          >
                            {realizadoQty.toLocaleString("pt-BR")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {canViewValues && (
                        <>
                          <td className="px-3 py-2 text-right text-xs">
                            {vu > 0 ? brl(vu, showValues) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-xs">
                            {metaValor > 0 ? brl(metaValor, showValues) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-xs">
                            {realizadoValor > 0 ? brl(realizadoValor, showValues) : "—"}
                          </td>
                        </>
                      )}

                      <td className="px-3 py-2">
                        {metaQty > 0 && meta.realizado ? (
                          <PctBar value={p} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      <td className="px-3 py-2 min-w-[200px]">
                        <Select
                          value={meta.status}
                          onValueChange={(v) =>
                            handleStatusChange(meta.id, v as MetaFormData["status"])
                          }
                        >
                          <SelectTrigger
                            className="h-7 text-xs"
                            style={{ borderColor: STATUS_COLORS[meta.status] + "60" }}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(STATUS_LABELS) as MetaFormData["status"][]).map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">
                                {STATUS_LABELS[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() => openEditDialog(meta.id)}
                          >
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(meta.id)}
                          >
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
        </div>
      )}

      {!isLoading && metas.length === 0 && !isError && (
        <div className="rounded-lg border border-dashed flex flex-col items-center justify-center py-12 text-center gap-2">
          <p className="text-muted-foreground text-sm">Nenhuma meta cadastrada.</p>
          <Button variant="outline" size="sm" onClick={() => openCreateDialog()}>
            + Cadastrar primeira meta
          </Button>
        </div>
      )}

      {/* ── Tabela Venda Produtos ─────────────────────────────── */}
      {!vendasLoading && vendasFiltradas.length > 0 && (
        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold">Venda Produtos — {periodLabel}</h3>
            <p className="text-xs text-muted-foreground">
              {vendasFiltradas.length} negócio{vendasFiltradas.length !== 1 ? "s" : ""} fechado
              {vendasFiltradas.length !== 1 ? "s" : ""} no período
            </p>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-muted border-b">
                  <th className="px-3 py-2 text-left font-semibold">Produto / Projeto / Demanda</th>
                  <th className="px-3 py-2 text-left font-semibold">Cliente</th>
                  <th className="px-3 py-2 text-left font-semibold">Observação</th>
                  {canViewValues && (
                    <th className="px-3 py-2 text-right font-semibold">Valor</th>
                  )}
                  <th className="px-3 py-2 text-left font-semibold">Data Fechamento</th>
                </tr>
              </thead>
              <tbody>
                {vendasFiltradas.map((venda) => (
                  <tr key={venda.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-medium max-w-[280px]">
                      <span title={venda.deal_title ?? ""} className="block truncate">
                        {venda.deal_title || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {venda.organization ? (
                        <Badge variant="outline" className="text-xs">
                          {venda.organization}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                      {venda.observation || "—"}
                    </td>
                    {canViewValues && (
                      <td className="px-3 py-2 text-right text-xs">
                        {venda.deal_value != null ? brl(venda.deal_value, showValues) : "—"}
                      </td>
                    )}
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {venda.closed_date
                        ? new Date(venda.closed_date).toLocaleDateString("pt-BR")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Dialog: Copiar período ────────────────────────────── */}
      <Dialog open={copyOpen} onOpenChange={(o) => { if (!o) setCopyOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copiar Metas de Produto</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Copia todas as metas de produto de um mês para outro, zerando o realizado.
          </p>
          <div className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-semibold mb-1">Mês de origem</label>
              {mesesDisponiveis.length > 0 ? (
                <Select value={copyOrigem} onValueChange={setCopyOrigem}>
                  <SelectTrigger><SelectValue placeholder="Selecione o mês" /></SelectTrigger>
                  <SelectContent>
                    {mesesDisponiveis.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="Ex: jan-2026"
                  value={copyOrigem}
                  onChange={(e) => setCopyOrigem(e.target.value)}
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Mês de destino</label>
              <Input
                placeholder="Ex: abr-2026"
                value={copyDestino}
                onChange={(e) => setCopyDestino(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">Formato: mmm-AAAA (ex: abr-2026)</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCopyOpen(false)} disabled={copyLoading}>
              Cancelar
            </Button>
            <Button
              variant="default"
              onClick={handleCopyMetas}
              disabled={!copyOrigem || !copyDestino || copyLoading}
            >
              {copyLoading ? "Copiando..." : "Copiar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MetasFormDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingId(null);
          setTipoFixoDialog(undefined);
        }}
        onSubmit={handleSubmit}
        initialData={currentFormData}
        mode={editingId ? "edit" : "create"}
        tipoFixo={tipoFixoDialog}
      />
    </div>
  );
};

export default MetasTab;
