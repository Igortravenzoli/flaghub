import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCountUp } from '@/hooks/useCountUp';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useMetricMetadata } from '@/contexts/MetricMetadataContext';

interface DashboardKpiCardProps {
  label: string;
  value: number | string;
  icon?: React.ComponentType<{ className?: string }>;
  change?: number;
  changeLabel?: string;
  suffix?: string;
  prefix?: string;
  accent?: string;
  isLoading?: boolean;
  delay?: number;
  onClick?: () => void;
  active?: boolean;
  tooltipTitle?: string;
  metricKey?: string;
  tooltipFormula?: string;
  tooltipDescription?: string;
}

const KPI_TOOLTIP_MAP: Record<string, { formula: string; description: string }> = {
  'Total': { formula: 'COUNT(itens no escopo do filtro)', description: 'Quantidade total de itens no intervalo e filtros aplicados.' },
  'Total QA': { formula: 'COUNT(itens QA no escopo)', description: 'Total de itens de qualidade no recorte atual.' },
  'Fila QA (WIP)': { formula: 'COUNT(state IN New, To Do, Active)', description: 'Itens em fila de QA aguardando ou em trabalho ativo.' },
  'Taxa Vazão QA': { formula: '(Finalizados / Total QA) * 100', description: 'Percentual de itens finalizados no escopo selecionado.' },
  'Finalizados': { formula: 'COUNT(state IN Done, Closed, Resolved)', description: 'Itens concluídos no período/sprint filtrado.' },
  'Retorno QA': { formula: 'COUNT(itens com qa_retorno_count > 0)', description: 'Itens que retornaram para nova rodada de testes.' },
  'Aviões testados': { formula: "COUNT(tags ILIKE '%AVIAO%' AND state IN Testing, Done, Closed, Resolved)", description: 'Itens com tag AVIAO que já passaram por etapa de teste.' },
  'Horas Acumuladas': { formula: 'SUM(time_minutes) / 60', description: 'Soma de horas registradas em TimeLog no escopo.' },
  'Horas Hoje': { formula: 'SUM(time_minutes do dia atual) / 60', description: 'Horas registradas no dia corrente.' },
  'Volume Total na Fila': { formula: 'COUNT(work items em fila)', description: 'Volume de itens ativos na fila operacional.' },
  'Implantações Ativas': { formula: 'COUNT(implantacoes com status não encerrado)', description: 'Implantações em progresso no recorte atual.' },
  'Implantações Finalizadas': { formula: 'COUNT(implantacoes com status encerrado)', description: 'Implantações concluídas no recorte atual.' },
};

export function DashboardKpiCard({
  label,
  value,
  icon: Icon,
  change,
  changeLabel,
  suffix = '',
  prefix = '',
  accent,
  isLoading,
  delay = 0,
  onClick,
  active,
  tooltipTitle,
  metricKey,
  tooltipFormula,
  tooltipDescription,
}: DashboardKpiCardProps) {
  const numericValue = typeof value === 'number' ? value : 0;
  const animated = useCountUp(numericValue);
  const isPositive = (change ?? 0) >= 0;
  const metricMeta = useMetricMetadata();
  const persistedMeta = metricMeta?.getMetricInfo(label, metricKey);
  const fallback = KPI_TOOLTIP_MAP[label];
  const effectiveTitle = tooltipTitle || label;
  const effectiveFormula = tooltipFormula || persistedMeta?.formula || fallback?.formula;
  const effectiveDescription = tooltipDescription || persistedMeta?.description || fallback?.description;
  const hasTooltip = Boolean(effectiveFormula || effectiveDescription);

  if (isLoading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-4 w-20 mb-3" />
        <Skeleton className="h-8 w-16 mb-1" />
        <Skeleton className="h-3 w-24" />
      </Card>
    );
  }

  return (
    <Card
      className={`p-5 animate-fade-in group hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden ${onClick ? 'cursor-pointer' : ''} ${active ? 'ring-2 ring-primary shadow-lg' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onClick}
    >
      <div className={`absolute inset-0 opacity-[0.04] ${accent || 'bg-primary'}`} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          {Icon && (
            <div className={`p-2.5 rounded-xl ${accent ? accent + '/10' : 'bg-primary/10'}`}>
              <Icon className={`h-5 w-5 ${accent ? accent.replace('bg-', 'text-') : 'text-primary'}`} />
            </div>
          )}
          {change !== undefined && (
            <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
              isPositive
                ? 'bg-[hsl(142,71%,45%)]/10 text-[hsl(142,71%,45%)]'
                : 'bg-[hsl(0,84%,60%)]/10 text-[hsl(0,84%,60%)]'
            }`}>
              {isPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(change)}%
            </div>
          )}
        </div>
        <p className="text-3xl font-bold text-foreground tracking-tight">
          {prefix}{typeof value === 'number' ? animated : value}{suffix}
        </p>
        {hasTooltip ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-xs text-muted-foreground mt-1 font-medium underline decoration-dotted cursor-help">
                  {label}
                </p>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm text-xs">
                <p className="font-semibold mb-1">{effectiveTitle}</p>
                {effectiveFormula && <p className="mb-1"><span className="font-medium">Fórmula:</span> {effectiveFormula}</p>}
                {effectiveDescription && <p><span className="font-medium">Descrição:</span> {effectiveDescription}</p>}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <p className="text-xs text-muted-foreground mt-1 font-medium">{label}</p>
        )}
        {changeLabel && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{changeLabel}</p>}
      </div>
    </Card>
  );
}
