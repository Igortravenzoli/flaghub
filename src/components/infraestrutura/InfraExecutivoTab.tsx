import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LabelList, Tooltip as RTooltip,
} from 'recharts';
import { Server, GitBranch, ShieldCheck, Wrench, CalendarClock, Workflow, Activity, CheckCircle2 } from 'lucide-react';
import { BlocoCard, corMetaHigh } from '@/components/executivo/BlocoCard';
import { useDevopsRepos, computeCoberturaKpis, countPipelinesNovasTrimestre } from '@/hooks/useDevopsCobertura';
import { useBIInfraSgsi } from '@/hooks/useBIInfra';

// Metas (espelham as constantes do DevopsCoberturaPanel)
const META_PIPELINES_TRIMESTRE = 3;
const META_COBERTURA_PCT = 80;

// ── Modo TV: alvos e mocks provisórios (Gestão SG ainda sem gateway real) ──
const TV_PIPELINE_ALVOS = [
  { nome: 'Broker 3', status: 'Não iniciado' },
  { nome: 'CargaImagens', status: null },
  { nome: 'Serviço Vdesk DevOps', status: null },
];
// MOCK provisório: 3 incidentes resolvidos dentro do SLA (meta > 90%)
const TV_MOCK_INCIDENTES = {
  dentroSla: 3,
  total: 3,
  itens: [
    { data: '25/06', nome: 'Inc BI embedded' },
    { data: '26/06', nome: 'Inc Merchan' },
    { data: '01/07', nome: 'Inc Promos' },
  ],
};
// MOCK provisório: 2 riscos mitigados em ≤ 30 dias (meta > 90%)
const TV_MOCK_RISCOS = {
  dentroSla: 2,
  total: 2,
  itens: [
    { data: '26/05', nome: 'Risco Backups' },
    { data: '24/06', nome: 'Risco Engenharia Social' },
  ],
};

interface DoneBySprint { sprintCode: string; done: number; total: number }

interface InfraKpisLite {
  total: number;
  concluidos: number;
  emAndamento: number;
  pendentes: number;
  melhorias: number;
  iso27001: number;
  sprintMigracoes: number;
  transbordo: number;
  doneBySprint: DoneBySprint[];
  isLoading: boolean;
}

interface InfraExecutivoTabProps {
  kpis: InfraKpisLite;
  dateFrom?: Date;
  dateTo?: Date;
  periodLabel?: string;
  /** Modo TV (kiosk): 3 blocos — meta pipeline Q3 com alvos, incidentes SLA e riscos ≤30d (mocks provisórios). */
  tvMode?: boolean;
}

export function InfraExecutivoTab({ kpis, dateFrom, dateTo, periodLabel, tvMode }: InfraExecutivoTabProps) {
  const { data: repos = [], isLoading: reposLoading } = useDevopsRepos();
  const { data: sgsi } = useBIInfraSgsi(dateFrom, dateTo);

  const cobertura = useMemo(() => computeCoberturaKpis(repos, 0), [repos]);
  const pipelinesTri = useMemo(() => countPipelinesNovasTrimestre(repos), [repos]);

  const conclPct = kpis.total > 0 ? Math.round((kpis.concluidos / kpis.total) * 100) : 0;
  const coberturaPct = cobertura.coberturaPct ?? 0;
  const pipelinesNovas = pipelinesTri.criadas.length;
  const corPipelines = pipelinesNovas >= META_PIPELINES_TRIMESTRE ? '#16a34a' : pipelinesNovas > 0 ? '#f59e0b' : '#ef4444';

  const ultimasSprints = useMemo(() => kpis.doneBySprint.slice(-3), [kpis.doneBySprint]);

  // ── Modo TV: 3 blocos — meta pipelines com alvos · incidentes SLA · riscos ≤30d ──
  if (tvMode) {
    const corSla = (p: number) => (p > 90 ? '#16a34a' : p >= 80 ? '#f59e0b' : '#ef4444');
    const incPct = Math.round((TV_MOCK_INCIDENTES.dentroSla / TV_MOCK_INCIDENTES.total) * 100);
    const riscoPct = Math.round((TV_MOCK_RISCOS.dentroSla / TV_MOCK_RISCOS.total) * 100);
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold">Visão Executiva</h2>
          <p className="text-sm text-muted-foreground">
            Infraestrutura · metas e disponibilidade {periodLabel ? `· ${periodLabel}` : ''}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {/* BLOCO 1 — Meta pipelines + cobertura CI/CD (KPI+barra à esq · alvos à dir) */}
          <BlocoCard icon={GitBranch} titulo={`Meta · Pipelines ${pipelinesTri.trimestre}`} className="min-h-[200px] justify-center">
            <div className="flex items-stretch gap-6">
              <div className="w-[300px] flex-shrink-0 space-y-3">
                <div>
                  <p className="text-6xl font-bold font-mono leading-none" style={{ color: corPipelines }}>
                    {reposLoading ? '—' : pipelinesNovas}
                    <span className="text-2xl text-muted-foreground"> / {META_PIPELINES_TRIMESTRE}</span>
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">pipelines novas no trimestre</p>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden mt-2">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min((pipelinesNovas / META_PIPELINES_TRIMESTRE) * 100, 100)}%`, backgroundColor: corPipelines }} />
                  </div>
                </div>
                <div className="flex items-end justify-between border-t pt-2">
                  <span className="text-sm text-muted-foreground">cobertura CI/CD · meta {META_COBERTURA_PCT}%</span>
                  <span className="text-xl font-bold font-mono" style={{ color: corMetaHigh(coberturaPct) }}>{reposLoading ? '—' : `${coberturaPct}%`}</span>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-3 gap-3 border-l pl-6">
                {TV_PIPELINE_ALVOS.map((a) => (
                  <div key={a.nome} className="rounded-lg border bg-muted/30 p-3 flex flex-col justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Alvo</span>
                    <span className="text-base font-semibold text-foreground leading-tight">{a.nome}</span>
                    <span className={`text-[11px] font-medium rounded px-1.5 py-0.5 self-start ${a.status ? 'text-amber-500 bg-amber-500/10' : 'text-sky-400 bg-sky-500/10'}`}>
                      {a.status ?? 'Em andamento'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </BlocoCard>

          {/* BLOCO 2 — Gestão SG · Incidentes (KPI+barra à esq · timeline datada à dir) */}
          <BlocoCard icon={Activity} titulo="Gestão SG · Incidentes" className="min-h-[200px] justify-center">
            <div className="flex items-stretch gap-6">
              <div className="w-[300px] flex-shrink-0">
                <div className="flex items-end gap-3">
                  <p className="text-6xl font-bold font-mono leading-none" style={{ color: corSla(incPct) }}>{incPct}%</p>
                  <p className="text-2xl font-mono text-muted-foreground pb-1">
                    {TV_MOCK_INCIDENTES.dentroSla}/{TV_MOCK_INCIDENTES.total}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground mt-1">incidentes dentro do SLA · meta &gt; 90%</p>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden mt-2">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(incPct, 100)}%`, backgroundColor: corSla(incPct) }} />
                </div>
              </div>
              <div className="flex-1 grid grid-cols-3 gap-3 border-l pl-6">
                {TV_MOCK_INCIDENTES.itens.map((i) => (
                  <div key={i.nome} className="rounded-lg border bg-muted/30 p-3 flex flex-col justify-between gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5">{i.data}</span>
                      <CheckCircle2 className="h-4 w-4 text-[hsl(142,71%,45%)]" />
                    </div>
                    <span className="text-base font-semibold text-foreground leading-tight">{i.nome}</span>
                    <span className="text-[11px] font-medium text-[hsl(142,71%,45%)]">dentro do SLA</span>
                  </div>
                ))}
              </div>
            </div>
          </BlocoCard>

          {/* BLOCO 3 — Gestão SG · Riscos (KPI+barra à esq · registro datado à dir) */}
          <BlocoCard icon={ShieldCheck} titulo="Gestão SG · Riscos" className="min-h-[200px] justify-center">
            <div className="flex items-stretch gap-6">
              <div className="w-[300px] flex-shrink-0">
                <div className="flex items-end gap-3">
                  <p className="text-6xl font-bold font-mono leading-none" style={{ color: corSla(riscoPct) }}>{riscoPct}%</p>
                  <p className="text-2xl font-mono text-muted-foreground pb-1">
                    {TV_MOCK_RISCOS.dentroSla}/{TV_MOCK_RISCOS.total}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground mt-1">riscos resolvidos ≤ 30 dias · meta &gt; 90%</p>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden mt-2">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(riscoPct, 100)}%`, backgroundColor: corSla(riscoPct) }} />
                </div>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-3 border-l pl-6">
                {TV_MOCK_RISCOS.itens.map((r) => (
                  <div key={r.nome} className="rounded-lg border bg-muted/30 p-3 flex flex-col justify-between gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5">{r.data}</span>
                      <span className="text-[11px] font-semibold text-[hsl(142,71%,45%)] bg-[hsl(142,71%,45%)]/10 rounded-full px-2 py-0.5">mitigado</span>
                    </div>
                    <span className="flex items-center gap-2 text-base font-semibold text-foreground leading-tight">
                      <ShieldCheck className="h-4 w-4 text-[hsl(280,65%,60%)] flex-shrink-0" />
                      {r.nome}
                    </span>
                    <span className="text-[11px] text-muted-foreground">mitigado ≤ 30 dias</span>
                  </div>
                ))}
              </div>
            </div>
          </BlocoCard>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Visão Executiva</h2>
        <p className="text-sm text-muted-foreground">
          Infraestrutura · onde estamos · o que queremos · de onde viemos {periodLabel ? `· ${periodLabel}` : ''}
        </p>
      </div>

      {/* ── Linha 1: onde estamos · metas ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Onde estamos — Status da sprint */}
        <BlocoCard icon={Server} titulo="Onde estamos · Sprint">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-4xl font-bold font-mono">{kpis.isLoading ? '—' : kpis.total}</p>
              <p className="text-xs text-muted-foreground mt-0.5">atividades no escopo</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold font-mono" style={{ color: conclPct >= 80 ? '#16a34a' : conclPct >= 50 ? '#f59e0b' : '#ef4444' }}>
                {kpis.isLoading ? '—' : `${conclPct}%`}
              </p>
              <p className="text-[11px] text-muted-foreground">concluídas</p>
            </div>
          </div>
          {kpis.total > 0 && (
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              <div style={{ width: `${(kpis.concluidos / kpis.total) * 100}%`, backgroundColor: 'hsl(142,71%,45%)' }} />
              <div style={{ width: `${(kpis.emAndamento / kpis.total) * 100}%`, backgroundColor: 'hsl(210,80%,52%)' }} />
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 border-t pt-2 text-center">
            <div><p className="text-lg font-bold font-mono text-[hsl(210,80%,52%)]">{kpis.emAndamento}</p><p className="text-[11px] text-muted-foreground">andamento</p></div>
            <div><p className="text-lg font-bold font-mono text-amber-500">{kpis.pendentes}</p><p className="text-[11px] text-muted-foreground">backlog</p></div>
            <div><p className="text-lg font-bold font-mono text-[hsl(142,71%,45%)]">{kpis.concluidos}</p><p className="text-[11px] text-muted-foreground">concluídos</p></div>
          </div>
        </BlocoCard>

        {/* Meta — Pipelines no trimestre */}
        <BlocoCard icon={GitBranch} titulo={`Meta · Pipelines ${pipelinesTri.trimestre}`}>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-4xl font-bold font-mono" style={{ color: corPipelines }}>
                {reposLoading ? '—' : pipelinesNovas}
                <span className="text-lg text-muted-foreground"> / {META_PIPELINES_TRIMESTRE}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">pipelines novas no trimestre</p>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min((pipelinesNovas / META_PIPELINES_TRIMESTRE) * 100, 100)}%`, backgroundColor: corPipelines }} />
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2">Meta: {META_PIPELINES_TRIMESTRE} novas pipelines por trimestre.</p>
        </BlocoCard>

        {/* Meta — Cobertura CI/CD */}
        <BlocoCard icon={ShieldCheck} titulo="Meta · Cobertura CI/CD">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-4xl font-bold font-mono" style={{ color: corMetaHigh(coberturaPct) }}>
                {reposLoading ? '—' : `${coberturaPct}%`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {cobertura.aplicaveisComPipeline}/{cobertura.aplicaveis} repos aplicáveis
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-mono text-muted-foreground">meta {META_COBERTURA_PCT}%</p>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(coberturaPct, 100)}%`, backgroundColor: corMetaHigh(coberturaPct) }} />
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2">% de repos aplicáveis com pelo menos 1 pipeline ativa.</p>
        </BlocoCard>
      </div>

      {/* ── Linha 2: de onde viemos · disponibilidade SG · iniciativas ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* De onde viemos — Done por sprint */}
        <BlocoCard icon={CalendarClock} titulo="De onde viemos · Done por sprint">
          {ultimasSprints.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem sprints mapeadas na base.</p>
          ) : (
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={ultimasSprints} margin={{ top: 18, right: 8, left: -24, bottom: 0 }}>
                <XAxis dataKey="sprintCode" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <RTooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(v: number, _n, p: any) => [`${v} done de ${p.payload?.total ?? '—'} itens`, 'Concluídas']}
                />
                <Bar dataKey="done" fill="hsl(142,71%,45%)" radius={[4, 4, 0, 0]} maxBarSize={56}>
                  <LabelList dataKey="done" position="top" style={{ fontSize: 12, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="text-[11px] text-muted-foreground border-t pt-2">Tasks concluídas ao fim de cada sprint — últimas 3 mapeadas.</p>
        </BlocoCard>

        {/* Disponibilidade — Gestão SG (metas SLA) */}
        <BlocoCard icon={ShieldCheck} titulo="Disponibilidade · Gestão SG">
          {(() => {
            const incPct = sgsi?.incidentes.pctDentroSla ?? null;
            const risco30 = sgsi?.riscos.pctResolvido30d ?? null;
            const corSla = (p: number | null) => (p == null ? undefined : p > 90 ? '#16a34a' : p >= 80 ? '#f59e0b' : '#ef4444');
            return (
              <div className="grid grid-cols-2 gap-2 text-center">
                <div>
                  <p className="text-3xl font-bold font-mono" style={{ color: corSla(incPct) }}>{incPct != null ? `${incPct}%` : '—'}</p>
                  <p className="text-[11px] text-muted-foreground">incidentes dentro do SLA</p>
                  <p className="text-[10px] text-muted-foreground">meta &gt; 90%</p>
                </div>
                <div>
                  <p className="text-3xl font-bold font-mono" style={{ color: corSla(risco30) }}>{risco30 != null ? `${risco30}%` : '—'}</p>
                  <p className="text-[11px] text-muted-foreground">riscos resolvidos ≤ 30 dias</p>
                  <p className="text-[10px] text-muted-foreground">meta &gt; 90%</p>
                </div>
              </div>
            );
          })()}
          <div className="grid grid-cols-3 gap-2 text-center border-t pt-2">
            <div>
              <p className="text-lg font-bold font-mono text-[hsl(142,71%,45%)]">{sgsi?.diasSem.incidentes ?? '—'}</p>
              <p className="text-[10px] text-muted-foreground">dias s/ incidente</p>
            </div>
            <div>
              <p className="text-lg font-bold font-mono text-[hsl(142,71%,45%)]">{sgsi?.diasSem.riscos ?? '—'}</p>
              <p className="text-[10px] text-muted-foreground">dias s/ risco</p>
            </div>
            <div>
              <p className="text-lg font-bold font-mono text-[hsl(142,71%,45%)]">{sgsi?.diasSem.naoConformidades ?? '—'}</p>
              <p className="text-[10px] text-muted-foreground">dias s/ NC</p>
            </div>
          </div>
        </BlocoCard>

        {/* Iniciativas & Riscos */}
        <BlocoCard icon={Wrench} titulo="Iniciativas & Riscos">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-2">
              <div className="flex items-center gap-1.5 mb-1"><Wrench className="h-3 w-3 text-[hsl(142,71%,45%)]" /><span className="text-[11px] text-muted-foreground">Melhorias</span></div>
              <p className="text-2xl font-bold font-mono">{kpis.melhorias}</p>
            </div>
            <div className="rounded-lg border p-2">
              <div className="flex items-center gap-1.5 mb-1"><ShieldCheck className="h-3 w-3 text-[hsl(280,65%,60%)]" /><span className="text-[11px] text-muted-foreground">ISO 27001</span></div>
              <p className="text-2xl font-bold font-mono">{kpis.iso27001}</p>
            </div>
            <div className="rounded-lg border p-2">
              <div className="flex items-center gap-1.5 mb-1"><Workflow className="h-3 w-3 text-[hsl(210,80%,52%)]" /><span className="text-[11px] text-muted-foreground">Trocas sprint</span></div>
              <p className="text-2xl font-bold font-mono">{kpis.sprintMigracoes}</p>
            </div>
            <div className="rounded-lg border p-2">
              <div className="flex items-center gap-1.5 mb-1"><Server className={`h-3 w-3 ${kpis.transbordo > 0 ? 'text-destructive' : 'text-muted-foreground'}`} /><span className="text-[11px] text-muted-foreground">Transbordo</span></div>
              <p className={`text-2xl font-bold font-mono ${kpis.transbordo > 0 ? 'text-destructive' : ''}`}>{kpis.transbordo}</p>
            </div>
          </div>
        </BlocoCard>
      </div>
    </div>
  );
}
