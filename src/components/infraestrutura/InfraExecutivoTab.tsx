import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LabelList, Tooltip as RTooltip,
} from 'recharts';
import {
  Server, GitBranch, ShieldCheck, Wrench, CalendarClock, Workflow, Activity,
  CheckCircle2, AlertTriangle, FileWarning, RefreshCw,
} from 'lucide-react';
import { BlocoCard, corMetaHigh } from '@/components/executivo/BlocoCard';
import { useDevopsRepos, computeCoberturaKpis, countPipelinesNovasTrimestre } from '@/hooks/useDevopsCobertura';
import { useBIInfraSgsi, type SgIncidenteItem, type SgRiscoItem, type SgNcItem } from '@/hooks/useBIInfra';

// Metas (espelham as constantes do DevopsCoberturaPanel)
const META_PIPELINES_TRIMESTRE = 3;
const META_COBERTURA_PCT = 80;

// Alvos do trimestre (planejamento) — os repositórios efetivamente atuados
// aparecem ao lado, derivados das pipelines criadas no trimestre.
const TV_PIPELINE_ALVOS = [
  { nome: 'Broker 3', status: 'Não iniciado' },
  { nome: 'CargaImagens', status: null },
  // As 2 pipelines automatizadas do trimestre pertencem a este alvo → concluído.
  { nome: 'Serviço Vdesk DevOps', status: 'Concluído' },
];

interface DoneBySprint { sprintCode: string; done: number; total: number }

/** Item de work item DevOps com a tag #Risco (combina com o SG-LST-012). */
interface RiscoDevopsItem { id: number | null; title: string | null; state: string | null }

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
  /** Riscos do board DevOps (tag #Risco) — combinados com os riscos do SG. */
  riscoItens?: RiscoDevopsItem[];
  isLoading: boolean;
}

interface InfraExecutivoTabProps {
  kpis: InfraKpisLite;
  dateFrom?: Date;
  dateTo?: Date;
  periodLabel?: string;
  /** Modo TV (kiosk): 3 blocos — meta pipeline Q3 com alvos+atuados, incidentes SLA e riscos ≤30d (dados reais do SG). */
  tvMode?: boolean;
}

// ── Helpers de data ──────────────────────────────────────────────────────
function toDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** dd/mm a partir de ISO (sem shift de fuso relevante para exibição curta). */
function fmtDia(iso?: string | null): string {
  const d = toDate(iso);
  if (!d) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
function within30d(iso?: string | null, ref: Date = new Date()): boolean {
  const d = toDate(iso);
  if (!d) return false;
  const diff = ref.getTime() - d.getTime();
  return diff >= 0 && diff <= 30 * 86400000;
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

  // ── Ocorrências recentes (SG-LST) e riscos combinados (SG + DevOps #Risco) ──
  const incidentesRecentes: SgIncidenteItem[] = useMemo(
    () => (sgsi?.incidentes.itens ?? []).filter((i) => within30d(i.inicio)).sort((a, b) => (b.inicio ?? '').localeCompare(a.inicio ?? '')),
    [sgsi],
  );
  const ncRecentes: SgNcItem[] = useMemo(
    () => (sgsi?.naoConformidades.itens ?? []).filter((i) => within30d(i.criado)).sort((a, b) => (b.criado ?? '').localeCompare(a.criado ?? '')),
    [sgsi],
  );
  const riscosSg: SgRiscoItem[] = useMemo(
    () => (sgsi?.riscos.itens ?? []).filter((r) => !/tratad|encerr|conclu|finaliz|rejeitad/i.test(r.status)),
    [sgsi],
  );
  const riscosDevops: RiscoDevopsItem[] = kpis.riscoItens ?? [];
  const riscosCombinados = riscosSg.length + riscosDevops.length;
  const attMalSucedidas = sgsi?.mudancas.atualizacoesBemSucedidas.nao ?? 0;

  // ── Modo TV: 3 blocos — meta pipelines com alvos+atuados · incidentes SLA · riscos ──
  if (tvMode) {
    const corSla = (p: number) => (p > 90 ? '#16a34a' : p >= 80 ? '#f59e0b' : '#ef4444');
    const incPct = sgsi?.incidentes.pctDentroSla ?? null;
    const incTop = incidentesRecentes.slice(0, 3);
    const riscoPct = sgsi?.riscos.pctResolvido30d ?? null;
    const criadasTop = pipelinesTri.criadas.slice(0, 6);
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold">Visão Executiva</h2>
          <p className="text-sm text-muted-foreground">
            Infraestrutura · metas e disponibilidade {periodLabel ? `· ${periodLabel}` : ''}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {/* BLOCO 1 — Meta pipelines (KPI+barra à esq · alvos + repos atuados à dir) */}
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
              <div className="flex-1 border-l pl-6 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  {TV_PIPELINE_ALVOS.map((a) => (
                    <div key={a.nome} className="rounded-lg border bg-muted/30 p-3 flex flex-col justify-between gap-2">
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Alvo</span>
                      <span className="text-base font-semibold text-foreground leading-tight">{a.nome}</span>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium rounded px-1.5 py-0.5 self-start ${
                        a.status === 'Concluído' ? 'text-emerald-500 bg-emerald-500/10'
                          : a.status ? 'text-amber-500 bg-amber-500/10'
                          : 'text-sky-400 bg-sky-500/10'
                      }`}>
                        {a.status === 'Concluído' && <CheckCircle2 className="h-3 w-3" />}
                        {a.status ?? 'Em andamento'}
                      </span>
                    </div>
                  ))}
                </div>
                {criadasTop.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Repositórios atuados no trimestre</p>
                    <div className="flex flex-wrap gap-1.5">
                      {criadasTop.map((c) => (
                        <span key={`${c.repo}-${c.nome}`} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs">
                          <GitBranch className="h-3 w-3 text-[hsl(142,71%,45%)]" />
                          <span className="font-medium text-foreground">{c.repo}</span>
                          <span className="text-muted-foreground">· {c.nome}</span>
                        </span>
                      ))}
                      {pipelinesTri.criadas.length > criadasTop.length && (
                        <span className="text-xs text-muted-foreground self-center">+{pipelinesTri.criadas.length - criadasTop.length}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </BlocoCard>

          {/* BLOCO 2 — Gestão SG · Incidentes (SG-LST-017 real) */}
          <BlocoCard icon={Activity} titulo="Gestão SG · Incidentes" className="min-h-[200px] justify-center">
            <div className="flex items-stretch gap-6">
              <div className="w-[300px] flex-shrink-0">
                <div className="flex items-end gap-3">
                  <p className="text-6xl font-bold font-mono leading-none" style={{ color: corSla(incPct ?? 0) }}>{incPct != null ? `${incPct}%` : '—'}</p>
                  <p className="text-2xl font-mono text-muted-foreground pb-1">{sgsi?.incidentes.resolvidos ?? 0}/{sgsi?.incidentes.total ?? 0}</p>
                </div>
                <p className="text-sm text-muted-foreground mt-1">incidentes dentro do SLA · meta &gt; 90%</p>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden mt-2">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(incPct ?? 0, 100)}%`, backgroundColor: corSla(incPct ?? 0) }} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">{sgsi?.diasSem.incidentes ?? '—'} dias sem incidentes</p>
              </div>
              <div className="flex-1 grid grid-cols-3 gap-3 border-l pl-6">
                {incTop.length === 0 ? (
                  <p className="col-span-3 self-center text-center text-sm text-muted-foreground">Sem incidentes nos últimos 30 dias.</p>
                ) : incTop.map((i) => {
                  const ok = /sim|dentro/i.test(i.sla);
                  return (
                    <div key={i.id} className="rounded-lg border bg-muted/30 p-3 flex flex-col justify-between gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5">{fmtDia(i.inicio)}</span>
                        {ok ? <CheckCircle2 className="h-4 w-4 text-[hsl(142,71%,45%)]" /> : <AlertTriangle className="h-4 w-4 text-red-500" />}
                      </div>
                      <span className="text-base font-semibold text-foreground leading-tight line-clamp-2">{i.titulo}</span>
                      <span className={`text-[11px] font-medium ${ok ? 'text-[hsl(142,71%,45%)]' : 'text-red-500'}`}>{ok ? 'dentro do SLA' : 'fora do SLA'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </BlocoCard>

          {/* BLOCO 3 — Gestão SG · Riscos (SG-LST-012 + DevOps #Risco) */}
          <BlocoCard icon={ShieldCheck} titulo="Gestão SG · Riscos" className="min-h-[200px] justify-center">
            <div className="flex items-stretch gap-6">
              <div className="w-[300px] flex-shrink-0">
                <div className="flex items-end gap-3">
                  <p className="text-6xl font-bold font-mono leading-none" style={{ color: corSla(riscoPct ?? 0) }}>{riscoPct != null ? `${riscoPct}%` : '—'}</p>
                  <p className="text-2xl font-mono text-muted-foreground pb-1">{riscosCombinados} abertos</p>
                </div>
                <p className="text-sm text-muted-foreground mt-1">riscos resolvidos ≤ 30 dias · meta &gt; 90%</p>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden mt-2">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(riscoPct ?? 0, 100)}%`, backgroundColor: corSla(riscoPct ?? 0) }} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">SG-LST-012: {riscosSg.length} · DevOps #Risco: {riscosDevops.length}</p>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-3 border-l pl-6">
                {riscosCombinados === 0 ? (
                  <p className="col-span-2 self-center text-center text-sm text-muted-foreground">Sem riscos em aberto.</p>
                ) : (
                  <>
                    {riscosSg.slice(0, 2).map((r) => (
                      <div key={`sg-${r.id}`} className="rounded-lg border bg-muted/30 p-3 flex flex-col justify-between gap-2">
                        <span className="text-[11px] font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5 self-start">SG · #{r.id}</span>
                        <span className="flex items-center gap-2 text-base font-semibold text-foreground leading-tight line-clamp-2">
                          <ShieldCheck className="h-4 w-4 text-[hsl(280,65%,60%)] flex-shrink-0" />
                          {r.descricao}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{r.status}</span>
                      </div>
                    ))}
                    {riscosDevops.slice(0, 2).map((r) => (
                      <div key={`do-${r.id}`} className="rounded-lg border bg-muted/30 p-3 flex flex-col justify-between gap-2">
                        <span className="text-[11px] font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5 self-start">DevOps · #{r.id}</span>
                        <span className="flex items-center gap-2 text-base font-semibold text-foreground leading-tight line-clamp-2">
                          <GitBranch className="h-4 w-4 text-[hsl(210,80%,52%)] flex-shrink-0" />
                          {r.title}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{r.state}</span>
                      </div>
                    ))}
                  </>
                )}
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

        {/* Meta — Pipelines no trimestre (com repositórios atuados) */}
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
          {pipelinesTri.criadas.length > 0 ? (
            <div className="border-t pt-2 space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">Repositórios atuados ({pipelinesNovas}/{META_PIPELINES_TRIMESTRE}):</p>
              <ul className="space-y-0.5">
                {pipelinesTri.criadas.slice(0, 4).map((c) => (
                  <li key={`${c.repo}-${c.nome}`} className="flex items-center gap-1.5 text-[11px]">
                    <GitBranch className="h-3 w-3 text-[hsl(142,71%,45%)] flex-shrink-0" />
                    <span className="font-medium text-foreground truncate">{c.repo}</span>
                    <span className="text-muted-foreground truncate">· {c.nome}</span>
                  </li>
                ))}
                {pipelinesTri.criadas.length > 4 && (
                  <li className="text-[11px] text-muted-foreground">+{pipelinesTri.criadas.length - 4} outras</li>
                )}
              </ul>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground border-t pt-2">Meta: {META_PIPELINES_TRIMESTRE} novas pipelines por trimestre.</p>
          )}
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
                  formatter={(v: number, _n, p: { payload?: { total?: number } }) => [`${v} done de ${p.payload?.total ?? '—'} itens`, 'Concluídas']}
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

      {/* ── Linha 3: Gestão SG · dias sem ocorrências + recentes (30d) ── */}
      <BlocoCard icon={ShieldCheck} titulo="Gestão SG · dias sem ocorrências (últimos 30 dias)">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {/* Incidentes */}
          <OcorrenciaCol
            icon={Activity} cor="#ef4444" titulo="Incidentes"
            dias={sgsi?.diasSem.incidentes} nRecentes={incidentesRecentes.length}
            vazio="Sem incidentes em 30d"
          >
            {incidentesRecentes.slice(0, 3).map((i) => {
              const ok = /sim|dentro/i.test(i.sla);
              return (
                <RecenteRow key={i.id} data={fmtDia(i.inicio)} texto={i.titulo}
                  badge={ok ? 'dentro SLA' : 'fora SLA'} badgeCor={ok ? '#16a34a' : '#ef4444'} />
              );
            })}
          </OcorrenciaCol>

          {/* Riscos (SG + DevOps #Risco) */}
          <OcorrenciaCol
            icon={AlertTriangle} cor="#f59e0b" titulo="Riscos novos"
            dias={sgsi?.diasSem.riscos} nRecentes={riscosCombinados}
            vazio="Sem riscos em aberto"
          >
            {riscosSg.slice(0, 2).map((r) => (
              <RecenteRow key={`sg-${r.id}`} data={`SG #${r.id}`} texto={r.descricao} badge={r.status} />
            ))}
            {riscosDevops.slice(0, 2).map((r) => (
              <RecenteRow key={`do-${r.id}`} data={`DevOps #${r.id}`} texto={r.title ?? '—'} badge={r.state ?? ''} badgeCor="#3b82f6" />
            ))}
          </OcorrenciaCol>

          {/* Não conformidades */}
          <OcorrenciaCol
            icon={FileWarning} cor="#8b5cf6" titulo="Não conformidades"
            dias={sgsi?.diasSem.naoConformidades} nRecentes={ncRecentes.length}
            vazio="Sem NC em 30d"
          >
            {ncRecentes.slice(0, 3).map((n) => (
              <RecenteRow key={n.id} data={fmtDia(n.criado)} texto={n.detalhes || n.processo} badge={n.status} />
            ))}
          </OcorrenciaCol>

          {/* Atualizações malsucedidas */}
          <OcorrenciaCol
            icon={RefreshCw} cor="#3b82f6" titulo="Atualização malsucedida"
            dias={sgsi?.diasSem.attMalSucedidas} nRecentes={attMalSucedidas}
            vazio="Nenhuma malsucedida"
          >
            {attMalSucedidas > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {attMalSucedidas} mudança{attMalSucedidas > 1 ? 's' : ''} com atualização não bem-sucedida — ver aba Gestão SG · Mudanças.
              </p>
            )}
          </OcorrenciaCol>
        </div>
      </BlocoCard>
    </div>
  );
}

// ── Subcomponentes da linha "dias sem ocorrências" ───────────────────────
function OcorrenciaCol({ icon: Icon, cor, titulo, dias, nRecentes, vazio, children }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  cor: string; titulo: string; dias?: number | null; nRecentes: number; vazio: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="p-1 rounded-md" style={{ background: `${cor}18` }}>
          <Icon className="h-3.5 w-3.5" style={{ color: cor }} />
        </div>
        <span className="text-[11px] font-medium text-muted-foreground">{titulo}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold font-mono" style={{ color: cor }}>{dias ?? '—'}</span>
        <span className="text-[10px] text-muted-foreground">dias sem</span>
      </div>
      <div className="space-y-1.5 border-t pt-2">
        {nRecentes === 0 ? (
          <p className="text-[11px] text-muted-foreground">{vazio}</p>
        ) : children}
      </div>
    </div>
  );
}

function RecenteRow({ data, texto, badge, badgeCor = '#64748b' }: {
  data: string; texto: string; badge?: string; badgeCor?: string;
}) {
  return (
    <div className="flex items-start gap-1.5 text-[11px]">
      <span className="font-mono text-muted-foreground shrink-0">{data}</span>
      <span className="text-foreground truncate flex-1 min-w-0" title={texto}>{texto}</span>
      {badge && (
        <span className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium" style={{ background: `${badgeCor}20`, color: badgeCor }}>
          {badge}
        </span>
      )}
    </div>
  );
}
