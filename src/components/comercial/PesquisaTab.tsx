import { useState, useRef, useMemo, useCallback } from 'react';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn, ColumnFilter } from '@/components/dashboard/DashboardDataTable';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  useSurveyResponses,
  useSurveyAggregates,
  useSurveyImports,
  useSurveyUpload,
  SurveyResponse,
  SurveyImportMode,
} from '@/hooks/useSurveyImport';
import { ImportModeDialog, ImportMode } from '@/components/setores/ImportModeDialog';
import { Star, Users, BarChart3, Upload, FileSpreadsheet, CheckCircle2, Clock, TrendingDown, AlertTriangle, ThumbsUp, Minus, ThumbsDown, ShieldAlert } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, ReferenceLine } from 'recharts';

// ── CSAT Classification ──────────────────────────────────────────
type CsatFaixa = 'excelente' | 'bom' | 'atencao' | 'critico';

function classifyCsat(csat: number): CsatFaixa {
  if (csat >= 85) return 'excelente';
  if (csat >= 75) return 'bom';
  if (csat >= 60) return 'atencao';
  return 'critico';
}

const FAIXA_CONFIG: Record<CsatFaixa, { label: string; color: string; bgClass: string }> = {
  excelente: { label: 'Excelente', color: 'hsl(142, 71%, 45%)', bgClass: 'bg-[hsl(142,71%,45%)]/10 text-[hsl(142,71%,45%)]' },
  bom: { label: 'Bom', color: 'hsl(210, 70%, 55%)', bgClass: 'bg-[hsl(210,70%,55%)]/10 text-[hsl(210,70%,55%)]' },
  atencao: { label: 'Atenção', color: 'hsl(43, 85%, 46%)', bgClass: 'bg-[hsl(43,85%,46%)]/10 text-[hsl(43,85%,46%)]' },
  critico: { label: 'Crítico', color: 'hsl(0, 72%, 51%)', bgClass: 'bg-destructive/10 text-destructive' },
};

function getScoreColor(score: number, max: number = 5): string {
  const pct = (score / max) * 100;
  if (pct >= 85) return 'hsl(142, 71%, 45%)';
  if (pct >= 75) return 'hsl(142, 60%, 55%)';
  if (pct >= 60) return 'hsl(43, 85%, 46%)';
  if (pct >= 40) return 'hsl(25, 80%, 50%)';
  return 'hsl(0, 72%, 51%)';
}

// ── NPS-like classification (scale 0-5) ──────────────────────────
// 5 = Promoter, 4 = Neutral, 0-3 = Detractor
function classifyNps(avgScore: number | null): 'promoter' | 'neutral' | 'detractor' | null {
  if (avgScore == null) return null;
  if (avgScore >= 4.5) return 'promoter';
  if (avgScore >= 3.5) return 'neutral';
  return 'detractor';
}

// ── Custom Tooltips ──────────────────────────────────────────────
function CsatTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const faixa = classifyCsat(d.csat);
  const config = FAIXA_CONFIG[faixa];
  return (
    <div className="bg-popover border border-border rounded-lg shadow-xl px-4 py-3 text-xs space-y-1.5">
      <p className="font-semibold text-foreground text-sm">{d.name}</p>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">CSAT:</span>
        <span className="font-bold" style={{ color: config.color }}>{d.csat.toFixed(1)}%</span>
        <Badge variant="outline" className={`text-[10px] px-1.5 ${config.bgClass}`}>{config.label}</Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Nota Média:</span>
        <span className="font-medium">{d.media.toFixed(2)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Respostas:</span>
        <span className="font-medium">{d.avaliacoes}</span>
      </div>
    </div>
  );
}

function MediaTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-xl px-4 py-3 text-xs space-y-1">
      <p className="font-semibold text-foreground text-sm">{d.name}</p>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Nota Média:</span>
        <span className="font-bold">{d.media.toFixed(2)} / 5</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">CSAT:</span>
        <span className="font-medium">{d.csat.toFixed(1)}%</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Respostas:</span>
        <span className="font-medium">{d.avaliacoes}</span>
      </div>
    </div>
  );
}

// ── Table columns ────────────────────────────────────────────────
const columns: DataTableColumn<SurveyResponse>[] = [
  { key: 'client_code', header: 'Código', className: 'font-mono text-xs w-16' },
  { key: 'client_name', header: 'Cliente', className: 'max-w-[200px] truncate font-medium' },
  {
    key: 'bandeira', header: 'Bandeira',
    render: (r) => r.bandeira ? <Badge variant="outline" className="text-xs">{r.bandeira}</Badge> : '—',
  },
  {
    key: 'survey_date', header: 'Data', className: 'text-xs',
    render: (r) => r.survey_date ? new Date(r.survey_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—',
  },
  {
    key: 'derived', header: 'Média',
    render: (r) => {
      const avg = r.derived?.avg_score;
      if (avg == null) return '—';
      const color = getScoreColor(avg);
      return <span className="font-semibold" style={{ color }}>{avg.toFixed(1)}</span>;
    },
  },
  {
    key: 'payload', header: 'Classificação',
    render: (r) => {
      const cls = classifyNps(r.derived?.avg_score);
      if (!cls) return '—';
      const map = {
        promoter: { label: 'Promotor', cls: 'bg-[hsl(142,71%,45%)]/10 text-[hsl(142,71%,45%)] border-[hsl(142,71%,45%)]/30' },
        neutral: { label: 'Neutro', cls: 'bg-[hsl(43,85%,46%)]/10 text-[hsl(43,85%,46%)] border-[hsl(43,85%,46%)]/30' },
        detractor: { label: 'Detrator', cls: 'bg-destructive/10 text-destructive border-destructive/30' },
      };
      const cfg = map[cls];
      return <Badge variant="outline" className={`text-[10px] ${cfg.cls}`}>{cfg.label}</Badge>;
    },
  },
  {
    key: 'id', header: 'Tags',
    render: (r) => {
      const tags = r.payload?.complaint_tags ?? [];
      if (tags.length === 0) return '—';
      return (
        <div className="flex gap-1 flex-wrap max-w-[200px]">
          {tags.slice(0, 2).map((t: string) => (
            <Badge key={t} variant="outline" className="text-[10px] px-1">{t.replace(/_/g, ' ')}</Badge>
          ))}
          {tags.length > 2 && <Badge variant="secondary" className="text-[10px] px-1">+{tags.length - 2}</Badge>}
        </div>
      );
    },
  },
];

const columnFilters: ColumnFilter[] = [
  { key: 'client_name', label: 'Cliente' },
  { key: 'bandeira', label: 'Bandeira' },
];

export function PesquisaTab() {
  const { data: responses = [], isLoading, isError, refetch } = useSurveyResponses();
  const { data: aggregates = [] } = useSurveyAggregates();
  const { data: imports = [] } = useSurveyImports();
  const { uploadSurvey, isUploading, lastResult } = useSurveyUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [drawerItem, setDrawerItem] = useState<SurveyResponse | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importModeOpen, setImportModeOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

  const latestAggregate = aggregates[0]?.payload;

  // ── All product keys for filter ────────────────────────────────
  const productOptions = useMemo(() => {
    if (!latestAggregate?.products) return [];
    return (latestAggregate.products as any[])
      .filter((p: any) => p.avaliacoes_validas > 0)
      .map((p: any) => ({ key: p.product_key, name: p.product_name }));
  }, [latestAggregate]);

  // ── KPIs: recalculate from responses when product filter is active
  const kpis = useMemo(() => {
    if (!selectedProduct) {
      if (!latestAggregate?.summary) {
        return { total: responses.length, mediaGeral: null, csatGeral: null, produtosAvaliados: 0 };
      }
      const s = latestAggregate.summary;
      return {
        total: s.total_clientes_pesquisados ?? responses.length,
        mediaGeral: s.nota_media_geral,
        csatGeral: s.csat_geral,
        produtosAvaliados: (latestAggregate.products as any[])?.filter((p: any) => p.avaliacoes_validas > 0).length ?? 0,
      };
    }

    let ratedScores: number[] = [];
    let totalWithProduct = 0;

    for (const r of responses) {
      const products = r.payload?.products ?? [];
      const prod = products.find((p: any) => p.product_key === selectedProduct);
      if (!prod) continue;
      totalWithProduct++;
      if (prod.usage_status === 'rated' && prod.score != null) {
        ratedScores.push(prod.score);
      }
    }

    const avg = ratedScores.length > 0
      ? Number((ratedScores.reduce((a, b) => a + b, 0) / ratedScores.length).toFixed(2))
      : null;
    const csat = ratedScores.length > 0
      ? Number(((ratedScores.filter(s => s >= 4).length / ratedScores.length) * 100).toFixed(1))
      : null;

    return { total: totalWithProduct, mediaGeral: avg, csatGeral: csat, produtosAvaliados: 1 };
  }, [latestAggregate, responses, selectedProduct]);

  // ── Promoter / Neutral / Detractor counts ──────────────────────
  const npsStats = useMemo(() => {
    const relevantResponses = selectedProduct
      ? responses.filter(r => {
          const products = r.payload?.products ?? [];
          return products.some((p: any) => p.product_key === selectedProduct && p.usage_status === 'rated');
        })
      : responses;

    let promoters = 0, neutrals = 0, detractors = 0, unrated = 0;

    for (const r of relevantResponses) {
      if (selectedProduct) {
        const prod = (r.payload?.products ?? []).find((p: any) => p.product_key === selectedProduct);
        if (!prod || prod.score == null) { unrated++; continue; }
        const cls = classifyNps(prod.score);
        if (cls === 'promoter') promoters++;
        else if (cls === 'neutral') neutrals++;
        else if (cls === 'detractor') detractors++;
        else unrated++;
      } else {
        const avg = r.derived?.avg_score;
        const cls = classifyNps(avg);
        if (cls === 'promoter') promoters++;
        else if (cls === 'neutral') neutrals++;
        else if (cls === 'detractor') detractors++;
        else unrated++;
      }
    }

    const rated = promoters + neutrals + detractors;
    return {
      promoters, neutrals, detractors, unrated, rated,
      promoterPct: rated > 0 ? Math.round((promoters / rated) * 100) : 0,
      neutralPct: rated > 0 ? Math.round((neutrals / rated) * 100) : 0,
      detractorPct: rated > 0 ? Math.round((detractors / rated) * 100) : 0,
    };
  }, [responses, selectedProduct]);

  // ── Product chart data (sorted worst to best) ──────────────────
  const productChart = useMemo(() => {
    if (!latestAggregate?.products) return [];
    return (latestAggregate.products as any[])
      .filter((p: any) => p.avaliacoes_validas > 0)
      .sort((a: any, b: any) => (a.csat ?? 0) - (b.csat ?? 0))
      .map((p: any) => ({
        key: p.product_key,
        name: p.product_name,
        media: p.nota_media ?? 0,
        csat: p.csat ?? 0,
        avaliacoes: p.avaliacoes_validas,
        faixa: classifyCsat(p.csat ?? 0),
        needsAttention: (p.csat ?? 0) < 75,
      }));
  }, [latestAggregate]);

  // ── Products needing attention ─────────────────────────────────
  const criticalProducts = useMemo(() =>
    productChart.filter(p => p.needsAttention),
    [productChart]
  );

  // ── Filtered complaints (respect selected product) ─────────────
  const topComplaints = useMemo(() => {
    if (!latestAggregate?.motivos_insatisfacao) return [];
    const all = latestAggregate.motivos_insatisfacao as any[];
    if (!selectedProduct) return all.slice(0, 5);

    // Filter complaints that affect the selected product
    return all
      .filter((m: any) => (m.produtos_mais_afetados || []).includes(selectedProduct))
      .slice(0, 5);
  }, [latestAggregate, selectedProduct]);

  // ── Filtered responses (respect selected product) ──────────────
  const filteredResponses = useMemo(() => {
    if (!selectedProduct) return responses;
    return responses.filter(r => {
      const products = r.payload?.products ?? [];
      return products.some((p: any) => p.product_key === selectedProduct && p.usage_status !== 'not_used');
    });
  }, [responses, selectedProduct]);

  // ── File upload ────────────────────────────────────────────────
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPendingFile(file);
    setImportModeOpen(true);
  }, []);

  const handleImportConfirm = useCallback(async (mode: ImportMode) => {
    setImportModeOpen(false);
    if (!pendingFile) return;
    const surveyMode: SurveyImportMode = mode === 'purge' ? 'purge' : 'incremental';
    await uploadSurvey(pendingFile, undefined, surveyMode);
    setPendingFile(null);
  }, [pendingFile, uploadSurvey]);

  // ── Drawer fields ──────────────────────────────────────────────
  const drawerFields: DrawerField[] = useMemo(() => {
    if (!drawerItem) return [];
    const p = drawerItem.payload;
    const fields: DrawerField[] = [
      { label: 'Código', value: drawerItem.client_code },
      { label: 'Cliente', value: drawerItem.client_name },
      { label: 'Razão Social', value: p?.client?.razao_social },
      { label: 'Bandeira', value: drawerItem.bandeira },
      { label: 'Status', value: p?.client?.status },
      { label: 'Cidade/UF', value: [p?.client?.cidade, p?.client?.uf].filter(Boolean).join('/') || '—' },
      { label: 'Contato', value: p?.contact?.nome },
      { label: 'Telefone', value: p?.contact?.telefone },
      { label: 'Responsável', value: p?.contact?.responsavel },
      { label: 'Média', value: drawerItem.derived?.avg_score?.toFixed(2) ?? '—' },
      { label: 'Classificação', value: (() => {
        const cls = classifyNps(drawerItem.derived?.avg_score);
        return cls === 'promoter' ? 'Promotor' : cls === 'neutral' ? 'Neutro' : cls === 'detractor' ? 'Detrator' : '—';
      })() },
      { label: 'Indicaria?', value: p?.recommendation?.nps_proxy_classification?.replace(/_/g, ' ') ?? '—' },
      { label: 'Pensou trocar?', value: p?.troca_sistema?.pensou_trocar ?? '—' },
      { label: 'Motivo troca', value: p?.troca_sistema?.motivo || '—' },
      { label: 'Relato', value: p?.general_feedback?.report_text || '—' },
    ];

    const products = p?.products ?? [];
    for (const prod of products) {
      if (prod.usage_status === 'not_used') continue;
      const label = prod.product_name;
      const val = prod.usage_status === 'rated'
        ? `${prod.score}/5${prod.observation_text ? ` — ${prod.observation_text}` : ''}`
        : prod.usage_status === 'no_feedback' ? 'Sem relato'
        : prod.usage_status === 'no_score' ? 'Sem nota'
        : prod.raw_value ?? '—';
      fields.push({ label, value: val });
    }

    return fields;
  }, [drawerItem]);

  if (isError) return <DashboardEmptyState variant="error" onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <Card className="p-4 border-dashed border-2 border-border/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <div>
              <h4 className="text-sm font-semibold">Importar Pesquisa de Satisfação</h4>
              <p className="text-xs text-muted-foreground">Formato wide (XLSX) — todos os produtos em colunas</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            {isUploading ? 'Processando...' : 'Selecionar Arquivo'}
            <Upload className="h-4 w-4 ml-2" />
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} />
        </div>
        {isUploading && <Progress value={50} className="h-1 mt-3" />}
        {lastResult && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-[hsl(142,71%,45%)]" />
            <span>{lastResult.summary.rows_valid} respostas válidas de {lastResult.summary.rows_received} linhas</span>
          </div>
        )}
      </Card>

      {/* Product filter */}
      {productOptions.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Filtrar por produto:</span>
          <Badge
            variant={selectedProduct === null ? 'default' : 'outline'}
            className="cursor-pointer text-xs"
            onClick={() => setSelectedProduct(null)}
          >
            Todos
          </Badge>
          {productOptions.map((p) => (
            <Badge
              key={p.key}
              variant={selectedProduct === p.key ? 'default' : 'outline'}
              className="cursor-pointer text-xs"
              onClick={() => setSelectedProduct(selectedProduct === p.key ? null : p.key)}
            >
              {p.name}
            </Badge>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DashboardKpiCard label={selectedProduct ? 'Clientes c/ Produto' : 'Clientes Pesquisados'} value={kpis.total} icon={Users} isLoading={isLoading} />
        <DashboardKpiCard label="Nota Média" value={kpis.mediaGeral?.toFixed(2) ?? '—'} icon={Star} isLoading={isLoading} delay={80} />
        <DashboardKpiCard label="CSAT (%)" value={kpis.csatGeral != null ? `${kpis.csatGeral}%` : '—'} icon={BarChart3} isLoading={isLoading} delay={160} />
        <DashboardKpiCard label="Produtos Avaliados" value={kpis.produtosAvaliados} icon={BarChart3} isLoading={isLoading} delay={240} />
      </div>

      {/* Promoter / Neutral / Detractor */}
      {npsStats.rated > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Classificação de Clientes</h3>
            <span className="text-xs text-muted-foreground ml-auto">Escala 0–5: Promotor ≥ 4.5 • Neutro ≥ 3.5 • Detrator &lt; 3.5</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-[hsl(142,71%,45%)]/5 border border-[hsl(142,71%,45%)]/20">
              <ThumbsUp className="h-5 w-5 text-[hsl(142,71%,45%)]" />
              <div>
                <p className="text-xl font-bold text-[hsl(142,71%,45%)]">{npsStats.promoters}</p>
                <p className="text-xs text-muted-foreground">Promotores ({npsStats.promoterPct}%)</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-[hsl(43,85%,46%)]/5 border border-[hsl(43,85%,46%)]/20">
              <Minus className="h-5 w-5 text-[hsl(43,85%,46%)]" />
              <div>
                <p className="text-xl font-bold text-[hsl(43,85%,46%)]">{npsStats.neutrals}</p>
                <p className="text-xs text-muted-foreground">Neutros ({npsStats.neutralPct}%)</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
              <ThumbsDown className="h-5 w-5 text-destructive" />
              <div>
                <p className="text-xl font-bold text-destructive">{npsStats.detractors}</p>
                <p className="text-xs text-muted-foreground">Detratores ({npsStats.detractorPct}%)</p>
              </div>
            </div>
          </div>
          {/* Visual bar */}
          <div className="mt-3 h-3 rounded-full overflow-hidden flex">
            {npsStats.promoterPct > 0 && <div className="bg-[hsl(142,71%,45%)]" style={{ width: `${npsStats.promoterPct}%` }} />}
            {npsStats.neutralPct > 0 && <div className="bg-[hsl(43,85%,46%)]" style={{ width: `${npsStats.neutralPct}%` }} />}
            {npsStats.detractorPct > 0 && <div className="bg-destructive" style={{ width: `${npsStats.detractorPct}%` }} />}
          </div>
        </Card>
      )}

      {/* Products needing attention */}
      {criticalProducts.length > 0 && !selectedProduct && (
        <Card className="p-4 border-destructive/30">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-semibold">Produtos que Demandam Atenção</h3>
            <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">{criticalProducts.length} produtos</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {criticalProducts.map((p) => {
              const faixa = FAIXA_CONFIG[p.faixa];
              return (
                <button
                  key={p.key}
                  onClick={() => setSelectedProduct(p.key)}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 hover:bg-accent/50 transition-colors text-left"
                >
                  <div>
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.avaliacoes} avaliações</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold" style={{ color: faixa.color }}>{p.csat.toFixed(1)}%</span>
                    <Badge variant="outline" className={`text-[10px] ${faixa.bgClass}`}>{faixa.label}</Badge>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* CSAT Chart */}
      {productChart.length > 0 && (
        <Card className="p-4 space-y-2">
          <CardHeader className="p-0">
            <CardTitle className="text-sm font-semibold">CSAT (%) por Produto</CardTitle>
            <p className="text-xs text-muted-foreground">Ordenado do pior para o melhor • Clique em uma barra para filtrar</p>
          </CardHeader>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={productChart}
                margin={{ top: 8, right: 16, bottom: 60, left: 0 }}
                onClick={(e) => {
                  if (e?.activePayload?.[0]?.payload?.key) {
                    const key = e.activePayload[0].payload.key;
                    setSelectedProduct(selectedProduct === key ? null : key);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <ReferenceLine y={75} stroke="hsl(43, 85%, 46%)" strokeDasharray="6 3" label={{ value: '75%', position: 'left', fontSize: 10, fill: 'hsl(43, 85%, 46%)' }} />
                <Tooltip content={<CsatTooltip />} />
                <Bar dataKey="csat" radius={[4, 4, 0, 0]} className="cursor-pointer">
                  {productChart.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={FAIXA_CONFIG[entry.faixa].color}
                      opacity={selectedProduct && entry.key !== selectedProduct ? 0.25 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Nota Média Chart (with color grading) */}
      {productChart.length > 0 && (
        <Card className="p-4 space-y-2">
          <CardHeader className="p-0">
            <CardTitle className="text-sm font-semibold">Nota Média por Produto</CardTitle>
            <p className="text-xs text-muted-foreground">Escala 0–5 • Cores refletem o desempenho</p>
          </CardHeader>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[...productChart].sort((a, b) => a.media - b.media)}
                margin={{ top: 8, right: 16, bottom: 60, left: 0 }}
                onClick={(e) => {
                  if (e?.activePayload?.[0]?.payload?.key) {
                    const key = e.activePayload[0].payload.key;
                    setSelectedProduct(selectedProduct === key ? null : key);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
                <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                <Tooltip content={<MediaTooltip />} />
                <Bar dataKey="media" radius={[4, 4, 0, 0]} className="cursor-pointer">
                  {[...productChart].sort((a, b) => a.media - b.media).map((entry, i) => (
                    <Cell
                      key={i}
                      fill={getScoreColor(entry.media)}
                      opacity={selectedProduct && entry.key !== selectedProduct ? 0.25 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Top Complaints (filtered by product) */}
      {topComplaints.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-semibold">
              Principais Motivos de Insatisfação
              {selectedProduct && <span className="text-muted-foreground font-normal ml-1">— filtrado</span>}
            </h3>
          </div>
          <div className="space-y-2">
            {topComplaints.map((m: any) => (
              <div key={m.tag} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{m.tag.replace(/_/g, ' ')}</Badge>
                    <span className="text-xs text-muted-foreground">{m.count} ocorrências</span>
                  </div>
                  {m.examples?.[0] && (
                    <p className="text-xs text-muted-foreground mt-1 truncate max-w-[500px]">"{m.examples[0]}"</p>
                  )}
                </div>
                <div className="flex gap-1 flex-wrap max-w-[160px]">
                  {m.produtos_mais_afetados?.slice(0, 3).map((p: string) => (
                    <Badge key={p} variant="secondary" className="text-[10px] px-1">{p.replace(/_/g, ' ')}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Import History */}
      {imports.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">Histórico de Importações</h4>
          </div>
          <div className="space-y-2">
            {imports.map((imp: any) => (
              <div key={imp.id} className="flex items-center justify-between p-2 rounded-lg border border-border/60">
                <div>
                  <p className="text-sm font-medium">{imp.import_name}</p>
                  <p className="text-xs text-muted-foreground">{imp.file_name} • {new Date(imp.created_at).toLocaleString('pt-BR')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={imp.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
                    {imp.status === 'completed' ? 'Concluído' : imp.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{imp.rows_valid}/{imp.rows_received}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Responses Table (filtered) */}
      {!isLoading && filteredResponses.length === 0 ? (
        <DashboardEmptyState description={selectedProduct ? "Nenhuma resposta encontrada para este produto." : "Nenhuma pesquisa importada. Use o botão acima para importar a planilha wide-format."} />
      ) : (
        <DashboardDataTable
          title="Respostas da Pesquisa"
          subtitle={`${filteredResponses.length} respostas${selectedProduct ? ' (filtradas)' : ''}`}
          columns={columns}
          data={filteredResponses}
          isLoading={isLoading}
          getRowKey={(r) => r.id}
          onRowClick={(r) => setDrawerItem(r)}
          searchPlaceholder="Buscar cliente..."
          columnFilters={columnFilters}
        />
      )}

      <DashboardDrawer
        open={!!drawerItem}
        onClose={() => setDrawerItem(null)}
        title={drawerItem?.client_name || undefined}
        subtitle="Pesquisa de Satisfação"
        fields={drawerFields}
      />

      <ImportModeDialog
        open={importModeOpen}
        onClose={() => { setImportModeOpen(false); setPendingFile(null); }}
        onConfirm={handleImportConfirm}
        fileName={pendingFile?.name}
      />
    </div>
  );
}
