import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MetasFormDialog, MetaFormData } from "./MetasFormDialog";
import { VendaFormDialog } from "./VendaFormDialog";
import {
  useComercialMetas,
  useCreateMetaComercial,
  useUpdateMetaComercial,
  useDeleteMetaComercial,
} from "@/hooks/useComercialMetas";
import {
  useComercialVendas,
  useCreateVenda,
  useUpdateVenda,
  useDeleteVenda,
  type VendaFormData,
} from "@/hooks/useComercialVendas";
import { useComercialMovimentacaoManual } from "@/hooks/useComercialMovimentacaoManual";
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, AreaChart, Area,
} from "recharts";
import { AlertTriangle, CheckCircle2, ChevronDown, Filter } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

// ── Filtro de coluna (ícone + popover multi-seleção) ─────────────
function ColumnFilterButton({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label?: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const active = selected.size > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex h-5 w-5 items-center justify-center rounded transition-colors align-middle
            ${active ? "text-primary bg-primary/10" : "text-muted-foreground/60 hover:text-foreground hover:bg-muted"}`}
          title="Filtrar coluna"
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {options.map((o) => {
            const isOn = selected.has(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  const next = new Set(selected);
                  if (isOn) next.delete(o.value);
                  else next.add(o.value);
                  onChange(next);
                }}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-xs text-left transition-colors hover:bg-muted
                  ${isOn ? "font-medium" : ""}`}
              >
                <span
                  className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border text-[9px] leading-none flex-shrink-0
                    ${isOn ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}
                >
                  {isOn ? "✓" : ""}
                </span>
                <span className="truncate">{o.label ?? o.value}</span>
              </button>
            );
          })}
        </div>
        {active && (
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="mt-1.5 w-full border-t pt-1.5 text-center text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Limpar filtro
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function WaveTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const colorFor = (p: number) => (p >= 100 ? "#16a34a" : p >= 70 ? "#f59e0b" : "#ef4444");
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md space-y-1">
      <p className="font-medium text-foreground">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-muted-foreground flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}:{" "}
          <span className="font-mono font-semibold" style={{ color: colorFor(p.value) }}>
            {Number(p.value).toFixed(1)}%
          </span>
        </p>
      ))}
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

  // ── Venda Produtos CRUD state ─────────────────────────────────
  const [vendaDialogOpen, setVendaDialogOpen] = useState(false);
  const [editingVendaId, setEditingVendaId] = useState<string | null>(null);

  // ── Histograma de ondas: visão mensal/trimestral ─────────────
  const [waveView, setWaveView] = useState<"mensal" | "trimestral">("mensal");

  // ── Seções de tabela minimizáveis ────────────────────────────
  const [metaTableOpen, setMetaTableOpen] = useState(true);
  const [vendaTableOpen, setVendaTableOpen] = useState(true);

  // ── Tabela Meta Produtos: visão + filtros de coluna ──────────
  const [metaView, setMetaView] = useState<"consolidado" | "mensal">("consolidado");
  const [filtroProdutos, setFiltroProdutos] = useState<Set<string>>(new Set());
  const [filtroMeses, setFiltroMeses] = useState<Set<string>>(new Set());
  const [filtroStatus, setFiltroStatus] = useState<Set<string>>(new Set());

  const { data: metas = [], isLoading, isError, refetch } = useComercialMetas();
  const { items: vendasItems, isLoading: vendasLoading } = useComercialVendas();
  const createMeta = useCreateMetaComercial();
  const updateMeta = useUpdateMetaComercial();
  const deleteMeta = useDeleteMetaComercial();
  const createVenda = useCreateVenda();
  const updateVenda = useUpdateVenda();
  const deleteVenda = useDeleteVenda();
  const { mutateAsync: createMovimentacao } = useComercialMovimentacaoManual();

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
  // Comparação por ano-mês em string ("YYYY-MM") — evita o bug de fuso em que
  // "2026-04-01" é interpretado como 31/03 local e o mês some do período.
  const vendasFiltradas = useMemo(() => {
    if (!dateFrom && !dateTo) return vendasItems;
    const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const fromYm = dateFrom ? ymOf(dateFrom) : null;
    const toYm = dateTo ? ymOf(dateTo) : null;
    return vendasItems.filter((item) => {
      const itemYm = item.period_month?.slice(0, 7) || item.closed_date?.slice(0, 7);
      if (!itemYm) return false;
      if (fromYm && itemYm < fromYm) return false;
      if (toYm && itemYm > toYm) return false;
      return true;
    });
  }, [vendasItems, dateFrom, dateTo]);

  // ── Qtd vendida por produto+mês (itens de venda → realizado) ──
  const vendaQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of vendasFiltradas) {
      const ym = v.period_month?.slice(0, 7) || v.closed_date?.slice(0, 7);
      if (!ym) continue;
      for (const item of v.itens ?? []) {
        const key = `${item.produto}|${ym}`;
        map.set(key, (map.get(key) ?? 0) + (item.quantidade || 0));
      }
    }
    return map;
  }, [vendasFiltradas]);

  const qtyVendidaPara = (produto: string, mes: string) => {
    const d = getMesDate(mes);
    if (!d) return 0;
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return vendaQtyMap.get(`${produto}|${ym}`) ?? 0;
  };

  // ── Produtos das metas + meses com meta (para o form de venda) ─
  const produtosMeta = useMemo(() => {
    const set = new Set<string>();
    for (const m of metas) if (m.tipo !== "faturamento") set.add(m.nome_indicador);
    return [...set].sort();
  }, [metas]);

  const metaMesSet = useMemo(() => {
    const s = new Set<string>();
    for (const m of metas) {
      if (m.tipo === "faturamento") continue;
      const d = getMesDate(m.mes);
      if (!d) continue;
      s.add(`${m.nome_indicador}|${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return s;
  }, [metas]);

  // ── Pillar 1: Meta de Faturamento (combined) ─────────────────
  const faturamentoStats = useMemo(() => {
    const parseValor = (raw0: string) => {
      const raw = raw0.trim().toLowerCase();
      const v = raw.endsWith("k")
        ? parseFloat(raw.slice(0, -1)) * 1000
        : parseFloat(raw.replace(",", ".")) || 0;
      return Number.isFinite(v) ? v : 0;
    };

    // Meta de faturamento cadastrada POR mês (YYYY-MM)
    const fatPorMes = new Map<string, number>();
    for (const m of metasFaturamento) {
      const d = getMesDate(m.mes);
      if (!d) continue;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      fatPorMes.set(k, (fatPorMes.get(k) ?? 0) + parseValor(m.valor));
    }
    const targetCadastrado = [...fatPorMes.values()].reduce((s, v) => s + v, 0);

    // Conjunto de meses no escopo (metas de produto + faturamento + vendas filtradas)
    const mesesEscopo = new Set<string>();
    for (const m of metasProduto) {
      const d = getMesDate(m.mes);
      if (d) mesesEscopo.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    for (const k of fatPorMes.keys()) mesesEscopo.add(k);
    for (const v of vendasFiltradas) {
      const pm = v.period_month?.slice(0, 7) || v.closed_date?.slice(0, 7);
      if (pm) mesesEscopo.add(pm);
    }
    const mesesNoEscopo = Math.max(1, mesesEscopo.size);

    // Target = soma por mês (meta cadastrada do mês, ou default mensal)
    const target =
      [...mesesEscopo].reduce((s, k) => s + (fatPorMes.get(k) ?? META_MENSAL_DEFAULT), 0) ||
      META_MENSAL_DEFAULT * mesesNoEscopo;

    // Contribuição financeira dos produtos: (manual + itens de venda) × valor unitário
    const realizadoProdutos = metasProduto.reduce((sum, m) => {
      const qty = (parseInt(m.realizado) || 0) + qtyVendidaPara(m.nome_indicador, m.mes);
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
      const qtyTotal = (parseInt(m.realizado) || 0) + (vendaQtyMap.get(`${m.nome_indicador}|${pm}`) ?? 0);
      const contrib = qtyTotal * (parseFloat(m.valor_unitario) || 0);
      if (contrib > 0) mesMap.set(pm, (mesMap.get(pm) ?? 0) + contrib);
    }

    // % mensal: cada mês contra sua própria meta (cadastrada ou default)
    const comDados = [...mesMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, val]) => {
        const metaDoMes = fatPorMes.get(ym) ?? META_MENSAL_DEFAULT;
        const p = metaDoMes > 0 ? Math.round((val / metaDoMes) * 1000) / 10 : 0;
        return { mes: formatYM(ym), pct: p, atingiu: p >= 100 };
      })
      .filter((m) => m.pct > 0);

    const latest = comDados[comDados.length - 1];
    const mesesBatidos = comDados.filter((m) => m.atingiu).length;
    const media =
      comDados.length > 0
        ? Math.round((comDados.reduce((s, m) => s + m.pct, 0) / comDados.length) * 10) / 10
        : 0;

    const pctMetas = target > 0 ? Math.round((realizadoProdutos / target) * 1000) / 10 : 0;
    const pctVendas = target > 0 ? Math.round((realizadoVendas / target) * 1000) / 10 : 0;

    return {
      pctAtingimento,
      pctMetas,
      pctVendas,
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
  }, [metasFaturamento, metasProduto, vendasFiltradas, vendaQtyMap]);

  // ── Histograma de ondas: atingimento Produtos × Financeiro ───
  const waveData = useMemo(() => {
    const parseFat = (raw0: string) => {
      const raw = raw0.trim().toLowerCase();
      const v = raw.endsWith("k")
        ? parseFloat(raw.slice(0, -1)) * 1000
        : parseFloat(raw.replace(",", ".")) || 0;
      return Number.isFinite(v) ? v : 0;
    };

    type Acc = { metaQty: number; realQty: number; finMeta: number; finReal: number };
    const map = new Map<string, Acc>();
    const ensure = (k: string) => {
      let a = map.get(k);
      if (!a) { a = { metaQty: 0, realQty: 0, finMeta: 0, finReal: 0 }; map.set(k, a); }
      return a;
    };

    // Metas de produto → quantidade + contribuição financeira (realizado × vu)
    // realQty combina o manual com o vendido via itens de venda (sem dupla digitação)
    for (const m of metasProduto) {
      const d = getMesDate(m.mes);
      if (!d) continue;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const a = ensure(k);
      a.metaQty += parseFloat(m.valor) || 0;
      const rqTotal = (parseInt(m.realizado) || 0) + (vendaQtyMap.get(`${m.nome_indicador}|${k}`) ?? 0);
      a.realQty += rqTotal;
      a.finReal += rqTotal * (parseFloat(m.valor_unitario) || 0);
    }
    // Metas de faturamento cadastradas → target financeiro do mês
    for (const m of metasFaturamento) {
      const d = getMesDate(m.mes);
      if (!d) continue;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      ensure(k).finMeta += parseFat(m.valor);
    }
    // Vendas → realizado financeiro do mês
    for (const v of vendasFiltradas) {
      const pm = v.period_month?.slice(0, 7) || v.closed_date?.slice(0, 7);
      if (!pm) continue;
      ensure(pm).finReal += v.deal_value ?? 0;
    }
    // Default mensal quando não há meta de faturamento cadastrada
    for (const a of map.values()) {
      if (a.finMeta <= 0) a.finMeta = META_MENSAL_DEFAULT;
    }

    const months = [...map.keys()].sort();
    const pctOf = (real: number, meta: number) =>
      meta > 0 ? Math.round((real / meta) * 1000) / 10 : 0;

    if (waveView === "mensal") {
      return months.map((k) => {
        const a = map.get(k)!;
        return {
          label: formatYM(k),
          produto: pctOf(a.realQty, a.metaQty),
          financeiro: pctOf(a.finReal, a.finMeta),
        };
      });
    }

    // Trimestral: agrupa meses em Q1–Q4 por ano
    const qmap = new Map<string, Acc>();
    for (const k of months) {
      const a = map.get(k)!;
      const [y, mo] = k.split("-").map(Number);
      const q = Math.floor((mo - 1) / 3) + 1;
      const qk = `${y}-Q${q}`;
      let qa = qmap.get(qk);
      if (!qa) { qa = { metaQty: 0, realQty: 0, finMeta: 0, finReal: 0 }; qmap.set(qk, qa); }
      qa.metaQty += a.metaQty;
      qa.realQty += a.realQty;
      qa.finMeta += a.finMeta;
      qa.finReal += a.finReal;
    }
    return [...qmap.keys()].sort().map((qk) => {
      const a = qmap.get(qk)!;
      const [y, q] = qk.split("-");
      return {
        label: `${q}/${y}`,
        produto: pctOf(a.realQty, a.metaQty),
        financeiro: pctOf(a.finReal, a.finMeta),
      };
    });
  }, [metasProduto, metasFaturamento, vendasFiltradas, vendaQtyMap, waveView]);

  // ── Pillar 2: Meta Produtos KPIs (manual + vendas) ───────────
  const kpisProdutos = useMemo(() => {
    const realizadoDe = (m: (typeof metasProduto)[number]) =>
      (parseInt(m.realizado) || 0) + qtyVendidaPara(m.nome_indicador, m.mes);
    const batidas = metasProduto.filter((m) => {
      const metaQty = parseFloat(m.valor) || 0;
      return metaQty > 0 && realizadoDe(m) >= metaQty;
    }).length;
    const semRealizado = metasProduto.filter((m) => realizadoDe(m) === 0).length;
    const pctBatidas =
      metasProduto.length > 0
        ? Math.round((batidas / metasProduto.length) * 1000) / 10
        : 0;
    return { batidas, semRealizado, pctBatidas, total: metasProduto.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metasProduto, vendaQtyMap]);

  // ── Tabela: aplica filtros de coluna ──────────────────────────
  const metasTabela = useMemo(
    () =>
      metasProduto.filter(
        (m) =>
          (filtroProdutos.size === 0 || filtroProdutos.has(m.nome_indicador)) &&
          (filtroMeses.size === 0 || filtroMeses.has(m.mes)) &&
          (filtroStatus.size === 0 || filtroStatus.has(m.status))
      ),
    [metasProduto, filtroProdutos, filtroMeses, filtroStatus]
  );

  // ── Tabela: visão consolidada (1 linha por produto no período) ─
  const metasConsolidadas = useMemo(() => {
    type Cons = {
      produto: string;
      meses: string[];
      metaQty: number;
      manualQty: number;
      vendaQty: number;
      metaValor: number;
      realizadoValor: number;
      vus: Set<number>;
    };
    const map = new Map<string, Cons>();
    for (const m of metasTabela) {
      let c = map.get(m.nome_indicador);
      if (!c) {
        c = { produto: m.nome_indicador, meses: [], metaQty: 0, manualQty: 0, vendaQty: 0, metaValor: 0, realizadoValor: 0, vus: new Set() };
        map.set(m.nome_indicador, c);
      }
      const metaQty = parseFloat(m.valor) || 0;
      const manualQty = parseInt(m.realizado) || 0;
      const vendaQty = qtyVendidaPara(m.nome_indicador, m.mes);
      const vu = parseFloat(m.valor_unitario) || 0;
      const metaValorTotal = parseFloat(m.meta_valor_total || "") || 0;
      c.meses.push(m.mes);
      c.metaQty += metaQty;
      c.manualQty += manualQty;
      c.vendaQty += vendaQty;
      c.metaValor += metaValorTotal > 0 ? metaValorTotal : metaQty * vu;
      c.realizadoValor += (manualQty + vendaQty) * vu;
      if (vu > 0) c.vus.add(vu);
    }
    return [...map.values()]
      .map((c) => ({
        ...c,
        realizadoQty: c.manualQty + c.vendaQty,
        vuUniforme: c.vus.size === 1 ? [...c.vus][0] : null,
      }))
      .sort((a, b) => a.produto.localeCompare(b.produto));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metasTabela, vendaQtyMap]);

  const filtrosAtivos = filtroProdutos.size + filtroMeses.size + filtroStatus.size;

  // Opções dos filtros (a partir do período corrente, ordenadas)
  const opcoesProduto = useMemo(
    () => [...new Set(metasProduto.map((m) => m.nome_indicador))].sort().map((v) => ({ value: v })),
    [metasProduto]
  );
  const opcoesMes = useMemo(() => {
    const set = [...new Set(metasProduto.map((m) => m.mes))];
    set.sort((a, b) => (getMesDate(a)?.getTime() ?? 0) - (getMesDate(b)?.getTime() ?? 0));
    return set.map((v) => ({ value: v }));
  }, [metasProduto]);
  const opcoesStatus = useMemo(
    () =>
      [...new Set(metasProduto.map((m) => m.status))].map((v) => ({
        value: v,
        label: STATUS_LABELS[v as MetaFormData["status"]] ?? v,
      })),
    [metasProduto]
  );

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

  // ── Months available for copy dialog ─────────────────────────
  const mesesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const m of metas) {
      if (m.tipo !== "faturamento") set.add(m.mes);
    }
    return [...set].sort();
  }, [metas]);

  // ── CRUD handlers ─────────────────────────────────────────────
  async function handleSubmit(input: MetaFormData | MetaFormData[]) {
    const list = Array.isArray(input) ? input : [input];
    try {
      for (const meta of list) {
        if (editingId && list.length === 1) {
          await updateMeta.mutateAsync({ id: editingId, payload: meta });
        } else {
          // Upsert no cliente: se já existe meta com mesmo produto/tipo/mês,
          // atualiza em vez de inserir (evita violar comercial_metas_unique
          // no cadastro trimestral quando um dos meses já existe).
          const mesNorm = meta.mes.trim().toLowerCase();
          const existing = metas.find(
            (m) =>
              m.nome_indicador === meta.nome_indicador &&
              m.tipo === meta.tipo &&
              m.mes === mesNorm
          );
          if (existing) {
            await updateMeta.mutateAsync({
              id: existing.id,
              payload: { ...meta, mes: mesNorm, realizado: meta.realizado || existing.realizado },
            });
          } else {
            await createMeta.mutateAsync(meta);
          }
        }
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

  // ── Venda CRUD ────────────────────────────────────────────────
  function openCreateVenda() {
    setEditingVendaId(null);
    setVendaDialogOpen(true);
  }

  function openEditVenda(id: string) {
    setEditingVendaId(id);
    setVendaDialogOpen(true);
  }

  async function handleVendaSubmit(data: VendaFormData) {
    const isCreate = !editingVendaId;
    try {
      if (editingVendaId) {
        await updateVenda.mutateAsync({ id: editingVendaId, data });
      } else {
        await createVenda.mutateAsync(data);
      }
      setVendaDialogOpen(false);
      setEditingVendaId(null);
    } catch {
      window.alert("Falha ao salvar venda. Verifique a conexão.");
      return;
    }

    // Consistência Metas ↔ Ganho/Perda: venda nova marcada como "Novo Cliente"
    // oferece registrar o ganho correspondente na movimentação.
    const isNovoCliente = (data.observation || "").toLowerCase().includes("novo cliente");
    if (isCreate && isNovoCliente) {
      const registrar = window.confirm(
        'Venda marcada como "Novo Cliente".\nRegistrar também como GANHO na aba Ganho/Perda?'
      );
      if (registrar) {
        const dt = data.closed_date || new Date().toISOString().slice(0, 10);
        try {
          await createMovimentacao({
            cliente_codigo: 0,
            cliente_nome: data.deal_title,
            tipo: "ganho",
            bandeira: data.organization || undefined,
            motivo: "Recorrente",
            status_encerramento: "Novo Cliente",
            ano_referencia: parseInt(dt.slice(0, 4), 10),
            data_evento: dt,
          });
        } catch {
          window.alert(
            "Venda salva, mas falhou ao registrar o ganho. Lance manualmente na aba Ganho/Perda."
          );
        }
      }
    }
  }

  async function handleDeleteVenda(id: string) {
    if (!window.confirm("Excluir esta venda?")) return;
    try {
      await deleteVenda.mutateAsync(id);
    } catch {
      window.alert("Falha ao excluir venda.");
    }
  }

  // helper: build VendaFormData from existing ComercialVenda row
  function vendaToFormData(id: string): Partial<VendaFormData> | undefined {
    const v = vendasItems.find((i) => i.id === id);
    if (!v) return undefined;
    return {
      deal_title: v.deal_title ?? "",
      organization: v.organization ?? "",
      observation: v.observation ?? "",
      deal_value: v.deal_value != null ? String(v.deal_value) : "",
      closed_date: v.closed_date ? v.closed_date.slice(0, 10) : "",
      period_month: v.period_month ? v.period_month.slice(0, 10) : "",
      source_sheet: v.source_sheet ?? "Venda_Produtos",
      itens: (v.itens ?? []).map((i) => ({ produto: i.produto, quantidade: String(i.quantidade) })),
    };
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

      {/* ── Pilares + histograma de ondas ─────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Pillar 1 — Meta de Faturamento */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-semibold">Meta de Faturamento</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {faturamentoStats.hasCadastrado
                    ? "Target cadastrado · Meta Produtos + Venda Produtos"
                    : "Meta Produtos + Venda Produtos"}
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
                    <div className="flex items-baseline gap-2">
                      {canViewValues && (
                        <span className="text-sm font-mono text-muted-foreground">
                          {brl(faturamentoStats.totalRealizado, showValues)}
                        </span>
                      )}
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
                  </div>
                  <ProgressBar value={faturamentoPct} />
                </div>

                {canViewValues && (() => {
                  const colorFor = (p: number) =>
                    p >= 100 ? "#16a34a" : p >= 70 ? "#f59e0b" : "#ef4444";
                  const Row = ({
                    label, pctVal, value, bold,
                  }: { label: string; pctVal: number | null; value: number; bold?: boolean }) => (
                    <div className={`flex items-center justify-between py-1.5 ${bold ? "" : "border-b border-border/30"}`}>
                      <span className={`text-xs ${bold ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                        {label}
                      </span>
                      <div className="flex items-center gap-3">
                        {pctVal !== null ? (
                          <span
                            className={`text-[11px] font-mono ${bold ? "font-semibold" : ""}`}
                            style={{ color: colorFor(pctVal) }}
                          >
                            {pctVal.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground font-mono">100%</span>
                        )}
                        <span className={`text-xs ${bold ? "font-semibold" : ""}`}>
                          {brl(value, showValues)}
                        </span>
                      </div>
                    </div>
                  );
                  return (
                    <div className="pt-1 border-t">
                      <Row label="Target período" pctVal={null} value={faturamentoStats.target} />
                      <Row label="Metas Produtos" pctVal={faturamentoStats.pctMetas} value={faturamentoStats.realizadoProdutos} />
                      <Row label="Venda Produtos" pctVal={faturamentoStats.pctVendas} value={faturamentoStats.realizadoVendas} />
                      <Row label="Total realizado" pctVal={faturamentoPct} value={faturamentoStats.totalRealizado} bold />
                    </div>
                  );
                })()}

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
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-semibold">Venda Produtos</CardTitle>
                <p className="text-xs text-muted-foreground">Negócios fechados no período</p>
              </div>
              {canViewValues && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs whitespace-nowrap flex-shrink-0"
                  onClick={openCreateVenda}
                >
                  + Nova Venda
                </Button>
              )}
            </div>
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

        {/* Pillar 4 — Histograma de ondas (atingimento de metas) */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-semibold">Atingimento de Metas</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Produtos × Financeiro · {waveView === "mensal" ? "mensal" : "trimestral"}
                </p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {(["mensal", "trimestral"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setWaveView(v)}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                      waveView === v
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {v === "mensal" ? "Mês" : "Trim."}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {waveData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sem dados no período.
              </p>
            ) : (
              <>
                <div style={{ height: 196 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={waveData} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="waveProduto" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.03} />
                        </linearGradient>
                        <linearGradient id="waveFinanceiro" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        width={52}
                        domain={[
                          0,
                          Math.max(
                            120,
                            ...waveData.map(
                              (d) => Math.ceil(Math.max(d.produto, d.financeiro) / 20) * 20
                            )
                          ),
                        ]}
                      />
                      <Tooltip content={<WaveTooltip />} />
                      <ReferenceLine y={100} stroke="#16a34a" strokeDasharray="4 4" strokeOpacity={0.7} />
                      <Area
                        type="monotone"
                        dataKey="produto"
                        name="Produtos"
                        stroke="#0ea5e9"
                        strokeWidth={2}
                        fill="url(#waveProduto)"
                        dot={{ r: 2.5, fill: "#0ea5e9" }}
                        activeDot={{ r: 4 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="financeiro"
                        name="Financeiro"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        fill="url(#waveFinanceiro)"
                        dot={{ r: 2.5, fill: "#8b5cf6" }}
                        activeDot={{ r: 4 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-4 pt-2">
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#0ea5e9" }} />
                    Meta Produtos
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#8b5cf6" }} />
                    Meta Financeira
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Tabela Meta Produtos ──────────────────────────────── */}
      {!isLoading && metasProduto.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setMetaTableOpen((o) => !o)}
            className="flex items-center gap-2 w-full text-left group"
          >
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${metaTableOpen ? "" : "-rotate-90"}`}
            />
            <div>
              <h3 className="text-sm font-semibold group-hover:text-primary transition-colors">
                Meta Produtos — {periodLabel}
              </h3>
              <p className="text-xs text-muted-foreground">
                {metasProduto.length} produto{metasProduto.length !== 1 ? "s" : ""} no período
                {!metaTableOpen ? " · clique para expandir" : ""}
              </p>
            </div>
          </button>
          {metaTableOpen && (
          <>
          {/* Controles: visão + filtros ativos */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-1">
              {([
                { key: "consolidado", label: "Consolidado" },
                { key: "mensal", label: "Por mês" },
              ] as const).map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setMetaView(v.key)}
                  className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                    metaView === v.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {v.label}
                </button>
              ))}
              <span className="self-center ml-1 text-[11px] text-muted-foreground">
                {metaView === "consolidado"
                  ? "1 linha por produto, somando os meses do período"
                  : "1 linha por produto/mês — edição e status"}
              </span>
            </div>
            {filtrosAtivos > 0 && (
              <button
                type="button"
                onClick={() => { setFiltroProdutos(new Set()); setFiltroMeses(new Set()); setFiltroStatus(new Set()); }}
                className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
              >
                Limpar filtros ({filtrosAtivos}) ✕
              </button>
            )}
          </div>

          <div className="rounded-md border overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-muted border-b">
                  <th className="px-3 py-2 text-left font-semibold">
                    <span className="inline-flex items-center gap-1">
                      Produto
                      <ColumnFilterButton options={opcoesProduto} selected={filtroProdutos} onChange={setFiltroProdutos} />
                    </span>
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">
                    <span className="inline-flex items-center gap-1">
                      {metaView === "consolidado" ? "Meses" : "Mês"}
                      <ColumnFilterButton options={opcoesMes} selected={filtroMeses} onChange={setFiltroMeses} />
                    </span>
                  </th>
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
                  {metaView === "mensal" && (
                    <>
                      <th className="px-3 py-2 text-left font-semibold min-w-[200px]">
                        <span className="inline-flex items-center gap-1">
                          Status
                          <ColumnFilterButton options={opcoesStatus} selected={filtroStatus} onChange={setFiltroStatus} />
                        </span>
                      </th>
                      <th className="px-3 py-2 text-left font-semibold">Ações</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {metasTabela.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-3 py-6 text-center text-xs text-muted-foreground">
                      Nenhuma meta corresponde aos filtros aplicados.
                    </td>
                  </tr>
                )}
                {metaView === "consolidado" && metasConsolidadas.map((c) => {
                  const p = pct(c.realizadoQty, c.metaQty);
                  return (
                    <tr key={c.produto} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 font-medium max-w-[220px]">
                        <span title={c.produto} className="block truncate">{c.produto}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground font-mono whitespace-nowrap">
                        <span title={c.meses.join(", ")}>
                          {c.meses.length === 1 ? c.meses[0] : `${c.meses.length} meses`}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center font-mono">
                        {c.metaQty > 0 ? c.metaQty.toLocaleString("pt-BR") : "—"}
                      </td>
                      <td className="px-3 py-2 text-center font-mono">
                        {c.realizadoQty > 0 ? (
                          <div>
                            <span style={{ color: p >= 100 ? "#16a34a" : p >= 70 ? "#f59e0b" : "#ef4444" }}>
                              {c.realizadoQty.toLocaleString("pt-BR")}
                            </span>
                            {c.vendaQty > 0 && (
                              <span
                                className="block text-[10px] text-muted-foreground font-sans"
                                title={`${c.manualQty} manual + ${c.vendaQty} via Venda Produtos`}
                              >
                                {c.manualQty > 0 ? `${c.manualQty} + ${c.vendaQty} vendas` : "via vendas"}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      {canViewValues && (
                        <>
                          <td className="px-3 py-2 text-right text-xs">
                            {c.vuUniforme != null
                              ? brl(c.vuUniforme, showValues)
                              : c.vus.size > 1
                                ? <span className="text-muted-foreground" title="Valor unitário varia entre os meses">varia</span>
                                : "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-xs">
                            {c.metaValor > 0 ? brl(c.metaValor, showValues) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-xs">
                            {c.realizadoValor > 0 ? brl(c.realizadoValor, showValues) : "—"}
                          </td>
                        </>
                      )}
                      <td className="px-3 py-2">
                        {c.metaQty > 0 && c.realizadoQty > 0 ? (
                          <PctBar value={p} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {metaView === "mensal" && metasTabela.map((meta) => {
                  const metaQty = parseFloat(meta.valor) || 0;
                  const manualQty = parseInt(meta.realizado) || 0;
                  const vendaQty = qtyVendidaPara(meta.nome_indicador, meta.mes);
                  const realizadoQty = manualQty + vendaQty;
                  const vu = parseFloat(meta.valor_unitario) || 0;
                  const metaValorTotal = parseFloat(meta.meta_valor_total || "") || 0;
                  const metaValor = metaValorTotal > 0 ? metaValorTotal : metaQty * vu;
                  const realizadoValor = realizadoQty * vu;
                  const p = pct(realizadoQty, metaQty);

                  return (
                    <tr key={meta.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 font-medium max-w-[220px]">
                        <span title={meta.nome_indicador} className="block truncate">
                          {meta.nome_indicador}
                        </span>
                        {meta.observacao && !/^meta em (r\$|milhares)/i.test(meta.observacao.trim()) && (
                          <span className="text-xs text-muted-foreground block truncate">
                            {meta.observacao}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground font-mono whitespace-nowrap">
                        {meta.mes}
                      </td>

                      <td className="px-3 py-2 text-center font-mono">
                        {metaQty > 0 ? metaQty.toLocaleString("pt-BR") : "—"}
                      </td>

                      <td className="px-3 py-2 text-center font-mono">
                        {realizadoQty > 0 ? (
                          <div>
                            <span
                              style={{ color: p >= 100 ? "#16a34a" : p >= 70 ? "#f59e0b" : "#ef4444" }}
                            >
                              {realizadoQty.toLocaleString("pt-BR")}
                            </span>
                            {vendaQty > 0 && (
                              <span
                                className="block text-[10px] text-muted-foreground font-sans"
                                title={`${manualQty} manual + ${vendaQty} via Venda Produtos`}
                              >
                                {manualQty > 0 ? `${manualQty} + ${vendaQty} vendas` : "via vendas"}
                              </span>
                            )}
                          </div>
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
                        {metaQty > 0 && realizadoQty > 0 ? (
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
          </>
          )}
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
      {!vendasLoading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setVendaTableOpen((o) => !o)}
              className="flex items-center gap-2 text-left group"
            >
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${vendaTableOpen ? "" : "-rotate-90"}`}
              />
              <div>
                <h3 className="text-sm font-semibold group-hover:text-primary transition-colors">
                  Venda Produtos — {periodLabel}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {vendasFiltradas.length} negócio{vendasFiltradas.length !== 1 ? "s" : ""} fechado
                  {vendasFiltradas.length !== 1 ? "s" : ""} no período
                  {!vendaTableOpen ? " · clique para expandir" : ""}
                </p>
              </div>
            </button>
            {canViewValues && (
              <Button variant="default" size="sm" onClick={openCreateVenda}>
                + Nova Venda
              </Button>
            )}
          </div>
          {vendaTableOpen && (vendasFiltradas.length === 0 ? (
            <div className="rounded-lg border border-dashed flex flex-col items-center justify-center py-8 text-center gap-2">
              <p className="text-muted-foreground text-sm">Sem vendas no período.</p>
              {canViewValues && (
                <Button variant="outline" size="sm" onClick={openCreateVenda}>
                  + Cadastrar primeira venda
                </Button>
              )}
            </div>
          ) : (
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
                    {canViewValues && (
                      <th className="px-3 py-2 text-left font-semibold">Ações</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {vendasFiltradas.map((venda) => (
                    <tr key={venda.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 font-medium max-w-[280px]">
                        <span title={venda.deal_title ?? ""} className="block truncate">
                          {venda.deal_title || "—"}
                        </span>
                        {(venda.itens?.length ?? 0) > 0 && (
                          <span
                            className="block truncate text-[11px] text-muted-foreground font-normal"
                            title={venda.itens.map((i) => `${i.quantidade}× ${i.produto}`).join(", ")}
                          >
                            {venda.itens.map((i) => `${i.quantidade}× ${i.produto}`).join(", ")}
                          </span>
                        )}
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
                      {canViewValues && (
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs px-2"
                              onClick={() => openEditVenda(venda.id)}
                            >
                              Editar
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs px-2 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteVenda(venda.id)}
                            >
                              ✕
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
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

      {/* ── Dialog: Venda Produto (create / edit) ─────────────── */}
      <VendaFormDialog
        open={vendaDialogOpen}
        onClose={() => {
          setVendaDialogOpen(false);
          setEditingVendaId(null);
        }}
        onSubmit={handleVendaSubmit}
        initialData={editingVendaId ? vendaToFormData(editingVendaId) : undefined}
        mode={editingVendaId ? "edit" : "create"}
        produtosDisponiveis={produtosMeta}
        hasMetaFor={(produto, ym) => metaMesSet.has(`${produto}|${ym}`)}
      />
    </div>
  );
};

export default MetasTab;
