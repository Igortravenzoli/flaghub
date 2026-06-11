import React, { useMemo, useState, useCallback } from 'react';
import type { FabricaItem } from '@/hooks/useFabricaKpis';
import type { SprintSnapshotRow, SnapshotScopeBreakdown } from '@/hooks/useSprintSnapshots';
import { getOfficialSprintRange } from '@/lib/sprintCalendar';
import type { FeaturePbiSummaryRow, PbiBottleneckRow } from '@/types/pbi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend } from 'recharts';
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  HeartPulse,
  Workflow,
  BarChart3,
  Camera,
  Zap,
  X,
} from 'lucide-react';
import { Clock, Gauge, TrendingUp } from 'lucide-react';

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
  performance?: GerenciaPerformance;
  risks?: GerenciaRisks;
  /** Fábrica (Epic raiz) por work item id — habilita a visão por fábrica */
  fabricaByItemId?: Record<number, string>;
  /** Fotografias congeladas por sprint_code — sprints fechadas usam a fotografia */
  snapshots?: Record<string, SprintSnapshotRow>;
};

type GerenciaPerformance = {
  leadTimeMedio: number | null;
  leadTimeSource: string;
  velocidadeMedia: number | null;
  velocidadeSource: string;
  sprintCount: number;
  isLoading: boolean;
};

type GerenciaRisks = {
  transbordoPct: number | null;
  transbordoCount: number;
  transbordoTotal: number;
  qaOpen: number;
  qaTotal: number;
  qaAvg: number | null;
  qaMax: number | null;
  onQaClick?: () => void;
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
  return /(^|;)\s*retorno\s*(de\s*)?qa\s*(;|$)/i.test(tags || '');
}

// Aceita "AVIAO" e variantes compostas legadas ("AVIAO ANTIGO", "AVIAO TRANSBORDADO")
function includesAviao(tags: string | null | undefined): boolean {
  return /(^|;)\s*avi[aã]o\b/i.test(tags || '');
}

function includesAviaoTransbordadoLegado(tags: string | null | undefined): boolean {
  return /(^|;)\s*avi[aã]o\s+(antigo|transbordad[oa])\s*(;|$)/i.test(tags || '');
}

function includesTransbordo(tags: string | null | undefined): boolean {
  return /(^|;)\s*transbord(o|ad[oa])\s*(;|$)/i.test(tags || '');
}

function includesPriorizacao(tags: string | null | undefined): boolean {
  return /(^|;)\s*prioriza[cç][aã]o\s*(;|$)/i.test(tags || '');
}

function includesBugTag(tags: string | null | undefined): boolean {
  return /(^|;)\s*bug\s*(;|$)/i.test(tags || '');
}

type Bucket =
  | 'priorizacao'
  | 'priorizacao_transbordo'
  | 'bug'
  | 'retorno_qa'
  | 'aviao_sprint'
  | 'aviao_transbordado';

/**
 * Regras de classificação (alinhadas com a planilha gerencial da Fábrica):
 * 1. Retorno de QA: qualquer item (Avião, Bug, PBI) com tag "Retorno de QA"
 * 2. Avião da sprint: tag Avião sem tag Transbordo nem Retorno de QA
 *    Avião Transbordado: tag Avião + tag Transbordo, sem Retorno de QA
 * 3. Priorização: tag Priorização sem Retorno de QA nem Transbordo (inclui Bugs priorizados)
 *    Transbordo: tag Priorização + tag Transbordo, sem Retorno de QA
 * 4. Bug: tipo Bug (ou tag BUG) sem tag Retorno de QA
 */
function classifyItem(item: FabricaItem): Bucket {
  const tags = item.tags || '';
  if (includesRetornoQa(tags)) {
    return 'retorno_qa';
  }
  if (includesAviao(tags)) {
    return (includesTransbordo(tags) || includesAviaoTransbordadoLegado(tags))
      ? 'aviao_transbordado'
      : 'aviao_sprint';
  }
  if (includesPriorizacao(tags)) {
    return includesTransbordo(tags) ? 'priorizacao_transbordo' : 'priorizacao';
  }
  if (item.work_item_type === 'Bug' || includesBugTag(tags)) return 'bug';
  return 'priorizacao';
}

function isPriorizadoBucket(bucket: Bucket): boolean {
  return bucket === 'priorizacao' || bucket === 'priorizacao_transbordo';
}

/** "[K8] - Squad" → "K8"; "FLEXX Squad" → "FLEXX" — rótulo curto de fábrica */
function cleanFabricaName(name: string): string {
  const bracket = name.match(/\[([^\]]+)\]/);
  if (bracket) return bracket[1].trim().toUpperCase();
  return name.replace(/\s*-?\s*squad\s*$/i, '').trim();
}

/** Sprint já encerrou? (fim oficial — sexta 23:59 — anterior a hoje) */
function isSprintClosed(sprintCode: string): boolean {
  const range = getOfficialSprintRange(sprintCode);
  if (!range) return false;
  const endOfDay = new Date(range.to);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay.getTime() < Date.now();
}

type GerenciaMetrics = {
  total: number;
  priorizacao: number;
  priorizacaoTransbordo: number;
  naoPriorizado: number;
  entregue: number;
  done: number;
  priorizadoDone: number;
  priorizadoEmDev: number;
  bug: number;
  retornoQa: number;
  aviaoSprint: number;
  aviaoTransbordado: number;
  entregueBug: number;
  entregueRetornoQa: number;
  entreguePriorizacao: number;
  entregueAviao: number;
  doneBug: number;
  doneRetornoQa: number;
  donePriorizacao: number;
  doneAviao: number;
};

/** Converte o escopo congelado do snapshot no mesmo shape dos KPIs ao vivo */
function metricsFromSnapshotScope(s: SnapshotScopeBreakdown): GerenciaMetrics {
  return {
    total: s.total,
    priorizacao: s.cats.priorizacao + s.cats.priorizacao_transbordo,
    priorizacaoTransbordo: s.cats.priorizacao_transbordo,
    naoPriorizado: s.cats.bug + s.cats.retorno_qa + s.cats.aviao_sprint + s.cats.aviao_transbordado,
    entregue: s.entregue.total,
    done: s.done.total,
    priorizadoDone: s.priorizado_done,
    priorizadoEmDev: s.priorizado_em_dev,
    bug: s.cats.bug,
    retornoQa: s.cats.retorno_qa,
    aviaoSprint: s.cats.aviao_sprint,
    aviaoTransbordado: s.cats.aviao_transbordado,
    entregueBug: s.entregue.bug,
    entregueRetornoQa: s.entregue.retorno_qa,
    entreguePriorizacao: s.entregue.priorizacao,
    entregueAviao: s.entregue.aviao,
    doneBug: s.done.bug,
    doneRetornoQa: s.done.retorno_qa,
    donePriorizacao: s.done.priorizacao,
    doneAviao: s.done.aviao,
  };
}

/** Breakdown do snapshot com chaves de fábrica normalizadas */
function normalizedFabricas(snap: SprintSnapshotRow | null | undefined): Record<string, SnapshotScopeBreakdown> {
  const out: Record<string, SnapshotScopeBreakdown> = {};
  if (!snap?.category_breakdown?.fabricas) return out;
  for (const [name, scope] of Object.entries(snap.category_breakdown.fabricas)) {
    out[cleanFabricaName(name)] = scope;
  }
  return out;
}

type DrilldownKey =
  | 'demandas'
  | 'priorizado'
  | 'nao_priorizado'
  | 'entregue'
  | 'done'
  | 'priorizado_done'
  | 'priorizado_em_dev'
  | 'priorizado_transbordo'
  | 'np_bug'
  | 'np_retorno_qa'
  | 'np_aviao_sprint'
  | 'np_aviao_transbordado'
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
/** Mini-valor histórico exibido nos cards (fotografia de sprints anteriores) */
type KpiHistoryEntry = { code: string; value: number; isPhoto: boolean };

function KpiCard({
  label,
  value,
  total,
  drilldownKey,
  valueColor = 'text-foreground',
  subItems,
  history,
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
  /** Sprints anteriores lado a lado, em tom claro (fotografia de fim de sprint) */
  history?: KpiHistoryEntry[];
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
        {history && history.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {history.map((h) => (
              <span
                key={h.code}
                className="inline-flex items-center gap-1 rounded border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground/80"
                title={h.isPhoto
                  ? `${h.code} — fotografia de fim de sprint (23:59)`
                  : `${h.code} — estado atual do DevOps`}
              >
                {h.isPhoto && <Camera className="h-2.5 w-2.5 shrink-0" />}
                <span>{h.code.replace(/-\d{4}$/, '')}</span>
                <span className="font-semibold text-foreground/60">{h.value}</span>
              </span>
            ))}
          </div>
        )}
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
  performance,
  risks,
  fabricaByItemId,
  snapshots,
}: GerenciaTabProps) {
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());
  const [selectedDrilldown, setSelectedDrilldown] = useState<{ key: DrilldownKey; label: string } | null>(null);
  const [histogramMode, setHistogramMode] = useState<'absoluto' | 'percentual'>('absoluto');
  const [selectedFabrica, setSelectedFabrica] = useState<string | null>(null);

  const fabricaOf = useCallback((item: FabricaItem): string | null => {
    if (!fabricaByItemId || item.id == null) return null;
    const raw = fabricaByItemId[item.id];
    return raw ? cleanFabricaName(raw) : null;
  }, [fabricaByItemId]);

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

  // ── Modo fotografia: 1 sprint fechada selecionada + snapshot com breakdown ──
  const photoSnapshot = useMemo(() => {
    if (!snapshots || !selectedSingleSprintCode) return null;
    if (!isSprintClosed(selectedSingleSprintCode)) return null;
    const snap = snapshots[selectedSingleSprintCode];
    return snap?.category_breakdown ? snap : null;
  }, [snapshots, selectedSingleSprintCode]);

  const photoFabricas = useMemo(() => normalizedFabricas(photoSnapshot), [photoSnapshot]);

  const ZERO_SCOPE: SnapshotScopeBreakdown = useMemo(() => ({
    total: 0,
    cats: { priorizacao: 0, priorizacao_transbordo: 0, bug: 0, retorno_qa: 0, aviao_sprint: 0, aviao_transbordado: 0 },
    entregue: { total: 0, bug: 0, retorno_qa: 0, priorizacao: 0, aviao: 0 },
    done: { total: 0, bug: 0, retorno_qa: 0, priorizacao: 0, aviao: 0 },
    priorizado_done: 0,
    priorizado_em_dev: 0,
  }), []);

  const photoScope = useMemo(() => {
    if (!photoSnapshot?.category_breakdown) return null;
    if (selectedFabrica) return photoFabricas[selectedFabrica] ?? ZERO_SCOPE;
    return photoSnapshot.category_breakdown.geral;
  }, [photoSnapshot, photoFabricas, selectedFabrica, ZERO_SCOPE]);

  const isPhotoMode = photoScope !== null;

  // â”€â”€ Current sprint metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const allManagerItems = useMemo(
    () => items.filter((item) => item.count_in_kpi !== false && isManagerLike(item)),
    [items],
  );

  // Fábricas disponíveis no escopo atual (ordenadas por volume).
  // Em modo fotografia, a lista vem do breakdown congelado da sprint.
  const fabricas = useMemo(() => {
    if (photoSnapshot) {
      return Object.entries(photoFabricas)
        .filter(([name]) => name !== 'Sem fábrica')
        .sort((a, b) => b[1].total - a[1].total)
        .map(([name]) => name);
    }
    if (!fabricaByItemId) return [];
    const counts = new Map<string, number>();
    for (const item of allManagerItems) {
      const f = fabricaOf(item);
      if (f) counts.set(f, (counts.get(f) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [photoSnapshot, photoFabricas, allManagerItems, fabricaByItemId, fabricaOf]);

  // Escopo dos KPIs: geral ou uma fábrica específica (mesma visualização do geral)
  const managerItems = useMemo(
    () => selectedFabrica
      ? allManagerItems.filter((item) => fabricaOf(item) === selectedFabrica)
      : allManagerItems,
    [allManagerItems, selectedFabrica, fabricaOf],
  );

  // Retorno QA e Bug por fábrica (sempre sobre o escopo completo da sprint).
  // Em modo fotografia, vem do breakdown congelado.
  const qaBugPorFabrica = useMemo(() => {
    if (photoSnapshot) {
      return Object.entries(photoFabricas)
        .map(([fabrica, s]) => ({
          fabrica,
          total: s.total,
          retornoQa: s.cats.retorno_qa,
          bug: s.cats.bug,
          bugQa: s.cats.retorno_qa + s.cats.bug,
        }))
        .sort((a, b) => b.bugQa - a.bugQa);
    }
    if (!fabricaByItemId) return [];
    const map = new Map<string, { total: number; retornoQa: number; bug: number }>();
    for (const item of allManagerItems) {
      const f = fabricaOf(item) || 'Sem fábrica';
      const entry = map.get(f) ?? { total: 0, retornoQa: 0, bug: 0 };
      entry.total++;
      const bucket = classifyItem(item);
      if (bucket === 'retorno_qa') entry.retornoQa++;
      else if (bucket === 'bug') entry.bug++;
      map.set(f, entry);
    }
    return [...map.entries()]
      .map(([fabrica, v]) => ({ fabrica, ...v, bugQa: v.retornoQa + v.bug }))
      .sort((a, b) => b.bugQa - a.bugQa);
  }, [photoSnapshot, photoFabricas, allManagerItems, fabricaByItemId, fabricaOf]);

  const liveMetrics = useMemo(() => {
    const total = managerItems.length;
    let priorizacaoPura = 0, priorizacaoTransbordo = 0, bug = 0, retornoQa = 0, aviaoSprint = 0, aviaoTransbordado = 0;
    let entregueTotal = 0, doneTotal = 0;
    let doneBug = 0, doneRetornoQa = 0, donePriorizacao = 0, doneAviao = 0;
    let entregueBug = 0, entregueRetornoQa = 0, entreguePriorizacao = 0, entregueAviao = 0;
    let priorizadoDone = 0, priorizadoEmDev = 0;

    for (const item of managerItems) {
      const bucket = classifyItem(item);
      const done = isDoneState(item.state);
      const entregue = ENTREGUE_STATES.has(item.state || '');

      if (bucket === 'priorizacao') priorizacaoPura++;
      else if (bucket === 'priorizacao_transbordo') priorizacaoTransbordo++;
      else if (bucket === 'bug') bug++;
      else if (bucket === 'retorno_qa') retornoQa++;
      else if (bucket === 'aviao_sprint') aviaoSprint++;
      else aviaoTransbordado++;

      if (entregue) {
        entregueTotal++;
        if (bucket === 'bug') entregueBug++;
        else if (bucket === 'retorno_qa') entregueRetornoQa++;
        else if (isPriorizadoBucket(bucket)) entreguePriorizacao++;
        else entregueAviao++;
      }
      if (isPriorizadoBucket(bucket)) {
        if (done) priorizadoDone++; else priorizadoEmDev++;
      }
      if (done) {
        doneTotal++;
        if (bucket === 'bug') doneBug++;
        else if (bucket === 'retorno_qa') doneRetornoQa++;
        else if (isPriorizadoBucket(bucket)) donePriorizacao++;
        else doneAviao++;
      }
    }

    return {
      total,
      priorizacao: priorizacaoPura + priorizacaoTransbordo,
      priorizacaoTransbordo,
      naoPriorizado: bug + retornoQa + aviaoSprint + aviaoTransbordado,
      entregue: entregueTotal, done: doneTotal,
      priorizadoDone, priorizadoEmDev,
      bug, retornoQa, aviaoSprint, aviaoTransbordado,
      entregueBug, entregueRetornoQa, entreguePriorizacao, entregueAviao,
      doneBug, doneRetornoQa, donePriorizacao, doneAviao,
    };
  }, [managerItems]);

  // Sprint fechada → KPIs da fotografia congelada; sprint atual → dado vivo
  const metrics: GerenciaMetrics = useMemo(
    () => (photoScope ? metricsFromSnapshotScope(photoScope) : liveMetrics),
    [photoScope, liveMetrics],
  );

  // â”€â”€ Sprint comparison window â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 2+ sprints selecionadas → compara exatamente as selecionadas;
  // caso contrário → sprint de referência + 3 anteriores.
  const isExplicitMultiSelection = !hasAllSprints && selectedSprintCodes.length > 1;

  const comparisonSprints = useMemo(() => {
    if (sortedSprints.length === 0) return [];
    if (isExplicitMultiSelection) {
      const selectedSet = new Set(selectedSprintCodes);
      return sortedSprints.filter((sp) => selectedSet.has(sp));
    }
    let refIdx: number;
    if (hasAllSprints || selectedSprintCodes.length === 0) {
      refIdx = sortedSprints.length - 1;
    } else {
      const selectedSet = new Set(selectedSprintCodes);
      const found = [...sortedSprints].reverse().find((sp) => selectedSet.has(sp));
      refIdx = found ? sortedSprints.indexOf(found) : sortedSprints.length - 1;
    }
    return sortedSprints.slice(Math.max(0, refIdx - 3), refIdx + 1);
  }, [sortedSprints, selectedSprintCodes, hasAllSprints, isExplicitMultiSelection]);

  // Uma entrada por sprint da janela — fotografia congelada quando a sprint
  // está fechada e tem snapshot; senão, estado atual do DevOps.
  type SprintEntry = {
    code: string;
    isPhoto: boolean;
    total: number;
    priorizacao: number;
    bug: number;
    retornoQa: number;
    aviao: number;
    entregue: number;
    done: number;
  };

  const sprintEntries: SprintEntry[] = useMemo(() => {
    return comparisonSprints.map((sprintPath) => {
      const code = normalizeSprintCode(sprintPath);
      const snap = snapshots?.[code];
      const hasFrozen = isSprintClosed(code) && !!snap?.category_breakdown;
      const frozenScope = hasFrozen
        ? (selectedFabrica
            ? normalizedFabricas(snap!)[selectedFabrica] ?? ZERO_SCOPE
            : snap!.category_breakdown!.geral)
        : null;

      if (frozenScope) {
        return {
          code,
          isPhoto: true,
          total: frozenScope.total,
          priorizacao: frozenScope.cats.priorizacao + frozenScope.cats.priorizacao_transbordo,
          bug: frozenScope.cats.bug,
          retornoQa: frozenScope.cats.retorno_qa,
          aviao: frozenScope.cats.aviao_sprint + frozenScope.cats.aviao_transbordado,
          entregue: frozenScope.entregue.total,
          done: frozenScope.done.total,
        };
      }

      const sprintItems = allItems.filter(
        (i) => i.iteration_path === sprintPath && i.count_in_kpi !== false && isManagerLike(i)
          && (!selectedFabrica || fabricaOf(i) === selectedFabrica),
      );
      let priorizacao = 0, bug = 0, retornoQa = 0, aviao = 0, entregue = 0, done = 0;
      for (const item of sprintItems) {
        const bucket = classifyItem(item);
        if (isPriorizadoBucket(bucket)) priorizacao++;
        else if (bucket === 'bug') bug++;
        else if (bucket === 'retorno_qa') retornoQa++;
        else aviao++;
        if (ENTREGUE_STATES.has(item.state || '')) entregue++;
        if (isDoneState(item.state)) done++;
      }
      return { code, isPhoto: false, total: sprintItems.length, priorizacao, bug, retornoQa, aviao, entregue, done };
    });
  }, [comparisonSprints, snapshots, selectedFabrica, allItems, fabricaOf, ZERO_SCOPE]);

  // Histórico exibido nos cards: sprints da janela, exceto a sprint principal
  // quando há uma única selecionada (ela já é o valor grande do card).
  const cardHistoryEntries = useMemo(() => {
    const list = selectedSingleSprintCode
      ? sprintEntries.filter((e) => e.code !== selectedSingleSprintCode)
      : sprintEntries;
    return list.slice(-4);
  }, [sprintEntries, selectedSingleSprintCode]);

  const historyFor = useCallback(
    (pick: (e: SprintEntry) => number): KpiHistoryEntry[] =>
      cardHistoryEntries.map((e) => ({ code: e.code, value: pick(e), isPhoto: e.isPhoto })),
    [cardHistoryEntries],
  );

  // Composição da sprint (barra empilhada única por sprint): Priorizado + Bug +
  // Retorno QA + Avião = total de demandas. Entrega fica na tabela de progresso.
  const comparisonData = useMemo(() => {
    return sprintEntries.map((e) => {
      const sprintLabel = e.isPhoto ? `${e.code} (foto)` : e.code;
      if (histogramMode === 'percentual') {
        return {
          sprint: sprintLabel,
          total: e.total,
          Priorizado: percentNum(e.priorizacao, e.total),
          Bug: percentNum(e.bug, e.total),
          'Retorno QA': percentNum(e.retornoQa, e.total),
          'Avião': percentNum(e.aviao, e.total),
        };
      }
      return {
        sprint: sprintLabel,
        total: e.total,
        Priorizado: e.priorizacao,
        Bug: e.bug,
        'Retorno QA': e.retornoQa,
        'Avião': e.aviao,
      };
    });
  }, [sprintEntries, histogramMode]);

  // â”€â”€ Drilldown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const getDrilldownItems = useCallback((key: DrilldownKey): FabricaItem[] => {
    return managerItems.filter((item) => {
      const bucket = classifyItem(item);
      const done = isDoneState(item.state);
      const entregue = ENTREGUE_STATES.has(item.state || '');
      switch (key) {
        case 'demandas': return true;
        case 'priorizado': return isPriorizadoBucket(bucket);
        case 'nao_priorizado': return !isPriorizadoBucket(bucket);
        case 'entregue': return entregue;
        case 'done': return done;
        case 'priorizado_done': return isPriorizadoBucket(bucket) && done;
        case 'priorizado_em_dev': return isPriorizadoBucket(bucket) && !done;
        case 'priorizado_transbordo': return bucket === 'priorizacao_transbordo';
        case 'np_bug': return bucket === 'bug';
        case 'np_retorno_qa': return bucket === 'retorno_qa';
        case 'np_aviao_sprint': return bucket === 'aviao_sprint';
        case 'np_aviao_transbordado': return bucket === 'aviao_transbordado';
        case 'entregue_bug': return entregue && bucket === 'bug';
        case 'entregue_retorno_qa': return entregue && bucket === 'retorno_qa';
        case 'entregue_priorizacao': return entregue && isPriorizadoBucket(bucket);
        case 'entregue_aviao': return entregue && (bucket === 'aviao_sprint' || bucket === 'aviao_transbordado');
        case 'done_bug': return done && bucket === 'bug';
        case 'done_retorno_qa': return done && bucket === 'retorno_qa';
        case 'done_priorizacao': return done && isPriorizadoBucket(bucket);
        case 'done_aviao': return done && (bucket === 'aviao_sprint' || bucket === 'aviao_transbordado');
        default: return false;
      }
    });
  }, [managerItems]);

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
      {renderSectionHeader(
        'kpi_cards',
        `Visão ${selectedFabrica ? `Fábrica ${selectedFabrica}` : 'Geral'} — ${sprintLabel}`,
        <BarChart3 className="h-4 w-4" />,
      )}
      {!isCollapsed('kpi_cards') && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {isPhotoMode ? (
              <Badge variant="outline" className="text-[11px] gap-1 border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800">
                <Camera className="h-3 w-3 shrink-0" />
                Fotografia fim de sprint
                {photoSnapshot?.as_of_datetime
                  ? ` — ${new Date(photoSnapshot.as_of_datetime).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                  : ''}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[11px] gap-1 border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
                <Zap className="h-3 w-3 shrink-0" />
                Tempo real — estado atual do DevOps
              </Badge>
            )}
            {selectedSingleSprintCode && isSprintClosed(selectedSingleSprintCode) && !isPhotoMode && (
              <span className="text-[11px] text-muted-foreground">
                Sprint encerrada sem fotografia disponível — exibindo estado atual.
              </span>
            )}
          </div>
          {fabricas.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mr-1">Fábrica:</span>
              <Button
                variant={selectedFabrica === null ? 'default' : 'outline'}
                size="sm" className="h-7 text-xs"
                onClick={() => { setSelectedFabrica(null); setSelectedDrilldown(null); }}
              >
                Geral
              </Button>
              {fabricas.map((f) => (
                <Button
                  key={f}
                  variant={selectedFabrica === f ? 'default' : 'outline'}
                  size="sm" className="h-7 text-xs"
                  onClick={() => { setSelectedFabrica(selectedFabrica === f ? null : f); setSelectedDrilldown(null); }}
                >
                  {f}
                </Button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            <KpiCard
              label="Demandas"
              value={metrics.total}
              total={metrics.total}
              drilldownKey="demandas"
              history={historyFor((e) => e.total)}
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
              history={historyFor((e) => e.priorizacao)}
              valueColor="text-blue-600 dark:text-blue-400"
              isActive={selectedDrilldown?.key === 'priorizado'}
              activeSubKey={selectedDrilldown?.key ?? null}
              onClick={(k) => handleDrilldown(k, 'Priorizado')}
              onSubClick={(k) => handleDrilldown(k, k)}
              subItems={[
                { key: 'priorizado_done', label: 'Entregue/Done', value: metrics.priorizadoDone, total: metrics.priorizacao, valueColor: 'text-emerald-600' },
                { key: 'priorizado_em_dev', label: 'Em dev', value: metrics.priorizadoEmDev, total: metrics.priorizacao, valueColor: 'text-orange-500' },
                { key: 'priorizado_transbordo', label: 'Transbordo', value: metrics.priorizacaoTransbordo, total: metrics.priorizacao, valueColor: 'text-purple-600' },
              ]}
            />
            <KpiCard
              label="Não Priorizado"
              value={metrics.naoPriorizado}
              total={metrics.total}
              drilldownKey="nao_priorizado"
              history={historyFor((e) => e.bug + e.retornoQa + e.aviao)}
              valueColor="text-destructive"
              isActive={selectedDrilldown?.key === 'nao_priorizado'}
              activeSubKey={selectedDrilldown?.key ?? null}
              onClick={(k) => handleDrilldown(k, 'Não Priorizado')}
              onSubClick={(k) => handleDrilldown(k, k)}
              subItems={[
                { key: 'np_bug', label: 'Bug', value: metrics.bug, total: metrics.naoPriorizado, valueColor: 'text-destructive' },
                { key: 'np_retorno_qa', label: 'Retorno QA', value: metrics.retornoQa, total: metrics.naoPriorizado, valueColor: 'text-amber-600' },
                { key: 'np_aviao_sprint', label: selectedSingleSprintCode ? `Avião ${selectedSingleSprintCode}` : 'Avião da Sprint', value: metrics.aviaoSprint, total: metrics.naoPriorizado },
                { key: 'np_aviao_transbordado', label: 'Avião Transbordado', value: metrics.aviaoTransbordado, total: metrics.naoPriorizado },
              ]}
            />
            <KpiCard
              label="Entregue"
              value={metrics.entregue}
              total={metrics.total}
              drilldownKey="entregue"
              history={historyFor((e) => e.entregue)}
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
              history={historyFor((e) => e.done)}
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
                {isPhotoMode && (
                  <p className="text-[11px] text-muted-foreground px-4 pb-2">
                    Os itens listados refletem o estado atual do DevOps; os KPIs acima são da fotografia de fim de sprint — as listas podem divergir.
                  </p>
                )}
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

      {renderSectionHeader(
        'hist_comparacao',
        `Comparação por Sprint ${isExplicitMultiSelection ? '(sprints selecionadas)' : '(sprint atual + 3 anteriores)'}${selectedFabrica ? ` — Fábrica ${selectedFabrica}` : ''}`,
        <BarChart3 className="h-4 w-4" />,
      )}
      {!isCollapsed('hist_comparacao') && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                Visão Gerencial das Sprints
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
                  <ComposedChart data={comparisonData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="sprint" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit={histogramMode === 'percentual' ? '%' : ''} />
                    <RechartsTooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                      formatter={(value: number, name: string) => [
                        histogramMode === 'percentual' ? `${value}%` : value,
                        name,
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    {/* Uma barra empilhada por sprint = composição do total de demandas */}
                    <Bar dataKey="Priorizado" name="Priorizado" stackId="comp" fill="hsl(210,90%,55%)" maxBarSize={72} />
                    <Bar dataKey="Bug" name="Bug" stackId="comp" fill="hsl(0,72%,52%)" maxBarSize={72} />
                    <Bar dataKey="Retorno QA" name="Retorno QA" stackId="comp" fill="hsl(38,92%,50%)" maxBarSize={72} />
                    <Bar dataKey="Avião" name="Avião" stackId="comp" fill="hsl(270,60%,55%)" maxBarSize={72} radius={[4, 4, 0, 0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Entrega por sprint — barras de progresso (Entregue e Done sobre o total) */}
            {sprintEntries.length > 0 && (
              <div className="mt-4 border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium w-32">Sprint</th>
                      <th className="text-right px-3 py-2 font-medium w-20">Demandas</th>
                      <th className="text-left px-3 py-2 font-medium">Entregue</th>
                      <th className="text-left px-3 py-2 font-medium">Done</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sprintEntries.map((e) => {
                      const entreguePct = percentNum(e.entregue, e.total);
                      const donePct = percentNum(e.done, e.total);
                      return (
                        <tr key={e.code}>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1.5 font-medium">
                              {e.code}
                              {e.isPhoto
                                ? <Camera className="h-3 w-3 text-sky-600" aria-label="Fotografia de fim de sprint" />
                                : <Zap className="h-3 w-3 text-emerald-600" aria-label="Tempo real" />}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">{e.total}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, entreguePct)}%` }} />
                              </div>
                              <span className="w-24 text-right tabular-nums text-muted-foreground">{e.entregue}/{e.total} · {entreguePct}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, donePct)}%` }} />
                              </div>
                              <span className="w-24 text-right tabular-nums text-muted-foreground">{e.done}/{e.total} · {donePct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground mt-2">
              Considera todos os colaboradores do setor, independente do filtro de colaborador ativo.
              Sprints marcadas com "(foto)" usam a fotografia congelada de fim de sprint; as demais, o estado atual do DevOps.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Retorno QA e Bug por fábrica — retrabalho/correção e impacto dentro de cada fábrica */}
      {qaBugPorFabrica.length > 0 && renderSectionHeader('qa_bug_fabrica', 'Retorno QA e Bug por Fábrica — ' + sprintLabel, <AlertTriangle className="h-4 w-4" />)}
      {qaBugPorFabrica.length > 0 && !isCollapsed('qa_bug_fabrica') && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs font-semibold">Fábrica</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Retorno QA</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Bug</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Bug + QA</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Demandas</TableHead>
                    <TableHead className="text-xs font-semibold text-right">% dentro da fábrica</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {qaBugPorFabrica.map((row) => (
                    <TableRow
                      key={row.fabrica}
                      className={`cursor-pointer hover:bg-muted/30 ${selectedFabrica === row.fabrica ? 'bg-primary/5' : ''}`}
                      onClick={() => { setSelectedFabrica(selectedFabrica === row.fabrica ? null : row.fabrica); setSelectedDrilldown(null); }}
                    >
                      <TableCell className="text-xs font-medium">{row.fabrica}</TableCell>
                      <TableCell className="text-xs text-right text-amber-600 font-semibold">{row.retornoQa}</TableCell>
                      <TableCell className="text-xs text-right text-destructive font-semibold">{row.bug}</TableCell>
                      <TableCell className="text-xs text-right font-semibold">{row.bugQa}</TableCell>
                      <TableCell className="text-xs text-right text-muted-foreground">{row.total}</TableCell>
                      <TableCell className="text-xs text-right font-semibold">{percent(row.bugQa, row.total)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell className="text-xs">Total</TableCell>
                    <TableCell className="text-xs text-right text-amber-600">{qaBugPorFabrica.reduce((s, r) => s + r.retornoQa, 0)}</TableCell>
                    <TableCell className="text-xs text-right text-destructive">{qaBugPorFabrica.reduce((s, r) => s + r.bug, 0)}</TableCell>
                    <TableCell className="text-xs text-right">{qaBugPorFabrica.reduce((s, r) => s + r.bugQa, 0)}</TableCell>
                    <TableCell className="text-xs text-right text-muted-foreground">{qaBugPorFabrica.reduce((s, r) => s + r.total, 0)}</TableCell>
                    <TableCell className="text-xs text-right">
                      {percent(qaBugPorFabrica.reduce((s, r) => s + r.bugQa, 0), qaBugPorFabrica.reduce((s, r) => s + r.total, 0))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <p className="text-[11px] text-muted-foreground px-4 py-2">
              Clique em uma fábrica para filtrar os indicadores acima. % dentro da fábrica = (Retorno QA + Bug) / demandas da fábrica.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Performance & Riscos — shown when props are provided by parent */}
      {(performance || risks) && renderSectionHeader('gerencia_perf_risk', 'Performance & Riscos', <TrendingUp className="h-4 w-4" />)}
      {(performance || risks) && !isCollapsed('gerencia_perf_risk') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {performance && (
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Performance</p>
              {performance.isLoading ? (
                <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
              ) : (
                <div className="divide-y divide-border">
                  <div className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      <div>
                        <p className="text-sm font-medium">Lead Time Médio</p>
                        <p className="text-[11px] text-muted-foreground">
                          {performance.leadTimeSource === 'timelog' ? 'Horas / PBI' : 'Effort / PBI'}
                        </p>
                      </div>
                    </div>
                    <span className="text-2xl font-bold">
                      {performance.leadTimeMedio != null ? performance.leadTimeMedio : <span className="text-muted-foreground text-base">—</span>}
                      {performance.leadTimeMedio != null && <span className="text-xs text-muted-foreground ml-1">{performance.leadTimeSource === 'timelog' ? 'h' : 'pts'}</span>}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2">
                      <Gauge className="h-3.5 w-3.5 text-blue-500" />
                      <div>
                        <p className="text-sm font-medium">Velocidade Média</p>
                        <p className="text-[11px] text-muted-foreground">
                          {performance.velocidadeSource === 'timelog' ? `Horas / Sprint (${performance.sprintCount})` : `Effort / Sprint (${performance.sprintCount})`}
                        </p>
                      </div>
                    </div>
                    <span className="text-2xl font-bold">
                      {performance.velocidadeMedia != null ? performance.velocidadeMedia : <span className="text-muted-foreground text-base">—</span>}
                      {performance.velocidadeMedia != null && <span className="text-xs text-muted-foreground ml-1">{performance.velocidadeSource === 'timelog' ? 'h' : 'pts'}</span>}
                    </span>
                  </div>
                </div>
              )}
            </Card>
          )}
          {risks && (
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Riscos</p>
              <div className="divide-y divide-border">
                <div className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`h-3.5 w-3.5 ${risks.transbordoPct != null && risks.transbordoPct > 50 ? 'text-destructive' : 'text-amber-500'}`} />
                    <div>
                      <p className="text-sm font-medium">Transbordo</p>
                      <p className="text-[11px] text-muted-foreground">{risks.transbordoCount} de {risks.transbordoTotal} itens</p>
                    </div>
                  </div>
                  <span className={`text-2xl font-bold ${risks.transbordoPct != null && risks.transbordoPct > 50 ? 'text-destructive' : risks.transbordoPct != null && risks.transbordoPct > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                    {risks.transbordoPct != null ? `${risks.transbordoPct}%` : '—'}
                  </span>
                </div>
                <button type="button" className="w-full text-left flex items-center justify-between py-2.5 hover:bg-muted/20 rounded px-1 -mx-1 transition-colors" onClick={risks.onQaClick}>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`h-3.5 w-3.5 ${risks.qaOpen > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
                    <div>
                      <p className="text-sm font-medium">Retorno QA</p>
                      <p className="text-[11px] text-muted-foreground">{risks.qaTotal} total no período</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold">{risks.qaTotal}</span>
                    {risks.qaOpen > 0 && <p className="text-xs text-destructive">{risks.qaOpen} abertos</p>}
                    {risks.qaOpen > 0 && risks.qaAvg != null && (
                      <p className="text-[11px] text-muted-foreground">méd. {risks.qaAvg.toFixed(1)}d{risks.qaMax != null ? ` · máx. ${risks.qaMax}d` : ''}</p>
                    )}
                  </div>
                </button>
              </div>
            </Card>
          )}
        </div>
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
