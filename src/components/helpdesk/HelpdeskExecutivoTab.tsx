import { useMemo, useState, type ReactNode } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, LabelList,
} from 'recharts';
import {
  Users, Clock, CalendarClock, Monitor,
} from 'lucide-react';
import { BlocoCard, SecHeader, SeloCalculado } from '@/components/executivo/BlocoCard';
import type { ConsultorKpi, TipoChamadoKpi, RegistroPorGrupo, HistoricoEntry } from '@/hooks/useHelpdeskKpis';
import { agrupaVolumePorConsultorCS } from '@/lib/csConsultores';
import { useGestaoSlaMensal } from '@/hooks/useGestaoKpis';
import {
  SlaSegmentoCard, SlaIncDetalheSheet, type SlaIncDrillAlvo,
} from '@/components/helpdesk/SlaSegmentoCard';
import { PanoramaAtendimentoCard } from '@/components/helpdesk/PanoramaAtendimentoCard';
import { ProdutividadeConsultoresCard } from '@/components/helpdesk/ProdutividadeConsultoresCard';
import { IncidentesDeclaradosCard } from '@/components/helpdesk/IncidentesDeclaradosCard';

// Consultores de atendimento (CS): lista, filtro e dedupe promovidos para
// `@/lib/csConsultores` (07/08/2026) — compartilhados com a TV (`CsTvView`).

interface HelpdeskExecutivoTabProps {
  totalRegistros: number;
  /** MINUTOS BRUTOS (não `totalHoras`): o TMA e o h:mm são calculados aqui.
   *  Dividir o decimal já arredondado da origem degradaria os dois. */
  totalMinutos: number;
  consultoresAtivos: number;
  registrosPorConsultor: ConsultorKpi[];
  tipoChamadoTempoMedio: TipoChamadoKpi[];
  registrosPorSistema: RegistroPorGrupo[];
  registrosPorBandeira: RegistroPorGrupo[];
  registrosPorCliente: RegistroPorGrupo[];
  historico: HistoricoEntry[];
  periodLabel?: string;
  /** Período dos cards que consultam o backend por range (produtividade dias-úteis
   *  e incidentes declarados). Default: mês atual. */
  dataInicio?: Date;
  dataFim?: Date;
  /** Filtro de período (renderizado no topo). Omitido no kiosk/TV. */
  filterBar?: ReactNode;
}

export function HelpdeskExecutivoTab({
  totalRegistros, totalMinutos, consultoresAtivos,
  registrosPorConsultor, tipoChamadoTempoMedio,
  registrosPorSistema, registrosPorBandeira, registrosPorCliente,
  historico, periodLabel, dataInicio, dataFim, filterBar,
}: HelpdeskExecutivoTabProps) {
  // SLA-1: um hook por segmento, janela de CALENDÁRIO (não recebe o filtro).
  const slaNestle = useGestaoSlaMensal('nestle');
  const slaHeineken = useGestaoSlaMensal('heineken');
  const slaOutras = useGestaoSlaMensal('outros');

  const [incDrill, setIncDrill] = useState<SlaIncDrillAlvo | null>(null);
  // Sem filterBar → rodapé sem clique. (Até 07/08/2026 era o caso do modo TV;
  // hoje o kiosk renderiza a CsTvView e esta tab é só de mesa, mas a regra fica:
  // quem montar a tab sem filtro não ganha drill.)
  const drillInc = filterBar ? setIncDrill : undefined;

  const now = new Date();
  const periodoIni = dataInicio ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const periodoFim = dataFim ?? now;

  // Volume por consultor — filtra os 9 do CS e DEDUPLICA por nome (corrige "duas barrinhas")
  const consultoresData = useMemo(
    () => agrupaVolumePorConsultorCS(registrosPorConsultor),
    [registrosPorConsultor]
  );

  const sistemas = useMemo(
    () => [...registrosPorSistema].sort((a, b) => b.quantidade - a.quantidade),
    [registrosPorSistema]
  );

  const tipos = useMemo(
    () => [...tipoChamadoTempoMedio].sort((a, b) => b.quantidade - a.quantidade)
      .map((t) => ({ tipo: t.tipo, tempo: Math.round(t.tempoMedio) })),
    [tipoChamadoTempoMedio]
  );

  const volumeDia = useMemo(
    () => [...historico]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((h) => ({
        label: new Date(h.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        registros: h.totalRegistros,
      })),
    [historico]
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Visão Executiva</h2>
        <p className="text-sm text-muted-foreground">
          Customer Service · resultado · indicadores · análise {periodLabel ? `· ${periodLabel}` : ''}
        </p>
      </div>

      {filterBar}

      {/* ═══════ 1ª LINHA — RESULTADO (SLA-3/4/5/8) ═══════
          3 slots, nesta ordem, e o 3º é "Outras Bandeiras" (nunca mais "Flag"). */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <SecHeader
            title="Resultado"
            subtitle="SLA por mês de calendário — mês atual · mês anterior · ano"
          />
        </div>
        <SeloCalculado
          janela={'Resultado calculado sobre janelas de calendário fechadas (mês atual, mês anterior e ano corrente).\nNão responde ao filtro de período desta tela.'}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <SlaSegmentoCard
          titulo="Nestlé"
          data={slaNestle.data} isLoading={slaNestle.isLoading} isError={slaNestle.isError}
          refetch={() => slaNestle.refetch()} onDrillInc={drillInc}
        />
        <SlaSegmentoCard
          titulo="Heineken"
          data={slaHeineken.data} isLoading={slaHeineken.isLoading} isError={slaHeineken.isError}
          refetch={() => slaHeineken.refetch()} onDrillInc={drillInc}
        />
        <SlaSegmentoCard
          titulo="Outras Bandeiras"
          data={slaOutras.data} isLoading={slaOutras.isLoading} isError={slaOutras.isError}
          refetch={() => slaOutras.refetch()} onDrillInc={drillInc}
        />
      </div>

      {/* ═══════ 2ª LINHA — INDICADORES ═══════ */}
      <SecHeader title="Indicadores" subtitle="panorama, produtividade e volume por consultor" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* PAN-1 + PAN-2 */}
        <PanoramaAtendimentoCard
          totalRegistros={totalRegistros}
          totalMinutos={totalMinutos}
          consultoresAtivos={consultoresAtivos}
          totalSistemas={registrosPorSistema.length}
          totalBandeiras={registrosPorBandeira.length}
          clientesNoPeriodo={registrosPorCliente.length}
        />

        {/* PRD-1 — heatmap dia-a-dia + média sobre DIAS ÚTEIS */}
        <ProdutividadeConsultoresCard dataInicio={periodoIni} dataFim={periodoFim} />

        {/* Volume de Atendimentos por Consultor — movido da 3ª linha, JSX inalterado */}
        <BlocoCard icon={Users} titulo="Volume de Atendimentos por Consultor">
          {consultoresData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem consultores no período.</p>
          ) : (
            <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
              <ResponsiveContainer width="100%" height={Math.max(160, consultoresData.length * 30)}>
                <BarChart data={consultoresData} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 8 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="nome" width={96} tick={{ fontSize: 10 }} />
                  <RTooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="registros" fill="hsl(174,58%,40%)" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="registros" position="insideRight" fill="#fff" style={{ fontSize: 11, fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground border-t pt-2">Consultores do CS (role para ver todos).</p>
        </BlocoCard>
      </div>

      {/* ═══════ 3ª LINHA — ANÁLISE ═══════ */}
      <SecHeader title="Análise" subtitle="volume por dia e por sistema · tempo médio por tipo" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Volume de Atendimentos por Dia — JSX inalterado */}
        <BlocoCard icon={CalendarClock} titulo="Volume de Atendimentos por Dia">
          {volumeDia.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem série no período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={volumeDia} margin={{ top: 16, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [`${v} registros`, '']} />
                <Bar dataKey="registros" fill="hsl(199,89%,48%)" radius={[3, 3, 0, 0]}>
                  <LabelList dataKey="registros" position="top" style={{ fontSize: 10 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="text-[11px] text-muted-foreground border-t pt-2">Registros de atendimento por dia.</p>
        </BlocoCard>

        {/* Volume de Atendimentos por Sistema — movido, JSX inalterado */}
        <BlocoCard icon={Monitor} titulo="Volume de Atendimentos por Sistema">
          {sistemas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem sistemas no período.</p>
          ) : (
            <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
              <ResponsiveContainer width="100%" height={Math.max(160, sistemas.length * 28)}>
                <BarChart data={sistemas} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 8 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="nome" width={96} tick={{ fontSize: 10 }} />
                  <RTooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="quantidade" fill="hsl(199,89%,48%)" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="quantidade" position="insideRight" fill="#fff" style={{ fontSize: 11, fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground border-t pt-2">Volume por sistema (role para ver todos).</p>
        </BlocoCard>

        {/* Tempo Médio por Tipo de Chamado — DESCE da 2ª linha. JSX inalterado
            exceto maxHeight 200 → 220, para casar a rolagem com os dois vizinhos. */}
        <BlocoCard icon={Clock} titulo="Tempo Médio por Tipo de Chamado">
          {tipos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Sem dados de tipo de chamado.</p>
          ) : (
            <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
              <ResponsiveContainer width="100%" height={Math.max(160, tipos.length * 28)}>
                <BarChart data={tipos} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 8 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} unit="m" />
                  <YAxis type="category" dataKey="tipo" width={96} tick={{ fontSize: 10 }} />
                  <RTooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [`${v} min`, 'tempo médio']} />
                  <Bar dataKey="tempo" fill="hsl(262,83%,58%)" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="tempo" position="insideRight" fill="#fff" style={{ fontSize: 11, fontWeight: 600 }} formatter={(v: number) => `${v}m`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground border-t pt-2">Todos os tipos (role para ver mais).</p>
        </BlocoCard>
      </div>

      {/* ═══════ 4ª LINHA — INCIDENTES DECLARADOS (INC-1..3) ═══════ */}
      <SecHeader
        title="Incidentes declarados"
        subtitle="lista SG-LST-016/017 do SharePoint SGSI — declaração manual, filtrada pelo período"
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <IncidentesDeclaradosCard dataInicio={periodoIni} dataFim={periodoFim} />
      </div>

      {/* Drill-down das INC (fora das grids; só existe quando há filtro, i.e. não na TV) */}
      <SlaIncDetalheSheet alvo={incDrill} onClose={() => setIncDrill(null)} />
    </div>
  );
}
