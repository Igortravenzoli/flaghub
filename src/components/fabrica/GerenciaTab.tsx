import React, { useMemo, useState, useCallback } from 'react';
import type { FabricaItem } from '@/hooks/useFabricaKpis';
import type { FeaturePbiSummaryRow, PbiBottleneckRow } from '@/types/pbi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend } from 'recharts';
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  HeartPulse,
  Workflow,
  BarChart3,
  X,
} from 'lucide-react';

type GerenciaTabProps = {
  items: FabricaItem[];
  /** All non-infra items across ALL sprints (no sprint/collaborator filter) — used for comparison histogram */
  allItems: FabricaItem[];
  /** Sorted sprint paths in ascending order */
  sortedSprints: string[];
  isLoading: boolean;
  selectedSprintCodes: string[];
  hasAllSprints: boolean;
  transbordoSummary: {
    count: number;
    total: number;
    pct: number;
    realOverflowItemCount: number;
    realOverflowCount: number;
    realOverflowPct: number;
  };
  healthOverview: {
    total: number;
    verde: number;
    amarelo: number;
    vermelho: number;
  };
  bottlenecks: PbiBottleneckRow[];
  featureRows: FeaturePbiSummaryRow[];
};

function normalizeSprintCode(value: string | null | undefined): string {
  if (!value) return '';
  const code = value.split('\\').pop();
  return (code || value).trim();
}

function isManagerLike(item: FabricaItem): boolean {
  return item.work_item_type === 'Product Backlog Item' || item.work_item_type === 'User Story' || item.work_item_type === 'Bug';
}

function isDoneState(state: string | null | undefined): boolean {
  return state === 'Done' || state === 'Closed' || state === 'Resolved';
}

const ENTREGUE_STATES = new Set(['Aguardando Teste', 'Em Teste', 'Aguardando Deploy']);

function percent(value: number, total: number): string {
  if (total <= 0) return '0,0%';
  return `${((value / total) * 100).toFixed(1).replace('.', ',')}%`;
}

function percentNum(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round(((value / total) * 100) * 10) / 10;
}

function includesRetornoQa(tags: string | null | undefined): boolean {
  return /retorno\s*de\s*qa/i.test(tags || '');
}

function includesAviao(tags: string | null | undefined): boolean {
  return /avi[aã]o/i.test(tags || '');
}

type Bucket = 'priorizacao' | 'bug' | 'retorno_qa' | 'aviao_sprint' | 'aviao_antigo';

function classifyItem(item: FabricaItem, selectedSprintCode: string | null): Bucket {
  const tags = item.tags || '';
  if (includesRetornoQa(tags)) return 'retorno_qa';
  if (includesAviao(tags)) {
    if (!selectedSprintCode) return 'aviao_sprint';
    const current = normalizeSprintCode(item.iteration_path);
    return current === selectedSprintCode ? 'aviao_sprint' : 'aviao_antigo';
  }
  if (item.work_item_type === 'Bug') return 'bug';
  return 'priorizacao';
}

type DrilldownKey =
  | 'demandas'
  | 'priorizado'
  | 'nao_priorizado'
  | 'entregue'
  | 'done'
  | 'priorizado_done'
  | 'priorizado_em_dev'
  | 'np_bug'
  | 'np_retorno_qa'
  | 'np_aviao_sprint'
  | 'np_aviao_antigo'
  | 'entregue_bug'
  | 'entregue_retorno_qa'
  | 'entregue_priorizacao'
  | 'entregue_aviao'
  | 'done_bug'
  | 'done_retorno_qa'
  | 'done_priorizacao'
  | 'done_aviao';

type DrilldownRow = {
  label: string;
  value: number;
  total: number;
  key?: DrilldownKey;
};

// â”€â”€â”€ KPI Summary Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function KpiCard({
  label,
  value,
  total,
  drilldownKey,
  valueColor = 'text-foreground',
  subItems,
  isActive,
  activeSubKey,
  onClick,
  onSubClick,
}: {
  label: string;
  value: number;
  total: number;
  drilldownKey: DrilldownKey;
  valueColor?: string;
  subItems?: { label: string; value: number; total: number; key: DrilldownKey; valueColor?: string }[];
  isActive: boolean;
  activeSubKey: DrilldownKey | null;
  onClick: (key: DrilldownKey) => void;
  onSubClick: (key: DrilldownKey) => void;
}) {
  const pct = total > 0 ? `${((value / total) * 100).toFixed(1).replace('.', ',')}%` : '0,0%';
  return (
    <Card
      className={`cursor-pointer transition-all select-none ${
        isActive ? 'ring-2 ring-primary shadow-md bg-primary/5' : 'hover:shadow-md hover:border-primary/30'
      }`}
      onClick={() => onClick(drilldownKey)}
    >
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">{label}</p>
        <div className={`text-3xl font-bold leading-none ${valueColor}`}>
          {value}
          <span className="text-base font-semibold ml-2 text-muted-foreground">| {pct}</span>
        </div>
        {subItems && subItems.length > 0 && (
          <div className="mt-3 pt-2 border-t space-y-0.5">
            {subItems.map((sub) => {
              const subPct = sub.total > 0 ? `${((sub.value / sub.total) * 100).toFixed(1).replace('.', ',')}%` : '0,0%';
              const isSubActive = activeSubKey === sub.key;
              return (
                <button
                  key={sub.key}
                  type="button"
                  className={`w-full text-left flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] transition-colors ${
                    isSubActive ? 'bg-primary/10 font-medium' : 'hover:bg-muted/50'
                  }`}
                  onClick={(e) => { e.stopPropagation(); onSubClick(sub.key); }}
                >
                  <span className={`font-semibold whitespace-nowrap ${sub.valueColor || 'text-foreground'}`}>
                    {sub.value} | {subPct}
                  </span>
                  <span className="text-muted-foreground truncate">{sub.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// â”€â”€â”€ Main Export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function GerenciaTab({
  items,
  allItems,
  sortedSprints,
  isLoading,
  selectedSprintCodes,
  hasAllSprints,
  transbordoSummary,
  healthOverview,
  bottlenecks,
  featureRows,
}: GerenciaTabProps) {
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());
  const [selectedDrilldown, setSelectedDrilldown] = useState<{ key: DrilldownKey; label: string } | null>(null);
  const [histogramMode, setHistogramMode] = useState<'absoluto' | 'percentual'>('absoluto');

  const toggleBlock = useCallback((key: string) => {
    setCollapsedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const isCollapsed = useCallback((key: string) => collapsedBlocks.has(key), [collapsedBlocks]);

  const renderSectionHeader = useCallback((key: string, label: string, icon?: React.ReactNode) => {
    const collapsed = isCollapsed(key);
    return (
      <button
        type="button"
        className="w-full flex items-center gap-2 text-left py-2 px-1 text-sm font-semibold text-foreground hover:text-primary transition-colors group border-b border-border/50 mb-2"
        onClick={() => toggleBlock(key)}
      >
        {icon && <span className="text-primary/80">{icon}</span>}
        <span className="flex-1">{label}</span>
        {collapsed
          ? <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />}
      </button>
    );
  }, [isCollapsed, toggleBlock]);

  const selectedSingleSprintCode = useMemo(() => {
    if (hasAllSprints || selectedSprintCodes.length !== 1) return null;
    return normalizeSprintCode(selectedSprintCodes[0]);
  }, [hasAllSprints, selectedSprintCodes]);

  // â”€â”€ Current sprint metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const managerItems = useMemo(
    () => items.filter((item) => item.count_in_kpi !== false && isManagerLike(item)),
    [items],
  );

  const metrics = useMemo(() => {
    const total = managerItems.length;
    let priorizacao = 0, bug = 0, retornoQa = 0, aviaoSprint = 0, aviaoAntigo = 0;
    let entregueTotal = 0, doneTotal = 0;
    let doneBug = 0, doneRetornoQa = 0, donePriorizacao = 0, doneAviao = 0;
    let entregueBug = 0, entregueRetornoQa = 0, entreguePriorizacao = 0, entregueAviao = 0;
    let priorizadoDone = 0, priorizadoEmDev = 0;

    for (const item of managerItems) {
      const bucket = classifyItem(item, selectedSingleSprintCode);
      const done = isDoneState(item.state);
      const entregue = ENTREGUE_STATES.has(item.state || '');

      if (bucket === 'priorizacao') priorizacao++;
      else if (bucket === 'bug') bug++;
      else if (bucket === 'retorno_qa') retornoQa++;
      else if (bucket === 'aviao_sprint') aviaoSprint++;
      else aviaoAntigo++;

      if (entregue) {
        entregueTotal++;
        if (bucket === 'bug') entregueBug++;
        else if (bucket === 'retorno_qa') entregueRetornoQa++;
        else if (bucket === 'priorizacao') entreguePriorizacao++;
        else entregueAviao++;
      }
      if (bucket === 'priorizacao') {
        if (done) priorizadoDone++; else priorizadoEmDev++;
      }
      if (done) {
        doneTotal++;
        if (bucket === 'bug') doneBug++;
        else if (bucket === 'retorno_qa') doneRetornoQa++;
        else if (bucket === 'priorizacao') donePriorizacao++;
        else doneAviao++;
      }
    }

    return {
      total, priorizacao,
      naoPriorizado: bug + retornoQa + aviaoSprint + aviaoAntigo,
      entregue: entregueTotal, done: doneTotal,
      priorizadoDone, priorizadoEmDev,
      bug, retornoQa, aviaoSprint, aviaoAntigo,
      entregueBug, entregueRetornoQa, entreguePriorizacao, entregueAviao,
      doneBug, doneRetornoQa, donePriorizacao, doneAviao,
    };
  }, [managerItems, selectedSingleSprintCode]);

  // â”€â”€ Sprint comparison: current sprint + 3 previous â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const comparisonSprints = useMemo(() => {
    if (sortedSprints.length === 0) return [];
    let refIdx: number;
    if (hasAllSprints || selectedSprintCodes.length === 0) {
      refIdx = sortedSprints.length - 1;
    } else {
      const selectedSet = new Set(selectedSprintCodes);
      const found = [...sortedSprints].reverse().find((sp) => selectedSet.has(sp));
      refIdx = found ? sortedSprints.indexOf(found) : sortedSprints.length - 1;
    }
    return sortedSprints.slice(Math.max(0, refIdx - 3), refIdx + 1);
  }, [sortedSprints, selectedSprintCodes, hasAllSprints]);

  const comparisonData = useMemo(() => {
    return comparisonSprints.map((sprintPath) => {
      const sprintCode = normalizeSprintCode(sprintPath);
      const sprintItems = allItems.filter(
        (i) => i.iteration_path === sprintPath && i.count_in_kpi !== false && isManagerLike(i),
      );
      const total = sprintItems.length;
      let priorizacao = 0, naoPriorizado = 0, entregue = 0, done = 0;
      for (const item of sprintItems) {
        const bucket = classifyItem(item, sprintCode);
        if (bucket === 'priorizacao') priorizacao++; else naoPriorizado++;
        if (ENTREGUE_STATES.has(item.state || '')) entregue++;
        if (isDoneState(item.state)) done++;
      }
      if (histogramMode === 'percentual') {
        return {
          sprint: sprintCode,
          total,
          Priorizado: percentNum(priorizacao, total),
          'NÃ£o Priorizado': percentNum(naoPriorizado, total),
          Entregue: percentNum(entregue, total),
          Done: percentNum(done, total),
        };
      }
      return { sprint: sprintCode, total, Priorizado: priorizacao, 'NÃ£o Priorizado': naoPriorizado, Entregue: entregue, Done: done };
    });
  }, [comparisonSprints, allItems, histogramMode]);

  // â”€â”€ Drilldown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const getDrilldownItems = useCallback((key: DrilldownKey): FabricaItem[] => {
    return managerItems.filter((item) => {
      const bucket = classifyItem(item, selectedSingleSprintCode);
      const done = isDoneState(item.state);
      const entregue = ENTREGUE_STATES.has(item.state || '');
      switch (key) {
        case 'demandas': return true;
        case 'priorizado': return bucket === 'priorizacao';
        case 'nao_priorizado': return bucket !== 'priorizacao';
        case 'entregue': return entregue;
        case 'done': return done;
        case 'priorizado_done': return bucket === 'priorizacao' && done;
        case 'priorizado_em_dev': return bucket === 'priorizacao' && !done;
        case 'np_bug': return bucket === 'bug';
        case 'np_retorno_qa': return bucket === 'retorno_qa';
        case 'np_aviao_sprint': return bucket === 'aviao_sprint';
        case 'np_aviao_antigo': return bucket === 'aviao_antigo';
        case 'entregue_bug': return entregue && bucket === 'bug';
        case 'entregue_retorno_qa': return entregue && bucket === 'retorno_qa';
        case 'entregue_priorizacao': return entregue && bucket === 'priorizacao';
        case 'entregue_aviao': return entregue && (bucket === 'aviao_sprint' || bucket === 'aviao_antigo');
        case 'done_bug': return done && bucket === 'bug';
        case 'done_retorno_qa': return done && bucket === 'retorno_qa';
        case 'done_priorizacao': return done && bucket === 'priorizacao';
        case 'done_aviao': return done && (bucket === 'aviao_sprint' || bucket === 'aviao_antigo');
        default: return false;
      }
    });
  }, [managerItems, selectedSingleSprintCode]);

  const handleDrilldown = useCallback((key: DrilldownKey, label: string) => {
    setSelectedDrilldown((prev) => prev?.key === key ? null : { key, label });
  }, []);

  const drilldownItems = useMemo(
    () => selectedDrilldown ? getDrilldownItems(selectedDrilldown.key) : [],
    [selectedDrilldown, getDrilldownItems],
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  const sprintLabel = hasAllSprints
    ? 'Todas as sprints'
    : selectedSprintCodes.length === 1
      ? normalizeSprintCode(selectedSprintCodes[0])
      : `${selectedSprintCodes.length} sprints`;

  return (
    <div className="space-y-4">
      {renderSectionHeader('kpi_cards', 'Visão Geral — ' + sprintLabel, <BarChart3 className="h-4 w-4" />)}
      {!isCollapsed('kpi_cards') && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            <KpiCard
              label="Demandas"
              value={metrics.total}
              total={metrics.total}
              drilldownKey="demandas"
              valueColor="text-primary"
              isActive={selectedDrilldown?.key === 'demandas'}
              activeSubKey={selectedDrilldown?.key ?? null}
              onClick={(k) => handleDrilldown(k, 'Demandas')}
              onSubClick={(k) => handleDrilldown(k, k)}
            />
            <KpiCard
              label="Priorizado"
              value={metrics.priorizacao}
              total={metrics.total}
              drilldownKey="priorizado"
              valueColor="text-blue-600 dark:text-blue-400"
              isActive={selectedDrilldown?.key === 'priorizado'}
              activeSubKey={selectedDrilldown?.key ?? null}
              onClick={(k) => handleDrilldown(k, 'Priorizado')}
              onSubClick={(k) => handleDrilldown(k, k)}
              subItems={[
                { key: 'priorizado_done', label: 'Entregue/Done', value: metrics.priorizadoDone, total: metrics.priorizacao, valueColor: 'text-emerald-600' },
                { key: 'priorizado_em_dev', label: 'Em dev', value: metrics.priorizadoEmDev, total: metrics.priorizacao, valueColor: 'text-orange-500' },
              ]}
            />
            <KpiCard
              label="Não Priorizado"
              value={metrics.naoPriorizado}
              total={metrics.total}
              drilldownKey="nao_priorizado"
              valueColor="text-destructive"
              isActive={selectedDrilldown?.key === 'nao_priorizado'}
              activeSubKey={selectedDrilldown?.key ?? null}
              onClick={(k) => handleDrilldown(k, 'Não Priorizado')}
              onSubClick={(k) => handleDrilldown(k, k)}
              subItems={[
                { key: 'np_bug', label: 'Bug', value: metrics.bug, total: metrics.naoPriorizado, valueColor: 'text-destructive' },
                { key: 'np_retorno_qa', label: 'Retorno QA', value: metrics.retornoQa, total: metrics.naoPriorizado, valueColor: 'text-amber-600' },
                { key: 'np_aviao_sprint', label: selectedSingleSprintCode ? `Avião ${selectedSingleSprintCode}` : 'Avião', value: metrics.aviaoSprint, total: metrics.naoPriorizado },
                { key: 'np_aviao_antigo', label: 'Avião Antigo', value: metrics.aviaoAntigo, total: metrics.naoPriorizado },
              ]}
            />
            <KpiCard
              label="Entregue"
              value={metrics.entregue}
              total={metrics.total}
              drilldownKey="entregue"
              valueColor="text-blue-500"
              isActive={selectedDrilldown?.key === 'entregue'}
              activeSubKey={selectedDrilldown?.key ?? null}
              onClick={(k) => handleDrilldown(k, 'Entregue')}
              onSubClick={(k) => handleDrilldown(k, k)}
              subItems={[
                { key: 'entregue_bug', label: 'Bug', value: metrics.entregueBug, total: metrics.entregue, valueColor: 'text-destructive' },
                { key: 'entregue_retorno_qa', label: 'Retorno QA', value: metrics.entregueRetornoQa, total: metrics.entregue, valueColor: 'text-amber-600' },
                { key: 'entregue_priorizacao', label: 'Priorização', value: metrics.entreguePriorizacao, total: metrics.entregue, valueColor: 'text-blue-600' },
                { key: 'entregue_aviao', label: 'Avião', value: metrics.entregueAviao, total: metrics.entregue },
              ]}
            />
            <KpiCard
              label="Done"
              value={metrics.done}
              total={metrics.total}
              drilldownKey="done"
              valueColor="text-emerald-600"
              isActive={selectedDrilldown?.key === 'done'}
              activeSubKey={selectedDrilldown?.key ?? null}
              onClick={(k) => handleDrilldown(k, 'Done')}
              onSubClick={(k) => handleDrilldown(k, k)}
              subItems={[
                { key: 'done_bug', label: 'Bug', value: metrics.doneBug, total: metrics.done, valueColor: 'text-destructive' },
                { key: 'done_retorno_qa', label: 'Retorno QA', value: metrics.doneRetornoQa, total: metrics.done, valueColor: 'text-amber-600' },
                { key: 'done_priorizacao', label: 'Priorização', value: metrics.donePriorizacao, total: metrics.done, valueColor: 'text-blue-600' },
                { key: 'done_aviao', label: 'Avião', value: metrics.doneAviao, total: metrics.done },
              ]}
            />
          </div>

          {/* Drilldown table — shown when a card/sub-item is active */}
          {selectedDrilldown && (
            <Card className="animate-fade-in">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-medium">
                    Detalhamento — {selectedDrilldown.label}
                    <Badge variant="secondary" className="ml-2 text-xs">{drilldownItems.length}</Badge>
                  </CardTitle>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setSelectedDrilldown(null)}>
                    <X className="h-3.5 w-3.5" /> Fechar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto max-h-[320px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs w-16">ID</TableHead>
                        <TableHead className="text-xs w-28">Tipo</TableHead>
                        <TableHead className="text-xs">Título</TableHead>
                        <TableHead className="text-xs w-44">Responsável</TableHead>
                        <TableHead className="text-xs w-32">Estado</TableHead>
                        <TableHead className="text-xs w-24">Sprint</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drilldownItems.slice(0, 120).map((item) => (
                        <TableRow key={`${item.id ?? 'x'}-${item.title ?? ''}`}>
                          <TableCell className="text-xs font-mono">
                            {item.web_url ? (
                              <a href={item.web_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                {item.id}
                              </a>
                            ) : (item.id ?? '—')}
                          </TableCell>
                          <TableCell className="text-xs">{item.work_item_type ?? '—'}</TableCell>
                          <TableCell className="text-xs max-w-[400px] truncate">{item.title ?? '—'}</TableCell>
                          <TableCell className="text-xs">{item.assigned_to_display || '—'}</TableCell>
                          <TableCell className="text-xs">{item.state || '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{normalizeSprintCode(item.iteration_path) || '—'}</TableCell>
                        </TableRow>
                      ))}
                      {drilldownItems.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                            Sem itens para este KPI no escopo atual.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                {drilldownItems.length > 120 && (
                  <p className="text-[11px] text-muted-foreground px-4 py-2">
                    Exibindo 120 de {drilldownItems.length} itens.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {renderSectionHeader('hist_comparacao', 'Comparação por Sprint (sprint atual + 3 anteriores)', <BarChart3 className="h-4 w-4" />)}
      {!isCollapsed('hist_comparacao') && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                Evolução KPIs
                <span className="text-xs font-normal text-muted-foreground">
                  {comparisonData.map((d) => d.sprint).join(' · ')}
                </span>
              </CardTitle>
              <div className="flex gap-1">
                <Button
                  variant={histogramMode === 'absoluto' ? 'default' : 'outline'}
                  size="sm" className="h-7 text-xs"
                  onClick={() => setHistogramMode('absoluto')}
                >
                  Absoluto
                </Button>
                <Button
                  variant={histogramMode === 'percentual' ? 'default' : 'outline'}
                  size="sm" className="h-7 text-xs"
                  onClick={() => setHistogramMode('percentual')}
                >
                  Percentual
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {comparisonData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Sem dados de sprint para comparação.</p>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonData} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="sprint" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit={histogramMode === 'percentual' ? '%' : ''} />
                    <RechartsTooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                      formatter={(value: number, name: string) => [
                        histogramMode === 'percentual' ? `${value}%` : value, name,
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Bar dataKey="Priorizado" fill="hsl(210,90%,55%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Não Priorizado" fill="hsl(0,72%,56%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Entregue" fill="hsl(210,70%,68%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Done" fill="hsl(142,60%,45%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-2">
              Considera todos os colaboradores do setor, independente do filtro de colaborador ativo.
            </p>
          </CardContent>
        </Card>
      )}

      {renderSectionHeader('gerencia_transbordo', 'Transbordo', <AlertTriangle className="h-4 w-4" />)}
      {!isCollapsed('gerencia_transbordo') && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Com Transbordo', value: transbordoSummary.count, sub: `de ${transbordoSummary.total}`, color: transbordoSummary.pct > 40 ? 'text-destructive' : 'text-amber-600' },
            { label: 'Taxa Transbordo', value: `${transbordoSummary.pct}%`, sub: 'sprint-over-sprint', color: transbordoSummary.pct > 40 ? 'text-destructive' : 'text-amber-600' },
            { label: 'Transbordo Real', value: transbordoSummary.realOverflowItemCount, sub: 'itens ≥ 2 transbordos', color: 'text-foreground' },
            { label: 'Ocorrências Reais', value: transbordoSummary.realOverflowCount, sub: 'total de excessos', color: 'text-foreground' },
            { label: 'Taxa Real', value: `${transbordoSummary.realOverflowPct}%`, sub: 'sobre a base', color: transbordoSummary.realOverflowPct > 20 ? 'text-destructive' : 'text-muted-foreground' },
            { label: 'Base Comparativa', value: transbordoSummary.total, sub: 'PBIs / USs', color: 'text-muted-foreground' },
          ].map(({ label, value, sub, color }) => (
            <Card key={label}>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">{label}</p>
                <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {renderSectionHeader('gerencia_saude', 'Saúde da Esteira', <HeartPulse className="h-4 w-4" />)}
      {!isCollapsed('gerencia_saude') && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Monitorados', value: healthOverview.total, barColor: 'bg-primary', color: 'text-foreground' },
            { label: 'Saudável', value: healthOverview.verde, barColor: 'bg-emerald-500', color: 'text-emerald-600' },
            { label: 'Atenção', value: healthOverview.amarelo, barColor: 'bg-amber-500', color: 'text-amber-600' },
            { label: 'Crítico', value: healthOverview.vermelho, barColor: 'bg-destructive', color: 'text-destructive' },
          ].map(({ label, value, barColor, color }) => (
            <Card key={label}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
                  <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
                </div>
                {healthOverview.total > 0 && (
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">{percent(value, healthOverview.total)}</p>
                    <div className="w-12 h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${percentNum(value, healthOverview.total)}%` }} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {renderSectionHeader('gerencia_gargalos', 'Gargalos da Esteira', <AlertTriangle className="h-4 w-4" />)}
      {!isCollapsed('gerencia_gargalos') && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Etapa</TableHead>
                  <TableHead className="text-xs text-right">Média (d)</TableHead>
                  <TableHead className="text-xs text-right">Máx (d)</TableHead>
                  <TableHead className="text-xs text-right">Itens</TableHead>
                  <TableHead className="text-xs text-right">Atraso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bottlenecks.map((row) => (
                  <TableRow key={row.stage_key}>
                    <TableCell className="text-xs">{row.stage_label}</TableCell>
                    <TableCell className="text-xs text-right">{row.avg_days_in_stage}</TableCell>
                    <TableCell className="text-xs text-right">{row.max_days_in_stage}</TableCell>
                    <TableCell className="text-xs text-right">{row.count_in_stage}</TableCell>
                    <TableCell className="text-xs text-right">
                      <Badge variant={Number(row.count_overtime) > 0 ? 'destructive' : 'outline'} className="text-[10px]">
                        {row.count_overtime}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {bottlenecks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-xs text-muted-foreground">
                      Sem dados de gargalo para o filtro atual.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {renderSectionHeader('gerencia_feature', 'Saúde por Feature', <Workflow className="h-4 w-4" />)}
      {!isCollapsed('gerencia_feature') && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Feature</TableHead>
                  <TableHead className="text-xs text-right">PBIs</TableHead>
                  <TableHead className="text-xs text-right">Bugs</TableHead>
                  <TableHead className="text-xs text-right text-emerald-600">Verde</TableHead>
                  <TableHead className="text-xs text-right text-amber-600">Amarelo</TableHead>
                  <TableHead className="text-xs text-right text-destructive">Vermelho</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {featureRows.slice(0, 40).map((row, idx) => (
                  <TableRow key={`${row.feature_id ?? idx}-${row.epic_id ?? 'epic'}`}>
                    <TableCell className="text-xs max-w-[320px] truncate">{row.feature_title || 'Sem feature'}</TableCell>
                    <TableCell className="text-xs text-right">{row.pbi_count}</TableCell>
                    <TableCell className="text-xs text-right">{row.bug_count}</TableCell>
                    <TableCell className="text-xs text-right font-semibold text-emerald-600">{row.verde_count}</TableCell>
                    <TableCell className="text-xs text-right font-semibold text-amber-600">{row.amarelo_count}</TableCell>
                    <TableCell className="text-xs text-right font-semibold text-destructive">{row.vermelho_count}</TableCell>
                  </TableRow>
                ))}
                {featureRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                      Sem dados de feature para o filtro atual.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
