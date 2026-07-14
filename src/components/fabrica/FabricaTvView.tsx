import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarClock } from 'lucide-react';
import { DesempenhoTrendChart } from '@/components/fabrica/DesempenhoTrendChart';
import { RankingFabricasCard } from '@/components/fabrica/RankingFabricasCard';
import { QualidadePorFabricaCharts } from '@/components/fabrica/QualidadePorFabricaCharts';
import { DailyProgressCard } from '@/components/fabrica/DailyProgressCard';
import { UsoCruzadoCard } from '@/components/fabrica/UsoCruzadoCard';

/** Altura do canvas de design do TV (1320 x 742 ≈ 16:9) — o KioskFit escala isto. */
const TV_CANVAS_H = 742;

type FabKpisTv = {
  total: number;
  done: number;
  inProgress: number;
  toDo: number;
  isLoading: boolean;
  items?: Array<{ work_item_type?: string | null; tags?: string | null }>;
  horasPorFabricaFull?: Array<{ key: string; collaborators: { name: string; minutes: number }[] }>;
};

type FabricaTvViewProps = {
  fab: FabKpisTv;
  sprintCode?: string | null;
  periodLabel?: string;
};

function Kpi({ valor, rotulo, cor }: { valor: number | string; rotulo: string; cor?: string }) {
  return (
    <div className="text-center px-3">
      <p className="text-2xl font-bold font-mono leading-none" style={cor ? { color: cor } : undefined}>{valor}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{rotulo}</p>
    </div>
  );
}

/**
 * Modo TV da Fábrica. Diferente da aba Executiva: sem Saúde dos itens, Itens
 * saudáveis, Transbordo e Linha de base — e com Qualidade por fábrica, Evolução
 * diária e Capacity por squad (uso cruzado). Monta um canvas 16:9 que preenche
 * o telão (o KioskFit escala; se o conteúdo fosse baixo, sobraria vazio embaixo).
 */
export function FabricaTvView({ fab, sprintCode, periodLabel }: FabricaTvViewProps) {
  const categoria = useMemo(() => {
    let bug = 0, retorno = 0, aviao = 0;
    for (const i of fab.items ?? []) {
      if (!['Product Backlog Item', 'Bug', 'User Story'].includes(i.work_item_type || '')) continue;
      const t = (i.tags || '').toLowerCase();
      if (/retorno\s*(de\s*)?qa/.test(t)) retorno++;
      else if (/avi[aã]o/.test(t)) aviao++;
      else if (i.work_item_type === 'Bug' || /(^|;)\s*bug\s*(;|$)/.test(t)) bug++;
    }
    return { bug, retorno, aviao };
  }, [fab.items]);

  const conclPct = fab.total > 0 ? Math.round((fab.done / fab.total) * 100) : 0;
  const corConcl = conclPct >= 80 ? 'hsl(142,71%,42%)' : conclPct >= 50 ? 'hsl(38,92%,50%)' : 'hsl(0,72%,52%)';

  return (
    <div className="w-full flex flex-col gap-2.5" style={{ minHeight: TV_CANVAS_H }}>
      {/* Faixa de KPIs — compacta, sem Saúde dos itens */}
      <Card className="flex-none">
        <CardContent className="py-2.5 flex items-center gap-2">
          <div className="pr-4">
            <p className="text-base font-bold leading-tight">Fábrica · Visão Executiva</p>
            <p className="text-[11px] text-muted-foreground">{periodLabel || sprintCode || 'Sprint atual'}</p>
          </div>
          <div className="flex items-center gap-1 ml-auto divide-x divide-border">
            <Kpi valor={fab.isLoading ? '—' : fab.total} rotulo="itens no escopo" />
            <Kpi valor={`${conclPct}%`} rotulo="concluído" cor={corConcl} />
            <Kpi valor={fab.done} rotulo="done" cor="hsl(142,71%,42%)" />
            <Kpi valor={fab.inProgress} rotulo="em dev" cor="hsl(210,80%,52%)" />
            <Kpi valor={categoria.bug} rotulo="bugs" cor="hsl(0,72%,52%)" />
            <Kpi valor={categoria.retorno} rotulo="retorno QA" cor="hsl(38,92%,50%)" />
            <Kpi valor={categoria.aviao} rotulo="aviões" cor="hsl(199,89%,48%)" />
          </div>
        </CardContent>
      </Card>

      {/* Linha 1 — tendência + evolução diária */}
      <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-0">
        <Card className="col-span-7 h-full flex flex-col">
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              Desempenho · evolução por sprint
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 pb-3">
            <DesempenhoTrendChart height={150} maxSprints={8} showValues />
          </CardContent>
        </Card>
        <div className="col-span-5 h-full">
          <DailyProgressCard sprintCode={sprintCode} chartHeight={118} />
        </div>
      </div>

      {/* Linha 2 — ranking por fábrica (4 numa linha) */}
      <div className="flex-1 min-h-0">
        <RankingFabricasCard maxSprints={4} columns={4} svgHeight={100} />
      </div>

      {/* Linha 3 — qualidade por sprint + capacity por squad */}
      <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-0">
        <div className="col-span-7 h-full">
          <QualidadePorFabricaCharts maxSprints={6} chartHeight={100} />
        </div>
        <div className="col-span-5 h-full">
          <UsoCruzadoCard fabricaRows={fab.horasPorFabricaFull ?? []} compact />
        </div>
      </div>
    </div>
  );
}
