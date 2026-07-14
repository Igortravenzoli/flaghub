import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend,
} from 'recharts';
import { CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSprintDailyProgress, type SprintDailyProgressRow } from '@/hooks/useSprintDailyProgress';
import { getCurrentOfficialSprintCode } from '@/lib/sprintCalendar';
import { cleanFabricaName } from '@/lib/fabricaNames';

type DailyProgressCardProps = {
  /** Código da sprint a exibir; se ausente, usa a sprint oficial vigente (a série é forward-only da sprint aberta). */
  sprintCode?: string | null;
  /** Filtra a série por uma fábrica (rótulo já normalizado, ex.: "K8"). null = geral. */
  fabricaFilter?: string | null;
  /** Altura do gráfico (px). Menor no modo TV. */
  chartHeight?: number;
  /** Preenche a altura do card (modo TV) em vez de usar altura fixa. */
  fill?: boolean;
};

/**
 * Rótulo "DD/MM" sem passar por `new Date('YYYY-MM-DD')` — o parse UTC exibiria
 * o dia anterior no fuso BRT. captured_date vem como string YYYY-MM-DD.
 */
function dayLabel(capturedDate: string): string {
  const [, mm, dd] = capturedDate.split('-');
  return dd && mm ? `${dd}/${mm}` : capturedDate;
}

/** Uma captura por dia — mantém a mais recente caso haja duplicatas. */
function dedupeByDay(rows: SprintDailyProgressRow[]): SprintDailyProgressRow[] {
  const byDay = new Map<string, SprintDailyProgressRow>();
  for (const r of rows) {
    const prev = byDay.get(r.captured_date);
    if (!prev || (r.snapshot_datetime ?? '') > (prev.snapshot_datetime ?? '')) {
      byDay.set(r.captured_date, r);
    }
  }
  return [...byDay.values()].sort((a, b) => a.captured_date.localeCompare(b.captured_date));
}

export function DailyProgressCard({ sprintCode, fabricaFilter, chartHeight = 260, fill = false }: DailyProgressCardProps) {
  const code = sprintCode || getCurrentOfficialSprintCode();
  const { data: rows = [], isLoading } = useSprintDailyProgress(code);

  const [scope, setScope] = useState<string | null>(null);
  const activeScope = fabricaFilter ?? scope;

  const dailyRows = useMemo(() => dedupeByDay(rows), [rows]);

  // Fábricas presentes na série — para o seletor de escopo.
  const fabricas = useMemo(() => {
    const set = new Set<string>();
    for (const r of dailyRows) {
      for (const raw of Object.keys(r.category_breakdown?.fabricas ?? {})) {
        set.add(cleanFabricaName(raw));
      }
    }
    return [...set].sort();
  }, [dailyRows]);

  const chartData = useMemo(() => {
    return dailyRows.map((r) => {
      if (activeScope) {
        // Escopo por fábrica — casa a chave crua do breakdown com o rótulo normalizado.
        const entry = Object.entries(r.category_breakdown?.fabricas ?? {})
          .find(([raw]) => cleanFabricaName(raw) === activeScope);
        const scoped = entry?.[1];
        return {
          label: dayLabel(r.captured_date),
          Entregue: scoped?.entregue.total ?? 0,
          Done: scoped?.done.total ?? 0,
          Escopo: scoped?.total ?? 0,
        };
      }
      return {
        label: dayLabel(r.captured_date),
        Entregue: r.delivered_demands ?? 0,
        Done: r.finalized_demands ?? 0,
        Escopo: r.total_demands ?? 0,
      };
    });
  }, [dailyRows, activeScope]);

  const last = chartData[chartData.length - 1];

  return (
    <Card className={fill ? 'h-full flex flex-col' : undefined}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            Evolução diária — Entregue &amp; Done
            <span className="text-xs font-normal text-muted-foreground">{code}</span>
          </CardTitle>
          {!fabricaFilter && fabricas.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              <Button
                variant={scope === null ? 'default' : 'outline'}
                size="sm" className="h-7 text-xs"
                onClick={() => setScope(null)}
              >
                Geral
              </Button>
              {fabricas.map((f) => (
                <Button
                  key={f}
                  variant={scope === f ? 'default' : 'outline'}
                  size="sm" className="h-7 text-xs"
                  onClick={() => setScope(scope === f ? null : f)}
                >
                  {f}
                </Button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className={fill ? 'flex-1 min-h-0 flex flex-col' : undefined}>
        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-8">Carregando série diária…</p>
        ) : chartData.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            Sem série diária para esta sprint. A evolução é capturada 1×/dia a partir do início da sprint aberta.
          </p>
        ) : (
          <>
            {last && (
              <div className="flex gap-4 mb-3 text-xs">
                <span className="text-muted-foreground">Hoje{activeScope ? ` · ${activeScope}` : ''}:</span>
                <span className="font-semibold text-sky-600">{last.Entregue} entregue</span>
                <span className="font-semibold text-emerald-600">{last.Done} done</span>
                <span className="text-muted-foreground">de {last.Escopo} no escopo</span>
              </div>
            )}
            <div className={fill ? 'flex-1 min-h-0' : undefined} style={fill ? undefined : { height: chartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <RechartsTooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="Entregue" name="Entregue" fill="hsl(200,80%,50%)" maxBarSize={26} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Done" name="Done" fill="hsl(142,71%,45%)" maxBarSize={26} radius={[3, 3, 0, 0]} />
                  <Line dataKey="Escopo" name="Escopo total" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Série capturada diariamente (cron 00:05 BRT) da sprint aberta. Entregue = itens em teste/deploy; Done = finalizados.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
