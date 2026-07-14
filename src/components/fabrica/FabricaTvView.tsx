import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarClock } from 'lucide-react';
import { DesempenhoTrendChart } from '@/components/fabrica/DesempenhoTrendChart';
import { RankingFabricasCard } from '@/components/fabrica/RankingFabricasCard';
import { QualidadePorFabricaCharts } from '@/components/fabrica/QualidadePorFabricaCharts';
import { DailyProgressCard } from '@/components/fabrica/DailyProgressCard';
import { UsoCruzadoCard } from '@/components/fabrica/UsoCruzadoCard';

/**
 * Rotação interna do TV da Fábrica. São 6 blocos densos — numa tela só nenhum
 * fica legível a distância. Alternando 2 páginas, cada bloco ganha ~2x a altura
 * e nada precisa sair do telão.
 */
const PAGE_MS = 25_000;
const PAGES = 2;

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
    <div className="flex-1 text-center border-l first:border-l-0 px-2">
      <p className="text-2xl font-bold font-mono leading-none" style={cor ? { color: cor } : undefined}>{valor}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{rotulo}</p>
    </div>
  );
}

/**
 * Modo TV da Fábrica — 2 páginas que se alternam sozinhas:
 *   1) Desempenho: tendência por sprint + ranking por fábrica (barra aninhada).
 *   2) Qualidade & capacidade: qualidade por sprint + evolução diária + uso cruzado.
 *
 * A faixa de KPIs fica fixa nas duas, então o número principal nunca some da parede.
 * Sem Saúde dos itens / Itens saudáveis / Transbordo / Linha de base (saíram do TV).
 */
export function FabricaTvView({ fab, sprintCode, periodLabel }: FabricaTvViewProps) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setPage((p) => (p + 1) % PAGES), PAGE_MS);
    return () => window.clearInterval(t);
  }, []);

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
    <div className="w-full h-full flex flex-col gap-2.5 overflow-hidden">
      {/* Faixa de KPIs — fixa nas duas páginas */}
      <Card className="flex-none">
        <CardContent className="py-2.5 flex items-center gap-2">
          <div className="pr-4 flex-none">
            <p className="text-base font-bold leading-tight">Fábrica · Visão Executiva</p>
            <p className="text-[11px] text-muted-foreground">{periodLabel || sprintCode || 'Sprint atual'}</p>
          </div>
          <div className="flex items-center flex-1 divide-x divide-border">
            <Kpi valor={fab.isLoading ? '—' : fab.total} rotulo="itens no escopo" />
            <Kpi valor={`${conclPct}%`} rotulo="concluído" cor={corConcl} />
            <Kpi valor={fab.done} rotulo="done" cor="hsl(142,71%,42%)" />
            <Kpi valor={fab.inProgress} rotulo="em dev" cor="hsl(210,80%,52%)" />
            <Kpi valor={categoria.bug} rotulo="bugs" cor="hsl(0,72%,52%)" />
            <Kpi valor={categoria.retorno} rotulo="retorno QA" cor="hsl(38,92%,50%)" />
            <Kpi valor={categoria.aviao} rotulo="aviões" cor="hsl(199,89%,48%)" />
          </div>
          {/* Indicador de página — deixa claro que a tela alterna */}
          <div className="flex-none flex items-center gap-1.5 pl-3">
            {Array.from({ length: PAGES }, (_, i) => (
              <span
                key={i}
                className="block rounded-full transition-all"
                style={{
                  width: i === page ? 18 : 6,
                  height: 6,
                  background: i === page ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  opacity: i === page ? 1 : 0.35,
                }}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {page === 0 ? (
        <>
          {/* ─── Página 1 — Desempenho ─── */}
          <Card className="flex-1 min-h-0 flex flex-col">
            <CardHeader className="pb-1 pt-3 flex-none">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" />
                Desempenho · evolução por sprint
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 pb-3">
              <DesempenhoTrendChart height="100%" maxSprints={8} showValues />
            </CardContent>
          </Card>

          <div className="flex-1 min-h-0">
            <RankingFabricasCard maxSprints={4} columns={4} fill />
          </div>
        </>
      ) : (
        <>
          {/* ─── Página 2 — Qualidade & capacidade ─── */}
          <div className="flex-1 min-h-0">
            <QualidadePorFabricaCharts maxSprints={6} fill />
          </div>

          <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-0">
            <div className="col-span-7 h-full min-h-0">
              <DailyProgressCard sprintCode={sprintCode} fill />
            </div>
            <div className="col-span-5 h-full min-h-0">
              <UsoCruzadoCard fabricaRows={fab.horasPorFabricaFull ?? []} compact fill />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
