import { useMemo } from 'react';
import { Zap, RotateCcw, CalendarClock } from 'lucide-react';
import { BlocoCard } from '@/components/executivo/BlocoCard';
import { DesempenhoTrendChart } from '@/components/fabrica/DesempenhoTrendChart';
import { RankingFabricasCard } from '@/components/fabrica/RankingFabricasCard';
import { QualidadePorFabricaCharts } from '@/components/fabrica/QualidadePorFabricaCharts';
import { DailyProgressCard } from '@/components/fabrica/DailyProgressCard';
import { UsoCruzadoCard } from '@/components/fabrica/UsoCruzadoCard';
import { contaCategorias } from '@/lib/fabricaClassificacao';

interface FabKpisLite {
  total: number;
  done: number;
  inProgress: number; // inclui "entregue"
  entregue: number;
  toDo: number;
  isLoading: boolean;
  /** Itens da régua do gestor — mesma base do "Itens no escopo". */
  kpiItems?: Array<{ work_item_type?: string | null; tags?: string | null }>;
  horasPorFabricaFull?: Array<{ key: string; collaborators: { name: string; minutes: number }[] }>;
}

interface FabricaExecutivoTabProps {
  fab: FabKpisLite;
  selectedSprintCode?: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  periodLabel?: string;
}

/**
 * Visão Executiva da Fábrica — MESMO conteúdo do modo TV, em layout de aba
 * (tudo empilhado, versões completas dos cards). Sem "O que queremos"/metas,
 * Saúde dos itens ou Linha de base: o que não está no TV saiu daqui também.
 */
export function FabricaExecutivoTab({ fab, selectedSprintCode, dateFrom, dateTo, periodLabel }: FabricaExecutivoTabProps) {
  /**
   * Régua canônica (`@/lib/fabricaClassificacao`) sobre `kpiItems` — o mesmo
   * conjunto do card "Itens no escopo" acima. O bloco de regex que vivia aqui
   * rodava sobre `fab.items` sem `count_in_kpi`/estado contável e sem a
   * precedência de Priorização; era uma das origens do "39 que não bate com o
   * Gerencial" (29/07/2026).
   */
  const categoria = useMemo(() => {
    const c = contaCategorias(fab.kpiItems ?? []);
    return { bug: c.bug, retorno: c.retornoQa, aviao: c.aviaoSprint + c.aviaoTransbordado };
  }, [fab.kpiItems]);

  // Concluído = Done + Entregue (regra do gestor); "em dev" exclui os entregues.
  const concluido = fab.done + fab.entregue;
  const conclPct = fab.total > 0 ? Math.round((concluido / fab.total) * 100) : 0;
  const emDev = Math.max(0, fab.inProgress - fab.entregue);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Visão Executiva</h2>
        <p className="text-sm text-muted-foreground">
          Fábrica · mesma visão do modo TV {periodLabel ? `· ${periodLabel}` : ''}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BlocoCard icon={Zap} titulo="Itens no escopo">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-4xl font-bold font-mono">{fab.isLoading ? '—' : fab.total}</p>
              <p className="text-xs text-muted-foreground mt-0.5">itens na sprint</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold font-mono" style={{ color: conclPct >= 80 ? '#16a34a' : conclPct >= 50 ? '#f59e0b' : '#ef4444' }}>{conclPct}%</p>
              <p className="text-[11px] text-muted-foreground">concluído · Done + Entregue</p>
            </div>
          </div>
          {fab.total > 0 && (
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              <div style={{ width: `${(fab.done / fab.total) * 100}%`, backgroundColor: 'hsl(142,71%,45%)' }} />
              <div style={{ width: `${(fab.entregue / fab.total) * 100}%`, backgroundColor: 'hsl(160,60%,45%)' }} />
              <div style={{ width: `${(emDev / fab.total) * 100}%`, backgroundColor: 'hsl(210,80%,52%)' }} />
            </div>
          )}
          <div className="grid grid-cols-4 gap-2 border-t pt-2 text-center">
            <div><p className="text-lg font-bold font-mono text-[hsl(28,90%,52%)]">{emDev}</p><p className="text-[11px] text-muted-foreground">em dev</p></div>
            <div><p className="text-lg font-bold font-mono text-amber-500">{fab.toDo}</p><p className="text-[11px] text-muted-foreground">a fazer</p></div>
            <div><p className="text-lg font-bold font-mono text-[hsl(210,80%,52%)]">{fab.entregue}</p><p className="text-[11px] text-muted-foreground">entregue</p></div>
            <div><p className="text-lg font-bold font-mono text-[hsl(142,71%,45%)]">{fab.done}</p><p className="text-[11px] text-muted-foreground">done</p></div>
          </div>
        </BlocoCard>

        <BlocoCard icon={RotateCcw} titulo="Demandas por tipo">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-3xl font-bold font-mono text-destructive">{categoria.bug}</p>
              <p className="text-[11px] text-muted-foreground">Bugs</p>
            </div>
            <div>
              <p className="text-3xl font-bold font-mono text-amber-500">{categoria.retorno}</p>
              <p className="text-[11px] text-muted-foreground">Retorno QA</p>
            </div>
            <div>
              <p className="text-3xl font-bold font-mono text-[hsl(199,89%,48%)]">{categoria.aviao}</p>
              <p className="text-[11px] text-muted-foreground">Aviões</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2">Classificação das demandas no escopo por tag.</p>
        </BlocoCard>
      </div>

      {/* Desempenho · evolução por sprint */}
      <BlocoCard icon={CalendarClock} titulo="Desempenho · evolução por sprint">
        <DesempenhoTrendChart height={220} />
        <p className="text-[11px] text-muted-foreground border-t pt-2">
          % Entrega (concluído ÷ escopo, ↑ melhor) · % Retorno QA · % Bug (↓ melhor) — últimas 8 sprints.
          Os três percentuais são <b>sobre o escopo da sprint</b> (régua do guia de indicadores) e vêm das
          <b> fotografias seladas</b>: a sprint em curso não tem ponto aqui.
        </p>
      </BlocoCard>

      {/* Desempenho por Fábrica — ranking */}
      <RankingFabricasCard maxSprints={6} />

      {/* Qualidade das Fábricas — por sprint */}
      <QualidadePorFabricaCharts maxSprints={6} />

      {/* Evolução diária — Entregue & Done */}
      <DailyProgressCard sprintCode={selectedSprintCode} />

      {/* Capacidade × Realizado por Squad (uso cruzado) */}
      <UsoCruzadoCard fabricaRows={fab.horasPorFabricaFull ?? []} dateFrom={dateFrom} dateTo={dateTo} />
    </div>
  );
}
