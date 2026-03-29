import { useState, useRef, useMemo, useCallback } from 'react';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn, ColumnFilter } from '@/components/dashboard/DashboardDataTable';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { Star, Users, BarChart3, Upload, FileSpreadsheet, CheckCircle2, Clock, TrendingDown, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

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
      const color = avg >= 4 ? 'text-[hsl(var(--chart-2))]' : avg >= 3 ? 'text-[hsl(var(--chart-4))]' : 'text-destructive';
      return <span className={`font-semibold ${color}`}>{avg.toFixed(1)}</span>;
    },
  },
  {
    key: 'payload', header: 'Contato',
    render: (r) => {
      const s = r.payload?.contact?.status;
      return s === 'reached'
        ? <Badge variant="default" className="text-xs">Contatado</Badge>
        : <Badge variant="secondary" className="text-xs">Sem contato</Badge>;
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

  const latestAggregate = aggregates[0]?.payload;

  // ── KPIs from latest aggregate ─────────────────────────────────
  const kpis = useMemo(() => {
    if (!latestAggregate?.summary) {
      return { total: responses.length, mediaGeral: null, csatGeral: null, bandeiras: 0 };
    }
    const s = latestAggregate.summary;
    return {
      total: s.total_clientes_pesquisados ?? responses.length,
      mediaGeral: s.nota_media_geral,
      csatGeral: s.csat_geral,
      bandeiras: latestAggregate.products?.length ?? 0,
    };
  }, [latestAggregate, responses.length]);

  // ── Product chart data ─────────────────────────────────────────
  const productChart = useMemo(() => {
    if (!latestAggregate?.products) return [];
    return (latestAggregate.products as any[])
      .filter((p: any) => p.avaliacoes_validas > 0)
      .sort((a: any, b: any) => (b.nota_media ?? 0) - (a.nota_media ?? 0))
      .map((p: any) => ({
        name: p.product_name,
        media: p.nota_media ?? 0,
        csat: p.csat ?? 0,
        avaliacoes: p.avaliacoes_validas,
      }));
  }, [latestAggregate]);

  // ── Top complaints ─────────────────────────────────────────────
  const topComplaints = useMemo(() => {
    if (!latestAggregate?.motivos_insatisfacao) return [];
    return (latestAggregate.motivos_insatisfacao as any[]).slice(0, 5);
  }, [latestAggregate]);

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
      { label: 'Indicaria?', value: p?.recommendation?.nps_proxy_classification?.replace(/_/g, ' ') ?? '—' },
      { label: 'Pensou trocar?', value: p?.troca_sistema?.pensou_trocar ?? '—' },
      { label: 'Motivo troca', value: p?.troca_sistema?.motivo || '—' },
      { label: 'Relato', value: p?.general_feedback?.report_text || '—' },
    ];

    // Products
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

  const COLORS = [
    'hsl(var(--primary))',
    'hsl(var(--accent))',
    'hsl(142, 71%, 45%)',
    'hsl(210, 70%, 55%)',
    'hsl(43, 85%, 46%)',
    'hsl(280, 60%, 55%)',
    'hsl(30, 80%, 55%)',
    'hsl(0, 65%, 55%)',
  ];

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? 'Processando...' : 'Selecionar Arquivo'}
            <Upload className="h-4 w-4 ml-2" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
        {isUploading && <Progress value={50} className="h-1 mt-3" />}
        {lastResult && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-[hsl(var(--chart-2))]" />
            <span>{lastResult.summary.rows_valid} respostas válidas de {lastResult.summary.rows_received} linhas</span>
          </div>
        )}
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DashboardKpiCard label="Clientes Pesquisados" value={kpis.total} icon={Users} isLoading={isLoading} />
        <DashboardKpiCard label="Nota Média" value={kpis.mediaGeral?.toFixed(2) ?? '—'} icon={Star} isLoading={isLoading} delay={80} />
        <DashboardKpiCard label="CSAT (%)" value={kpis.csatGeral != null ? `${kpis.csatGeral}%` : '—'} icon={BarChart3} isLoading={isLoading} delay={160} />
        <DashboardKpiCard label="Produtos Avaliados" value={kpis.bandeiras} icon={BarChart3} isLoading={isLoading} delay={240} />
      </div>

      {/* Product Chart */}
      {productChart.length > 0 && (
        <Card className="p-4 space-y-2">
          <h3 className="text-sm font-semibold">Nota Média por Produto</h3>
          <p className="text-xs text-muted-foreground">Escala 0–5 • Apenas avaliações válidas (rated)</p>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productChart} margin={{ top: 8, right: 16, bottom: 60, left: 0 }} layout="horizontal">
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
                <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value: number, name: string) => {
                    if (name === 'media') return [value.toFixed(2), 'Nota Média'];
                    return [value, name];
                  }}
                  labelFormatter={(label) => label}
                />
                <Bar dataKey="media" radius={[4, 4, 0, 0]}>
                  {productChart.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Top Complaints */}
      {topComplaints.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-semibold">Principais Motivos de Insatisfação</h3>
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

      {/* Responses Table */}
      {!isLoading && responses.length === 0 ? (
        <DashboardEmptyState description="Nenhuma pesquisa importada. Use o botão acima para importar a planilha wide-format." />
      ) : (
        <DashboardDataTable
          title="Respostas da Pesquisa"
          subtitle={`${responses.length} respostas`}
          columns={columns}
          data={responses}
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
