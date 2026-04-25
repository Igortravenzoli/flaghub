import { useState, useMemo } from 'react'
import { RotateCcw, AlertTriangle, Clock, Users, ExternalLink } from 'lucide-react'
import { SectorLayout } from '@/components/setores/SectorLayout'
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard'
import { DashboardDataTable, DataTableColumn } from '@/components/dashboard/DashboardDataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  useQaReturnKpis,
  type QaReturnOpenItem,
  type QaReturnBySprint,
  type QaReturnByAssignee,
} from '@/hooks/useQaReturnKpis'

// ── Helpers ───────────────────────────────────────────────────────────────────

function alertStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending: { label: 'Pendente', variant: 'outline' },
    sent: { label: 'Enviado', variant: 'default' },
    failed: { label: 'Falhou', variant: 'destructive' },
    fallback_sent: { label: 'Fallback', variant: 'secondary' },
    skipped: { label: 'Ignorado', variant: 'secondary' },
  }
  const cfg = map[status] ?? { label: status, variant: 'outline' }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

function daysBadge(days: number) {
  const color =
    days >= 5 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
    days >= 2 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {days}d
    </span>
  )
}

// ── Sprint selector ───────────────────────────────────────────────────────────

function SprintSelector({
  sprints,
  selected,
  onChange,
}: {
  sprints: string[]
  selected: string | null
  onChange: (v: string | null) => void
}) {
  return (
    <Select value={selected ?? 'all'} onValueChange={v => onChange(v === 'all' ? null : v)}>
      <SelectTrigger className="w-40 h-8 text-xs">
        <SelectValue placeholder="Sprint" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos os sprints</SelectItem>
        {sprints.map(s => (
          <SelectItem key={s} value={s}>{s}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ── Open Items table columns ──────────────────────────────────────────────────

const openItemsColumns: DataTableColumn<QaReturnOpenItem>[] = [
  {
    key: 'work_item_id',
    header: 'ID',
    render: row => (
      <span className="font-mono text-xs text-muted-foreground">#{row.work_item_id}</span>
    ),
    className: 'w-20',
  },
  {
    key: 'work_item_title',
    header: 'Título',
    render: row => (
      <div className="flex items-center gap-2 min-w-0">
        <span className="truncate text-sm">{row.work_item_title ?? '—'}</span>
        {row.web_url && (
          <a
            href={row.web_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 text-muted-foreground hover:text-primary"
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    ),
  },
  {
    key: 'work_item_type',
    header: 'Tipo',
    render: row => (
      <Badge variant="outline" className="text-xs whitespace-nowrap">
        {row.work_item_type ?? '—'}
      </Badge>
    ),
    className: 'w-28',
  },
  {
    key: 'sprint_code',
    header: 'Sprint',
    render: row => (
      <span className="text-xs font-medium text-muted-foreground">
        {row.sprint_code ?? '—'}
      </span>
    ),
    className: 'w-24',
  },
  {
    key: 'assigned_to_display',
    header: 'Responsável',
    render: row => (
      <span className="text-sm truncate">{row.assigned_to_display ?? 'Não atribuído'}</span>
    ),
    className: 'w-40',
  },
  {
    key: 'days_since_return',
    header: 'Dias em Dev',
    render: row => daysBadge(Number(row.days_since_return ?? 0)),
    className: 'w-28 text-center',
  },
  {
    key: 'alert_status',
    header: 'Alerta',
    render: row => alertStatusBadge(row.alert_status),
    className: 'w-28',
  },
]

// ── By Sprint table columns ───────────────────────────────────────────────────

const bySprintColumns: DataTableColumn<QaReturnBySprint>[] = [
  {
    key: 'sprint_code',
    header: 'Sprint',
    render: row => (
      <span className="font-medium text-sm">{row.sprint_code}</span>
    ),
  },
  {
    key: 'total_returns',
    header: 'Total Retornos',
    render: row => <span className="tabular-nums">{row.total_returns}</span>,
    className: 'w-36 text-right',
  },
  {
    key: 'open_returns',
    header: 'Em aberto',
    render: row => (
      row.open_returns > 0
        ? <span className="tabular-nums text-amber-600 font-medium">{row.open_returns}</span>
        : <span className="tabular-nums text-muted-foreground">0</span>
    ),
    className: 'w-28 text-right',
  },
  {
    key: 'distinct_items',
    header: 'Itens únicos',
    render: row => <span className="tabular-nums text-muted-foreground">{row.distinct_items}</span>,
    className: 'w-28 text-right',
  },
]

// ── By Assignee table columns ─────────────────────────────────────────────────

const byAssigneeColumns: DataTableColumn<QaReturnByAssignee>[] = [
  {
    key: 'assigned_to_display',
    header: 'Responsável',
    render: row => <span className="font-medium text-sm">{row.assigned_to_display}</span>,
  },
  {
    key: 'total_returns',
    header: 'Total Retornos',
    render: row => <span className="tabular-nums">{row.total_returns}</span>,
    className: 'w-36 text-right',
  },
  {
    key: 'open_returns',
    header: 'Em aberto',
    render: row => (
      row.open_returns > 0
        ? <span className="tabular-nums text-amber-600 font-medium">{row.open_returns}</span>
        : <span className="tabular-nums text-muted-foreground">0</span>
    ),
    className: 'w-28 text-right',
  },
  {
    key: 'last_return_at',
    header: 'Último retorno',
    render: row => (
      <span className="text-xs text-muted-foreground">
        {row.last_return_at
          ? new Date(row.last_return_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
          : '—'}
      </span>
    ),
    className: 'w-36',
  },
]

// ── Page ──────────────────────────────────────────────────────────────────────

type ActiveTab = 'open' | 'by_sprint' | 'by_assignee'

export default function QaReturnDashboard() {
  const [selectedSprint, setSelectedSprint] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ActiveTab>('open')

  const { summary, bySprint, byAssignee, openItems, isLoading, refetch } = useQaReturnKpis(selectedSprint)

  // Sprint list for selector (from bySprint data, most recent first)
  const sprintOptions = useMemo(
    () => bySprint.map(s => s.sprint_code).filter(Boolean) as string[],
    [bySprint],
  )

  // Filter open items by selected sprint
  const filteredOpenItems = useMemo(() => {
    if (!selectedSprint) return openItems
    return openItems.filter(i => i.sprint_code === selectedSprint)
  }, [openItems, selectedSprint])

  // Filter bySprint table when a sprint is selected
  const filteredBySprint = useMemo(() => {
    if (!selectedSprint) return bySprint
    return bySprint.filter(s => s.sprint_code === selectedSprint)
  }, [bySprint, selectedSprint])

  const lastUpdate = summary
    ? undefined  // no specific last update timestamp from the RPC
    : undefined

  return (
    <SectorLayout
      title="Retorno QA"
      subtitle="Itens rejeitados de teste e retornados ao desenvolvimento"
      areaKey="infraestrutura"
      syncFunctions={[{ name: 'devops-qa-alert', label: 'Detectar Retornos QA' }]}
    >
      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <SprintSelector
            sprints={sprintOptions}
            selected={selectedSprint}
            onChange={setSelectedSprint}
          />
          {selectedSprint && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => setSelectedSprint(null)}
            >
              Limpar filtro
            </Button>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={refetch}
          disabled={isLoading}
        >
          <RotateCcw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <DashboardKpiCard
          label="Total Retornos"
          value={summary?.total_events ?? 0}
          icon={RotateCcw}
          isLoading={isLoading}
          tooltipFormula="COUNT(devops_qa_return_events)"
          tooltipDescription="Total de eventos de retorno de QA registrados no período."
        />
        <DashboardKpiCard
          label="Em Aberto"
          value={summary?.open_events ?? 0}
          icon={AlertTriangle}
          accent={summary?.open_events ? 'text-amber-500' : undefined}
          isLoading={isLoading}
          tooltipFormula="COUNT(*) WHERE is_open = true"
          tooltipDescription="Itens que ainda estão em desenvolvimento após retorno de QA."
        />
        <DashboardKpiCard
          label="Média de Dias"
          value={summary?.avg_days_open != null ? `${summary.avg_days_open}d` : '—'}
          icon={Clock}
          isLoading={isLoading}
          tooltipFormula="AVG(now() - detected_at) WHERE is_open = true"
          tooltipDescription="Tempo médio que os itens em aberto estão parados em desenvolvimento."
        />
        <DashboardKpiCard
          label="Responsáveis"
          value={byAssignee.length}
          icon={Users}
          isLoading={isLoading}
          tooltipFormula="COUNT(DISTINCT assigned_to_email)"
          tooltipDescription="Número de desenvolvedores com retornos de QA registrados."
        />
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-4 border-b pb-0">
        {(
          [
            { id: 'open', label: `Em aberto (${filteredOpenItems.length})` },
            { id: 'by_sprint', label: 'Por sprint' },
            { id: 'by_assignee', label: 'Por responsável' },
          ] as { id: ActiveTab; label: string }[]
        ).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      {activeTab === 'open' && (
        <DashboardDataTable
          title="Itens em desenvolvimento após retorno de QA"
          subtitle={
            selectedSprint
              ? `${filteredOpenItems.length} itens • Sprint ${selectedSprint}`
              : `${filteredOpenItems.length} itens em aberto`
          }
          columns={openItemsColumns}
          data={filteredOpenItems}
          isLoading={isLoading}
          getRowKey={r => r.id}
          searchPlaceholder="Buscar por título ou responsável..."
          emptyMessage="Nenhum item em desenvolvimento após retorno de QA."
          columnFilters={[
            { key: 'work_item_type', label: 'Tipo' },
            { key: 'sprint_code', label: 'Sprint' },
            { key: 'assigned_to_display', label: 'Responsável' },
            { key: 'alert_status', label: 'Alerta', extractValue: r => r.alert_status },
          ]}
        />
      )}

      {activeTab === 'by_sprint' && (
        <DashboardDataTable
          title="Retornos de QA por sprint"
          subtitle={`${filteredBySprint.length} sprint${filteredBySprint.length !== 1 ? 's' : ''}`}
          columns={bySprintColumns}
          data={filteredBySprint}
          isLoading={isLoading}
          getRowKey={r => r.sprint_code}
          emptyMessage="Nenhum dado por sprint disponível."
          searchPlaceholder="Buscar sprint..."
          disableAutoColumnFilters
        />
      )}

      {activeTab === 'by_assignee' && (
        <>
          {/* Warning banner if there are open items */}
          {byAssignee.some(a => a.open_returns > 0) && (
            <Card className="mb-4 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Responsáveis com itens em aberto
                </CardTitle>
              </CardHeader>
              <CardContent className="py-0 px-4 pb-3">
                <div className="flex flex-wrap gap-2">
                  {byAssignee
                    .filter(a => a.open_returns > 0)
                    .map(a => (
                      <Badge key={a.assigned_to_email ?? a.assigned_to_display} variant="outline" className="border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-300">
                        {a.assigned_to_display} — {a.open_returns} em aberto
                      </Badge>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
          <DashboardDataTable
            title="Retornos de QA por responsável"
            subtitle={`${byAssignee.length} desenvolvedor${byAssignee.length !== 1 ? 'es' : ''}`}
            columns={byAssigneeColumns}
            data={byAssignee}
            isLoading={isLoading}
            getRowKey={r => r.assigned_to_email ?? r.assigned_to_display}
            emptyMessage="Nenhum dado por responsável disponível."
            searchPlaceholder="Buscar responsável..."
            disableAutoColumnFilters
          />
        </>
      )}
    </SectorLayout>
  )
}
