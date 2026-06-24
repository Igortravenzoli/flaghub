import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, LabelList,
} from 'recharts';
import { Headphones, Network, Users, Clock, CalendarClock, Monitor } from 'lucide-react';
import { BlocoCard } from '@/components/executivo/BlocoCard';
import type { ConsultorKpi, TipoChamadoKpi, RegistroPorGrupo, HorasDia } from '@/hooks/useHelpdeskKpis';

interface HelpdeskExecutivoTabProps {
  totalRegistros: number;
  totalHoras: number;
  consultoresAtivos: number;
  registrosPorConsultor: ConsultorKpi[];
  tipoChamadoTempoMedio: TipoChamadoKpi[];
  registrosPorSistema: RegistroPorGrupo[];
  registrosPorBandeira: RegistroPorGrupo[];
  registrosPorCliente: RegistroPorGrupo[];
  horasTotaisPorDia: HorasDia[];
  periodLabel?: string;
}

export function HelpdeskExecutivoTab({
  totalRegistros, totalHoras, consultoresAtivos,
  registrosPorConsultor, tipoChamadoTempoMedio,
  registrosPorSistema, registrosPorBandeira, registrosPorCliente,
  horasTotaisPorDia, periodLabel,
}: HelpdeskExecutivoTabProps) {
  const topConsultores = useMemo(
    () => [...registrosPorConsultor].sort((a, b) => b.totalRegistros - a.totalRegistros).slice(0, 8)
      .map(c => ({ nome: c.nome, registros: c.totalRegistros })),
    [registrosPorConsultor]
  );

  const topSistemas = useMemo(
    () => [...registrosPorSistema].sort((a, b) => b.quantidade - a.quantidade).slice(0, 6),
    [registrosPorSistema]
  );

  const tipos = useMemo(
    () => [...tipoChamadoTempoMedio].sort((a, b) => b.quantidade - a.quantidade).slice(0, 6)
      .map(t => ({ tipo: t.tipo, tempo: Math.round(t.tempoMedio) })),
    [tipoChamadoTempoMedio]
  );

  const tendencia = useMemo(
    () => horasTotaisPorDia.map(h => ({
      label: new Date(h.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      registros: h.totalRegistros,
    })),
    [horasTotaisPorDia]
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Visão Executiva</h2>
        <p className="text-sm text-muted-foreground">
          Customer Service · onde estamos · de onde viemos {periodLabel ? `· ${periodLabel}` : ''}
        </p>
      </div>

      {/* ── Linha 1: volume · cobertura · tempo médio ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Onde estamos — Volume de atendimento */}
        <BlocoCard icon={Headphones} titulo="Onde estamos · Atendimento">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-4xl font-bold font-mono">{totalRegistros}</p>
              <p className="text-xs text-muted-foreground mt-0.5">registros no período</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold font-mono">{totalHoras}h</p>
              <p className="text-[11px] text-muted-foreground">horas acumuladas</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2">
            {consultoresAtivos} consultor{consultoresAtivos !== 1 ? 'es' : ''} ativo{consultoresAtivos !== 1 ? 's' : ''} no período.
          </p>
        </BlocoCard>

        {/* Cobertura */}
        <BlocoCard icon={Network} titulo="Cobertura">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-3xl font-bold font-mono">{registrosPorSistema.length}</p>
              <p className="text-[11px] text-muted-foreground">sistemas</p>
            </div>
            <div>
              <p className="text-3xl font-bold font-mono">{registrosPorBandeira.length}</p>
              <p className="text-[11px] text-muted-foreground">bandeiras</p>
            </div>
            <div>
              <p className="text-3xl font-bold font-mono">{registrosPorCliente.length}</p>
              <p className="text-[11px] text-muted-foreground">clientes</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2">Abrangência do atendimento no período.</p>
        </BlocoCard>

        {/* Tempo médio por tipo de chamado */}
        <BlocoCard icon={Clock} titulo="Tempo médio · por tipo">
          {tipos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Sem dados de tipo de chamado.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(140, tipos.length * 24)}>
              <BarChart data={tipos} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 8 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} unit="m" />
                <YAxis type="category" dataKey="tipo" width={90} tick={{ fontSize: 11 }} />
                <RTooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [`${v} min`, 'tempo médio']} />
                <Bar dataKey="tempo" fill="hsl(262,83%,58%)" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="tempo" position="right" style={{ fontSize: 11 }} formatter={(v: number) => `${v}m`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="text-[11px] text-muted-foreground border-t pt-2">Tempo médio de atendimento por tipo de chamado.</p>
        </BlocoCard>
      </div>

      {/* ── Linha 2: de onde viemos (tendência) · carga por consultor · sistemas ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* De onde viemos — Tendência diária */}
        <BlocoCard icon={CalendarClock} titulo="De onde viemos · Tendência">
          {tendencia.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem série no período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={tendencia} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [`${v} registros`, '']} />
                <Bar dataKey="registros" fill="hsl(199,89%,48%)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="text-[11px] text-muted-foreground border-t pt-2">Registros de atendimento por dia.</p>
        </BlocoCard>

        {/* Carga por consultor (ranking) */}
        <BlocoCard icon={Users} titulo="Carga por consultor">
          {topConsultores.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem consultores no período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, topConsultores.length * 24)}>
              <BarChart data={topConsultores} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="nome" width={96} tick={{ fontSize: 11 }} />
                <RTooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="registros" fill="hsl(174,58%,40%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="text-[11px] text-muted-foreground border-t pt-2">Ranking por registros atendidos.</p>
        </BlocoCard>

        {/* Top sistemas */}
        <BlocoCard icon={Monitor} titulo="Sistemas mais atendidos">
          {topSistemas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem sistemas no período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, topSistemas.length * 24)}>
              <BarChart data={topSistemas} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="nome" width={96} tick={{ fontSize: 11 }} />
                <RTooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="quantidade" fill="hsl(199,89%,48%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="text-[11px] text-muted-foreground border-t pt-2">Volume de registros por sistema.</p>
        </BlocoCard>
      </div>
    </div>
  );
}
