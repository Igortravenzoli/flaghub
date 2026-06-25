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

const META_NESTLE_TICKETS_ANO = 5716;

const corOk = (ok: boolean | null) => (ok == null ? undefined : ok ? '#16a34a' : '#ef4444');
const okLow = (v?: number | null, m?: number | null) => (v == null || m == null ? null : v <= m);
const okHigh = (v?: number | null, m?: number | null) => (v == null || m == null ? null : v >= m);
const fmtMeta = (m?: number | null, suf = '') => (m == null ? '—' : suf === 'd' ? `${m.toFixed(2)}d` : suf === '%' ? `${Math.round(m)}%` : `${m}`);

function MetricaSla({ label, valor, sufixo, ok, meta }: {
  label: string; valor?: number | null; sufixo: 'd' | '%' | ''; ok: boolean | null; meta: string;
}) {
  const fmt = valor == null ? '—' : sufixo === 'd' ? `${valor.toFixed(2)}d` : sufixo === '%' ? `${Math.round(valor)}%` : `${valor}`;
  return (
    <div>
      <p className="text-lg font-bold font-mono leading-tight" style={{ color: corOk(ok) }}>{fmt}</p>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
      <p className="text-[9px] text-muted-foreground/80 leading-tight">{meta}</p>
    </div>
  );
}

/** Card SLA por segmento (Nestlé/Flag) — seções Ano (acumulado) e Mês (atual). */
function SlaSegmentoCard({ titulo, seg, isNestle }: { titulo: string; seg?: BICustomerSegmento; isNestle: boolean }) {
  const ano = new Date().getFullYear();
  const unid = seg?.unidade === 'ticket' ? 'tickets' : 'OS';

  // Ano (acumulado): Nestlé = metas fixas; Outros = vs ano anterior
  const ttrAno = seg?.metricasAno?.ttrMedioDias;
  const p24Ano = seg?.metricasAno?.pctEncerrados24h;
  const totAno = seg?.ano?.total;
  const ttrAnoMeta = isNestle ? META_TTR_DIAS : seg?.metricasAnoAnterior?.ttrMedioDias;
  const p24AnoMeta = isNestle ? META_24H_PCT : seg?.metricasAnoAnterior?.pctEncerrados24h;
  const totAnoMeta = isNestle ? META_NESTLE_TICKETS_ANO : seg?.anoAnterior?.total;

  // Mês atual: metas vs mês anterior
  const ttrMes = seg?.metricas.ttrMedioDias;
  const p24Mes = seg?.metricas.pctEncerrados24h;
  const totMes = seg?.mesAtual.total;
  const ttrMesMeta = seg?.metricasMesAnterior?.ttrMedioDias;
  const p24MesMeta = seg?.metricasMesAnterior?.pctEncerrados24h;
  const totMesMeta = seg?.mesAnterior.total;

  return (
    <BlocoCard icon={ShieldCheck} titulo={`SLA ${titulo}`}>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ano {ano}</p>
        <div className="grid grid-cols-3 gap-2 text-center mt-1">
          <MetricaSla label="TTR" valor={ttrAno} sufixo="d" ok={okLow(ttrAno, ttrAnoMeta)} meta={`≤ ${fmtMeta(ttrAnoMeta, 'd')}`} />
          <MetricaSla label="≤24h" valor={p24Ano} sufixo="%" ok={okHigh(p24Ano, p24AnoMeta)} meta={`≥ ${fmtMeta(p24AnoMeta, '%')}`} />
          <MetricaSla label={unid} valor={totAno} sufixo="" ok={okLow(totAno, totAnoMeta)} meta={`≤ ${fmtMeta(totAnoMeta)}`} />
        </div>
      </div>
      <div className="border-t pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Mês atual</p>
        <div className="grid grid-cols-3 gap-2 text-center mt-1">
          <MetricaSla label="TTR" valor={ttrMes} sufixo="d" ok={okLow(ttrMes, ttrMesMeta)} meta={`vs ${fmtMeta(ttrMesMeta, 'd')}`} />
          <MetricaSla label="≤24h" valor={p24Mes} sufixo="%" ok={okHigh(p24Mes, p24MesMeta)} meta={`vs ${fmtMeta(p24MesMeta, '%')}`} />
          <MetricaSla label={unid} valor={totMes} sufixo="" ok={okLow(totMes, totMesMeta)} meta={`vs ${fmtMeta(totMesMeta)}`} />
        </div>
      </div>
      {!seg?.metricasAno && (
        <p className="text-[10px] text-muted-foreground/70 border-t pt-1.5">Anual e metas vs. período anterior: aguardando gateway.</p>
      )}
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
        <SlaSegmentoCard titulo="Nestlé" seg={sla?.nestle} isNestle />
        <SlaSegmentoCard titulo="Flag" seg={sla?.outras} isNestle={false} />

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
