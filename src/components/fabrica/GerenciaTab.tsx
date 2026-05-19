import { useMemo, useState, useCallback } from 'react';
import type { FabricaItem } from '@/hooks/useFabricaKpis';
import type { FeaturePbiSummaryRow, PbiBottleneckRow } from '@/types/pbi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ClipboardList,
  CheckCircle2,
  CircleDashed,
  Info,
  Calendar,
  Factory,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  HeartPulse,
  Workflow,
} from 'lucide-react';

type GerenciaTabProps = {
  items: FabricaItem[];
  isLoading: boolean;
  selectedSprintCodes: string[];
  hasAllSprints: boolean;
  selectedCollaboratorsCount: number;
  totalCollaborators: number;
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

function percent(value: number, total: number): string {
  if (total <= 0) return '0%';
  return `${((value / total) * 100).toFixed(1).replace('.', ',')}%`;
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

function DetailTable({ title, rows }: { title: string; rows: Array<{ label: string; value: number; total: number }> }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Categoria</TableHead>
              <TableHead className="text-xs text-right">Quantidade</TableHead>
              <TableHead className="text-xs text-right">Percentual</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableCell className="text-xs">{row.label}</TableCell>
                <TableCell className="text-xs text-right font-semibold">{row.value}</TableCell>
                <TableCell className="text-xs text-right">{percent(row.value, row.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function GerenciaTab({
  items,
  isLoading,
  selectedSprintCodes,
  hasAllSprints,
  selectedCollaboratorsCount,
  totalCollaborators,
  transbordoSummary,
  healthOverview,
  bottlenecks,
  featureRows,
}: GerenciaTabProps) {
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());

  const toggleBlockCollapse = useCallback((blockKey: string) => {
    setCollapsedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(blockKey)) next.delete(blockKey);
      else next.add(blockKey);
      return next;
    });
  }, []);

  const isBlockCollapsed = useCallback((blockKey: string) => collapsedBlocks.has(blockKey), [collapsedBlocks]);

  const renderSectionToggle = useCallback((blockKey: string, label: string) => {
    const collapsed = isBlockCollapsed(blockKey);
    return (
      <div className="flex justify-start items-center gap-1">
        {collapsed ? (
          <span className="text-[10px] text-muted-foreground/80">{label}</span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={() => toggleBlockCollapse(blockKey)}
          title={collapsed ? 'Expandir seção' : 'Minimizar seção'}
          aria-label={collapsed ? 'Expandir seção' : 'Minimizar seção'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>
    );
  }, [isBlockCollapsed, toggleBlockCollapse]);

  const selectedSingleSprintCode = useMemo(() => {
    if (hasAllSprints || selectedSprintCodes.length !== 1) return null;
    return normalizeSprintCode(selectedSprintCodes[0]);
  }, [hasAllSprints, selectedSprintCodes]);

  const managerItems = useMemo(
    () => items.filter((item) => item.count_in_kpi !== false && isManagerLike(item)),
    [items],
  );

  const metrics = useMemo(() => {
    const total = managerItems.length;
    let priorizacao = 0;
    let bug = 0;
    let retornoQa = 0;
    let aviaoSprint = 0;
    let aviaoAntigo = 0;

    let doneTotal = 0;
    let doneBug = 0;
    let doneRetornoQa = 0;
    let donePriorizacao = 0;
    let doneAviao = 0;

    let priorizadoDone = 0;
    let priorizadoEmDev = 0;

    for (const item of managerItems) {
      const bucket = classifyItem(item, selectedSingleSprintCode);
      const done = isDoneState(item.state);

      if (bucket === 'priorizacao') priorizacao += 1;
      if (bucket === 'bug') bug += 1;
      if (bucket === 'retorno_qa') retornoQa += 1;
      if (bucket === 'aviao_sprint') aviaoSprint += 1;
      if (bucket === 'aviao_antigo') aviaoAntigo += 1;

      if (bucket === 'priorizacao') {
        if (done) priorizadoDone += 1;
        else priorizadoEmDev += 1;
      }

      if (done) {
        doneTotal += 1;
        if (bucket === 'bug') doneBug += 1;
        else if (bucket === 'retorno_qa') doneRetornoQa += 1;
        else if (bucket === 'priorizacao') donePriorizacao += 1;
        else doneAviao += 1;
      }
    }

    const naoPriorizado = bug + retornoQa + aviaoSprint + aviaoAntigo;

    return {
      total,
      priorizacao,
      naoPriorizado,
      entregue: doneTotal,
      done: doneTotal,
      priorizadoDone,
      priorizadoEmDev,
      bug,
      retornoQa,
      aviaoSprint,
      aviaoAntigo,
      doneBug,
      doneRetornoQa,
      donePriorizacao,
      doneAviao,
    };
  }, [managerItems, selectedSingleSprintCode]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-xs gap-1">
          <Calendar className="h-3.5 w-3.5" />
          Sprints: {hasAllSprints ? 'Todas' : selectedSprintCodes.length}
        </Badge>
        <Badge variant="outline" className="text-xs gap-1">
          <ShieldCheck className="h-3.5 w-3.5" />
          Colaboradores: {selectedCollaboratorsCount}/{totalCollaborators}
        </Badge>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          Escopo sincronizado com os mesmos filtros globais da Visão Geral.
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : null}

      {renderSectionToggle('gerencia_indicadores', 'Indicadores gerais')}
      {!isBlockCollapsed('gerencia_indicadores') && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Factory className="h-4 w-4" />
              Indicadores Gerais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Indicador</TableHead>
                  <TableHead className="text-xs text-right">Quantidade</TableHead>
                  <TableHead className="text-xs text-right">Percentual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="text-xs">Demandas</TableCell>
                  <TableCell className="text-xs text-right font-semibold">{metrics.total}</TableCell>
                  <TableCell className="text-xs text-right">100%</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs">Priorizado</TableCell>
                  <TableCell className="text-xs text-right font-semibold">{metrics.priorizacao}</TableCell>
                  <TableCell className="text-xs text-right">{percent(metrics.priorizacao, metrics.total)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs">Nao Priorizado</TableCell>
                  <TableCell className="text-xs text-right font-semibold">{metrics.naoPriorizado}</TableCell>
                  <TableCell className="text-xs text-right">{percent(metrics.naoPriorizado, metrics.total)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs">Entregue</TableCell>
                  <TableCell className="text-xs text-right font-semibold">{metrics.entregue}</TableCell>
                  <TableCell className="text-xs text-right">{percent(metrics.entregue, metrics.total)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs">Done</TableCell>
                  <TableCell className="text-xs text-right font-semibold">{metrics.done}</TableCell>
                  <TableCell className="text-xs text-right">{percent(metrics.done, metrics.total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {renderSectionToggle('gerencia_detalhamento', 'Detalhamento gerencial')}
      {!isBlockCollapsed('gerencia_detalhamento') && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DetailTable
              title="Detalhamento — Priorizado"
              rows={[
                { label: 'Entregue/Done', value: metrics.priorizadoDone, total: metrics.priorizacao },
                { label: 'Em dev', value: metrics.priorizadoEmDev, total: metrics.priorizacao },
              ]}
            />
            <DetailTable
              title="Detalhamento — Não Priorizado"
              rows={[
                { label: 'Bug', value: metrics.bug, total: metrics.naoPriorizado },
                { label: 'Retorno QA', value: metrics.retornoQa, total: metrics.naoPriorizado },
                { label: selectedSingleSprintCode ? `Avião ${selectedSingleSprintCode}` : 'Avião (escopo)', value: metrics.aviaoSprint, total: metrics.naoPriorizado },
                { label: 'Avião Antigo', value: metrics.aviaoAntigo, total: metrics.naoPriorizado },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DetailTable
              title="Detalhamento — Entregue"
              rows={[
                { label: 'Bug', value: metrics.doneBug, total: metrics.entregue },
                { label: 'Retorno QA', value: metrics.doneRetornoQa, total: metrics.entregue },
                { label: 'Priorização', value: metrics.donePriorizacao, total: metrics.entregue },
                { label: 'Avião', value: metrics.doneAviao, total: metrics.entregue },
              ]}
            />
            <DetailTable
              title="Detalhamento — Done"
              rows={[
                { label: 'Bug', value: metrics.doneBug, total: metrics.done },
                { label: 'Retorno QA', value: metrics.doneRetornoQa, total: metrics.done },
                { label: 'Priorização', value: metrics.donePriorizacao, total: metrics.done },
                { label: 'Avião', value: metrics.doneAviao, total: metrics.done },
              ]}
            />
          </div>
        </>
      )}

      {renderSectionToggle('gerencia_transbordo', 'Transbordo consolidado')}
      {!isBlockCollapsed('gerencia_transbordo') && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Transbordo (consolidado)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Indicador</TableHead>
                  <TableHead className="text-xs text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="text-xs">Itens com transbordo</TableCell>
                  <TableCell className="text-xs text-right font-semibold">{transbordoSummary.count}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs">Base comparativa</TableCell>
                  <TableCell className="text-xs text-right">{transbordoSummary.total}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs">Taxa de transbordo</TableCell>
                  <TableCell className="text-xs text-right">{transbordoSummary.pct}%</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs">Itens com transbordo real</TableCell>
                  <TableCell className="text-xs text-right">{transbordoSummary.realOverflowItemCount}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs">Ocorrências de transbordo real</TableCell>
                  <TableCell className="text-xs text-right">{transbordoSummary.realOverflowCount}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs">Taxa de transbordo real</TableCell>
                  <TableCell className="text-xs text-right">{transbordoSummary.realOverflowPct}%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {renderSectionToggle('gerencia_saude', 'Saúde da esteira')}
      {!isBlockCollapsed('gerencia_saude') && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HeartPulse className="h-4 w-4" />
              Saúde da Esteira (consolidado)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Badge variant="outline" className="justify-between text-xs py-2 px-3">Monitorados <span className="font-semibold">{healthOverview.total}</span></Badge>
            <Badge variant="outline" className="justify-between text-xs py-2 px-3">Saudável <span className="font-semibold text-emerald-600">{healthOverview.verde}</span></Badge>
            <Badge variant="outline" className="justify-between text-xs py-2 px-3">Atenção <span className="font-semibold text-amber-600">{healthOverview.amarelo}</span></Badge>
            <Badge variant="outline" className="justify-between text-xs py-2 px-3">Crítica <span className="font-semibold text-red-600">{healthOverview.vermelho}</span></Badge>
          </CardContent>
        </Card>
      )}

      {renderSectionToggle('gerencia_gargalos', 'Gargalos da esteira')}
      {!isBlockCollapsed('gerencia_gargalos') && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Gargalos (consolidado)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Etapa</TableHead>
                  <TableHead className="text-xs text-right">Média (dias)</TableHead>
                  <TableHead className="text-xs text-right">Máx (dias)</TableHead>
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
                    <TableCell className="text-xs text-right">{row.count_overtime}</TableCell>
                  </TableRow>
                ))}
                {bottlenecks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6 text-xs">
                      Sem dados de gargalo para o filtro atual.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {renderSectionToggle('gerencia_feature', 'Saúde por Feature')}
      {!isBlockCollapsed('gerencia_feature') && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Workflow className="h-4 w-4" />
              Por Feature (consolidado)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Feature</TableHead>
                  <TableHead className="text-xs text-right">PBIs</TableHead>
                  <TableHead className="text-xs text-right">Bugs</TableHead>
                  <TableHead className="text-xs text-right">Verde</TableHead>
                  <TableHead className="text-xs text-right">Amarelo</TableHead>
                  <TableHead className="text-xs text-right">Vermelho</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {featureRows.slice(0, 40).map((row, idx) => (
                  <TableRow key={`${row.feature_id ?? idx}-${row.epic_id ?? 'epic'}`}>
                    <TableCell className="text-xs max-w-[360px] truncate">{row.feature_title || 'Sem feature'}</TableCell>
                    <TableCell className="text-xs text-right">{row.pbi_count}</TableCell>
                    <TableCell className="text-xs text-right">{row.bug_count}</TableCell>
                    <TableCell className="text-xs text-right">{row.verde_count}</TableCell>
                    <TableCell className="text-xs text-right">{row.amarelo_count}</TableCell>
                    <TableCell className="text-xs text-right">{row.vermelho_count}</TableCell>
                  </TableRow>
                ))}
                {featureRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6 text-xs">
                      Sem dados de feature para o filtro atual.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card className="border-dashed">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ClipboardList className="h-3.5 w-3.5" />
            Regra de classificação aplicada: Priorização = itens que não são Bug, Retorno QA ou Avião.
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Entregue e Done usam os estados Done/Closed/Resolved para manter consistência do painel.
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <CircleDashed className="h-3.5 w-3.5" />
            Escopo atual: {hasAllSprints ? 'todas as sprints selecionadas' : selectedSprintCodes.map((s) => normalizeSprintCode(s)).join(', ')}.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
