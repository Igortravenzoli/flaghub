import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, LabelList,
} from 'recharts';
import { Headphones, Network, Users, Clock, CalendarClock, Monitor, ShieldCheck, Gauge } from 'lucide-react';
import { BlocoCard, SecHeader } from '@/components/executivo/BlocoCard';
import type { ConsultorKpi, TipoChamadoKpi, RegistroPorGrupo, HistoricoEntry } from '@/hooks/useHelpdeskKpis';
import { useBICustomerKpis, type BICustomerSegmento } from '@/hooks/useBICustomer';

// Metas fixas de SLA (gateway Gestão / BICustomerPanel)
const META_TTR_DIAS = 3.9;
const META_24H_PCT = 48;

// Consultores de atendimento (CS) — escopo do Wilker
const CONSULTORES_CS = ['ailton', 'italo', 'leandro', 'vagner', 'guimaraes', 'ricardo', 'wilker', 'bruna', 'ronaldo'];
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const isConsultorCS = (nome: string) => { const n = norm(nome); return CONSULTORES_CS.some((t) => n.includes(t)); };

const corMeta = (ok: boolean) => (ok ? '#16a34a' : '#ef4444');

/** Card SLA (Mês) por segmento — TTR (≤3,9d) · ≤24h (≥48%) · Tickets/OS (meta < mês anterior). */
function SlaMesCard({ titulo, seg }: { titulo: string; seg?: BICustomerSegmento }) {
  const ttr = seg?.metricas.ttrMedioDias;
  const p24 = seg?.metricas.pctEncerrados24h;
  const total = seg?.mesAtual.total;
  const prev = seg?.mesAnterior.total;
  const unidade = seg?.unidade === 'ticket' ? 'tickets' : 'OS';
  const totalOk = total != null && prev != null ? total <= prev : true;
  return (
    <BlocoCard icon={ShieldCheck} titulo={titulo}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-2xl font-bold font-mono" style={{ color: ttr == null ? undefined : corMeta(ttr <= META_TTR_DIAS) }}>{ttr != null ? `${ttr.toFixed(2)}d` : '—'}</p>
          <p className="text-[11px] text-muted-foreground">TTR médio</p>
          <p className="text-[10px] text-muted-foreground">meta ≤ {META_TTR_DIAS}d</p>
        </div>
        <div>
          <p className="text-2xl font-bold font-mono" style={{ color: p24 == null ? undefined : corMeta(p24 >= META_24H_PCT) }}>{p24 != null ? `${p24.toFixed(0)}%` : '—'}</p>
          <p className="text-[11px] text-muted-foreground">≤ 24h</p>
          <p className="text-[10px] text-muted-foreground">meta ≥ {META_24H_PCT}%</p>
        </div>
        <div>
          <p className="text-2xl font-bold font-mono" style={{ color: total == null ? undefined : corMeta(totalOk) }}>{total ?? '—'}</p>
          <p className="text-[11px] text-muted-foreground">{unidade}</p>
          <p className="text-[10px] text-muted-foreground">meta &lt; {prev ?? '—'}</p>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground border-t pt-2">Mês atual vs. mês anterior. (Anual e meta TTR vs. mês anterior: pendente gateway.)</p>
    </BlocoCard>
  );
}

interface HelpdeskExecutivoTabProps {
  totalRegistros: number;
  totalHoras: number;
  consultoresAtivos: number;
  registrosPorConsultor: ConsultorKpi[];
  tipoChamadoTempoMedio: TipoChamadoKpi[];
  registrosPorSistema: RegistroPorGrupo[];
  registrosPorBandeira: RegistroPorGrupo[];
  registrosPorCliente: RegistroPorGrupo[];
  historico: HistoricoEntry[];
  periodLabel?: string;
}

export function HelpdeskExecutivoTab({
  totalRegistros, totalHoras, consultoresAtivos,
  registrosPorConsultor, tipoChamadoTempoMedio,
  registrosPorSistema, registrosPorBandeira, registrosPorCliente,
  historico, periodLabel,
}: HelpdeskExecutivoTabProps) {
  const { data: sla } = useBICustomerKpis();

  // Volume por consultor — filtra os 9 do CS e DEDUPLICA por nome (corrige "duas barrinhas")
  const consultoresData = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of registrosPorConsultor) {
      if (!isConsultorCS(c.nome)) continue;
      map.set(c.nome, (map.get(c.nome) ?? 0) + c.totalRegistros);
    }
    return [...map.entries()].map(([nome, registros]) => ({ nome, registros })).sort((a, b) => b.registros - a.registros);
  }, [registrosPorConsultor]);

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

      {/* ═══════ 1ª LINHA — RESULTADO ═══════ */}
      <SecHeader title="Resultado" subtitle="SLA e panorama do mês" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <SlaMesCard titulo="SLA Nestlé (Mês)" seg={sla?.nestle} />
        <SlaMesCard titulo="SLA Flag (Mês)" seg={sla?.outras} />

        {/* Panorama do Atendimento */}
        <BlocoCard icon={Headphones} titulo="Panorama do Atendimento">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-4xl font-bold font-mono">{totalRegistros}</p>
              <p className="text-xs text-muted-foreground mt-0.5">registros no período</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold font-mono">{totalHoras}h</p>
              <p className="text-[11px] text-muted-foreground">horas</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2">
            {consultoresAtivos} consultor{consultoresAtivos !== 1 ? 'es' : ''} ativo{consultoresAtivos !== 1 ? 's' : ''}. (Comparativo vs. mês anterior: pendente 2ª consulta ao gateway.)
          </p>
        </BlocoCard>
      </div>

      {/* ═══════ 2ª LINHA — INDICADORES ═══════ */}
      <SecHeader title="Indicadores" subtitle="cobertura, tipos e produtividade" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Cobertura do Atendimento */}
        <BlocoCard icon={Network} titulo="Cobertura do Atendimento">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><p className="text-3xl font-bold font-mono">{registrosPorSistema.length}</p><p className="text-[11px] text-muted-foreground">sistemas</p></div>
            <div><p className="text-3xl font-bold font-mono">{registrosPorBandeira.length}</p><p className="text-[11px] text-muted-foreground">bandeiras</p></div>
            <div><p className="text-3xl font-bold font-mono">{registrosPorCliente.length}</p><p className="text-[11px] text-muted-foreground">clientes</p></div>
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2">Abrangência do atendimento. (Saneamento de base do Lantim em andamento.)</p>
        </BlocoCard>

        {/* Tempo Médio por Tipo de Chamado */}
        <BlocoCard icon={Clock} titulo="Tempo Médio por Tipo de Chamado">
          {tipos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Sem dados de tipo de chamado.</p>
          ) : (
            <div className="overflow-y-auto" style={{ maxHeight: 200 }}>
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

        {/* Produtividade dos Consultores — próxima entrega (dados do TechLead) */}
        <BlocoCard icon={Gauge} titulo="Produtividade dos Consultores">
          <div className="flex items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Em integração com a aba <b>TechLead</b> (consultor × produtividade %).<br />Próxima entrega.
            </p>
          </div>
        </BlocoCard>
      </div>

      {/* ═══════ 3ª LINHA — ANÁLISE ═══════ */}
      <SecHeader title="Análise" subtitle="volumes por dia, consultor e sistema" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Volume de Atendimentos por Dia */}
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

        {/* Volume de Atendimentos por Consultor */}
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

        {/* Volume de Atendimentos por Sistema */}
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
      </div>
    </div>
  );
}
