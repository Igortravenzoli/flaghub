import { useMemo, useState, type ReactNode } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LabelList, Tooltip as RTooltip,
} from 'recharts';
import {
  Server, GitBranch, ShieldCheck, Wrench, CalendarClock, Workflow, Activity,
  CheckCircle2, ChevronDown, ChevronRight, RefreshCw, Eye, Trophy,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BlocoCard, corMetaHigh } from '@/components/executivo/BlocoCard';
import { useDevopsRepos, computeCoberturaKpis, countPipelinesNovasTrimestre } from '@/hooks/useDevopsCobertura';
import { useBIInfraSgsi, type SgIncidenteItem, type SgRiscoItem, type SgMudancaItem } from '@/hooks/useBIInfra';

// Metas (espelham as constantes do DevopsCoberturaPanel)
const META_PIPELINES_TRIMESTRE = 3;
const META_COBERTURA_PCT = 80;
// 21/08 (pedido do Igor): no TV a meta do trimestre passou a contar PROJETOS
// automatizados (um projeto rende várias pipelines — o Decision rendeu 5 de
// uma vez); pipelines novas vira contador informativo, sem teto. A mesa segue
// na meta antiga de pipelines até a régua oficial mudar lá também.
const META_PROJETOS_TRIMESTRE = 3;

// Modo TV (ajuste aprovado 20/08, revisto no mesmo dia): sem popover (o texto
// aparece por extenso em até 2 linhas), e a lista de ocorrências mantém a
// barra de rolagem — pedido do Igor; o corte fixo com rodapé "+N" foi testado
// e descartado.

// Alvos do trimestre (planejamento) — os repositórios efetivamente atuados
// aparecem ao lado, derivados das pipelines criadas no trimestre.
const TV_PIPELINE_ALVOS = [
  { nome: 'Broker 3', status: 'Não iniciado' },
  { nome: 'CargaImagens', status: null },
  // Serviço Vdesk = as 2 pipelines do Flag.Vdesk.Integracao (Gerenciador-Task).
  { nome: 'Serviço Vdesk DevOps', status: 'Concluído' },
  // 21/08 (pedido do Igor): projeto automatizado em 13–19/08 — 5 pipelines
  // (api-novodecision, -in, -out, Migrations, FrontEnd), todas com release.
  { nome: 'Flag.Decision', status: 'Concluído' },
];

interface DoneBySprint { sprintCode: string; done: number; total: number }

/** Item de work item DevOps com a tag #Risco (combina com o SG-LST-012). */
interface RiscoDevopsItem { id: number | null; title: string | null; state: string | null; created_date?: string | null }

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
  /** Modo TV (kiosk): layout aprovado em tela cheia — pipelines · incidentes|riscos · mudanças da sprint. */
  tvMode?: boolean;
}

// ── Helpers de data ──────────────────────────────────────────────────────
function toDate(iso?: string | null): Date | null {
  if (!iso) return null;
  // dd/mm/aaaa SEMPRE tem prioridade: o parser nativo lê "12/03/2026" como
  // formato americano (3 de dezembro!) — os campos do SG são texto livre pt-BR
  // (ex.: "25/06/2026 as 17:00", "Dia: 09/10/2023 - 06h27").
  const m = iso.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) {
    const livre = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (!Number.isNaN(livre.getTime())) return livre;
  }
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
  // Escopo da sprint/período selecionado — usado APENAS na amostra de Mudanças.
  const { data: sgsi } = useBIInfraSgsi(dateFrom, dateTo);
  // Base completa — incidentes/riscos são "últimos 30 dias" e independem do
  // filtro de sprint (senão o TV/executiva fica vazio quando a ocorrência caiu
  // na sprint anterior).
  const { data: sgsiBase } = useBIInfraSgsi();

  const cobertura = useMemo(() => computeCoberturaKpis(repos, 0), [repos]);
  const pipelinesTri = useMemo(() => countPipelinesNovasTrimestre(repos), [repos]);
  // "Feito no trimestre": só os repositórios atuados (sem nome de pipeline), únicos.
  const reposAtuados = useMemo(() => [...new Set(pipelinesTri.criadas.map((c) => c.repo))], [pipelinesTri]);
  // TV (pedido 21/08): agrupado por PROJETO DevOps — o telão fala no nível do
  // gestor ("Flag.Decision automatizado"), com os repos como detalhe e o par
  // Projetos × Pipelines equiparado no KPI. `repos` únicos porque um repo pode
  // ganhar 2+ pipelines no trimestre.
  const projetosAtuados = useMemo(() => {
    const porProjeto = new Map<string, { projeto: string; pipelines: number; repos: string[] }>();
    for (const c of pipelinesTri.criadas) {
      const g = porProjeto.get(c.projeto) ?? { projeto: c.projeto, pipelines: 0, repos: [] };
      g.pipelines += 1;
      if (!g.repos.includes(c.repo)) g.repos.push(c.repo);
      porProjeto.set(c.projeto, g);
    }
    return [...porProjeto.values()].sort((a, b) => b.pipelines - a.pipelines);
  }, [pipelinesTri]);
  // Semáforo da meta nova do TV: projetos automatizados vs META_PROJETOS_TRIMESTRE.
  const corProjetos = projetosAtuados.length >= META_PROJETOS_TRIMESTRE ? '#16a34a'
    : projetosAtuados.length > 0 ? '#f59e0b' : '#ef4444';

  const conclPct = kpis.total > 0 ? Math.round((kpis.concluidos / kpis.total) * 100) : 0;
  const coberturaPct = cobertura.coberturaPct ?? 0;
  const pipelinesNovas = pipelinesTri.criadas.length;
  const corPipelines = pipelinesNovas >= META_PIPELINES_TRIMESTRE ? '#16a34a' : pipelinesNovas > 0 ? '#f59e0b' : '#ef4444';

  const ultimasSprints = useMemo(() => kpis.doneBySprint.slice(-3), [kpis.doneBySprint]);

  // ── Ocorrências recentes (SG-LST) e riscos combinados (SG + DevOps #Risco) ──
  // Ordenação por data PARSEADA (toDate): "inicio" mistura ISO e texto livre
  // ("Dia: 09/10/2023 - 06h27") — comparação de string colocaria 2023 na frente.
  // Datas futuras (erro de digitação no forms) não disputam o "último".
  const tsInicio = (i: SgIncidenteItem) => {
    const t = toDate(i.inicio)?.getTime() ?? 0;
    return t > Date.now() + 86400000 ? 0 : t;
  };
  const incidentesRecentes: SgIncidenteItem[] = useMemo(
    () => (sgsiBase?.incidentes.itens ?? []).filter((i) => within30d(i.inicio)).sort((a, b) => tsInicio(b) - tsInicio(a)),
     
    [sgsiBase],
  );
  const riscosSg: SgRiscoItem[] = useMemo(
    () => (sgsiBase?.riscos.itens ?? []).filter((r) => !/tratad|encerr|conclu|finaliz|rejeitad/i.test(r.status)),
    [sgsiBase],
  );
  const riscosDevops: RiscoDevopsItem[] = useMemo(() => kpis.riscoItens ?? [], [kpis.riscoItens]);
  const riscosCombinados = riscosSg.length + riscosDevops.length;
  // "Dias sem riscos novos" pondera o registro mais recente das DUAS fontes:
  // formulário SG (created_sp, via diasSem) e tasks #Risco do DevOps (created_date).
  const diasSemRiscos = useMemo(() => {
    const tsDevops = riscosDevops
      .map((r) => toDate(r.created_date ?? null)?.getTime())
      .filter((n): n is number => n != null);
    const devopsDias = tsDevops.length > 0
      ? Math.max(0, Math.floor((Date.now() - Math.max(...tsDevops)) / 86400000))
      : null;
    const sgDias = sgsiBase?.diasSem.riscos ?? null;
    if (sgDias == null) return devopsDias;
    if (devopsDias == null) return sgDias;
    return Math.min(sgDias, devopsDias);
  }, [riscosDevops, sgsiBase]);

  // ── Layout aprovado (mock 17/07): Incidentes | Riscos + Mudanças da sprint ──
  const incPctExec = sgsiBase?.incidentes.pctDentroSla ?? null;
  // Fração por trás do % ("por que 98 e não 100?"): Sim/Não do histórico todo;
  // vazios e "Não se aplica" ficam fora da conta (mesma regra do hook).
  const slaCounts = useMemo(() => {
    const itens = sgsiBase?.incidentes.itens ?? [];
    const norm = (s: string) => s.trim().toLowerCase();
    return {
      sim: itens.filter((i) => norm(i.sla) === 'sim').length,
      nao: itens.filter((i) => ['não', 'nao'].includes(norm(i.sla))).length,
    };
  }, [sgsiBase]);
  const risco30Exec = sgsiBase?.riscos.pctResolvido30d ?? null;
  const corSlaExec = (p: number | null) => (p == null ? undefined : p > 90 ? '#16a34a' : p >= 80 ? '#f59e0b' : '#ef4444');
  const ultimoIncidente: SgIncidenteItem | undefined = useMemo(
    () => [...(sgsiBase?.incidentes.itens ?? [])].sort((a, b) => tsInicio(b) - tsInicio(a))[0],
     
    [sgsiBase],
  );
  const mudStats = useMemo(() => {
    const itens = sgsi?.mudancas.itens ?? [];
    const isConcl = (s: string) => /realizado|conclu/i.test(s);
    const isRej = (s: string) => /rejeitad/i.test(s);
    const byCriado = (a: SgMudancaItem, b: SgMudancaItem) =>
      (b.criado || b.modificado || '').localeCompare(a.criado || a.modificado || '');
    return {
      total: itens.length,
      concluidas: itens.filter((i) => isConcl(i.status)).sort(byCriado),
      pendentes: itens.filter((i) => !isConcl(i.status) && !isRej(i.status)).sort(byCriado),
      rejeitadas: itens.filter((i) => isRej(i.status)).length,
    };
  }, [sgsi]);
  const mudAmostra = useMemo(
    () => [...mudStats.concluidas.slice(0, 6), ...mudStats.pendentes.slice(0, 2)],
    [mudStats],
  );
  const corStatusMud = (s: string) =>
    /realizado|conclu/i.test(s) ? '#10b981' : /rejeitad/i.test(s) ? '#ef4444' : /gestor/i.test(s) ? '#8b5cf6' : '#f59e0b';
  const corRiscoMud = (r: string) => (/alto/i.test(r) ? '#ef4444' : /m[eé]dio/i.test(r) ? '#f59e0b' : '#64748b');

  // ── Cards do layout aprovado (17/07) — KPIs empilhados à esquerda, lista na
  // lateral direita (pedido do gestor: KPIs ocupavam a tela e a lista sumia). ──
  // No TV o rótulo QUEBRA em vez de truncar (o "meta > 90%" virava "met…" no
  // telão) e o chip é flex-none — os 3 KPIs são o resumo, nunca podem sumir.
  const KpiLinha = ({ label, valor, cor, tv }: { label: string; valor: ReactNode; cor?: string; tv?: boolean }) => (
    <div className={`flex items-baseline justify-between gap-2 rounded-md border bg-muted/20 px-2 py-1 ${tv ? 'flex-none' : ''}`}>
      <span className={`text-[10px] text-muted-foreground ${tv ? 'leading-tight' : 'truncate'}`} title={label}>{label}</span>
      <span className="text-sm font-bold font-mono shrink-0" style={cor ? { color: cor } : undefined}>{valor}</span>
    </div>
  );

  const cardIncidentes = (tv: boolean) => {
    return (
    // Sem min-h-0 no card/miolo do TV: o mínimo passa a ser o rail de KPIs
    // (que nunca clipa); quem cede altura é só a lista (min-h-0 interno).
    <BlocoCard icon={Activity} titulo="Gestão de Incidentes" className={tv ? 'flex-1 overflow-hidden' : undefined}>
      <div className="flex items-stretch gap-4 flex-1">
        {/* Esquerda: KPIs empilhados na vertical */}
        <div className={`${tv ? 'w-[210px]' : 'w-[200px]'} shrink-0 flex flex-col gap-1.5`}>
          <div className="mb-0.5">
            {tv ? (
              <DiasComRecorde dias={sgsiBase?.diasSem.incidentes ?? null} cor={corSlaExec(incPctExec)}
                label="dias sem incidentes" recorde={sgsiBase?.diasSem.maiorIntervaloIncidentes ?? null} />
            ) : (
              <>
                <p className="text-4xl font-bold font-mono leading-none" style={{ color: corSlaExec(incPctExec) }}>
                  {sgsiBase?.diasSem.incidentes ?? '—'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">dias sem incidentes</p>
              </>
            )}
            {ultimoIncidente && (
              <p className="text-[10px] text-muted-foreground/80 truncate" title={ultimoIncidente.titulo}>
                último: {fmtDia(ultimoIncidente.inicio)} · {ultimoIncidente.titulo}
              </p>
            )}
          </div>
          <KpiLinha tv={tv} label={`dentro do SLA · ${slaCounts.sim}/${slaCounts.sim + slaCounts.nao} hist. · meta > 90%`} valor={incPctExec != null ? `${incPctExec}%` : '—'} cor={corSlaExec(incPctExec)} />
          <KpiLinha tv={tv} label="últimos 30 dias" valor={incidentesRecentes.length} />
          <KpiLinha tv={tv} label="ativos agora" valor={sgsiBase?.incidentes.ativos ?? '—'} />
        </div>
        {/* Direita: listagem de incidentes com causa/solução (TV: altura toda, com scroll) */}
        <div className="flex-1 min-w-0 min-h-0 border-l pl-4 flex flex-col gap-2 overflow-hidden">
          <p className="flex-none text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Ocorrências recentes · incidente / solução</p>
          {incidentesRecentes.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Sem incidentes nos últimos 30 dias.</p>
          ) : (
            <div className={`space-y-2 pr-1 overflow-y-auto ${tv ? 'flex-1 min-h-0' : 'max-h-56'}`}>
              {incidentesRecentes.map((i) => {
                const ok = /sim|dentro/i.test(i.sla);
                // Causa: "Descrição incidente" quando preenchida; senão o "Motivo incidente".
                const causa = i.descricao !== '—' && i.descricao !== i.titulo
                  ? i.descricao
                  : i.motivo !== '—' ? `Causa: ${i.motivo}` : undefined;
                // Título + produto afetado (quando distintos): "Broker · ConnectMerchan".
                const rotulo = i.produto !== '—' && i.produto !== i.titulo
                  ? `${i.titulo} · ${i.produto}`
                  : i.titulo;
                return (
                  <RecenteRow key={i.id} tv={tv} data={fmtDia(i.inicio)} texto={rotulo}
                    detalhe={causa}
                    solucao={i.solucao !== '—' ? i.solucao : undefined}
                    badge={ok ? 'dentro do SLA' : 'fora do SLA'} badgeCor={ok ? '#16a34a' : '#ef4444'} />
                );
              })}
            </div>
          )}
        </div>
      </div>
      {!tv && <p className="text-[10px] text-muted-foreground/70 border-t pt-1.5">SG-LST-017 · análise e tratamento de incidentes</p>}
    </BlocoCard>
    );
  };

  const cardRiscos = (tv: boolean) => {
    return (
    <BlocoCard icon={ShieldCheck} titulo="Gestão de Riscos" className={tv ? 'flex-1 overflow-hidden' : undefined}>
      <div className="flex items-stretch gap-4 flex-1">
        {/* Esquerda: KPIs empilhados na vertical */}
        <div className={`${tv ? 'w-[210px]' : 'w-[200px]'} shrink-0 flex flex-col gap-1.5`}>
          <div className="mb-0.5">
            {tv ? (
              <DiasComRecorde dias={diasSemRiscos ?? null} cor={corSlaExec(risco30Exec)}
                label="dias sem riscos novos" recorde={sgsiBase?.diasSem.maiorIntervaloRiscos ?? null} />
            ) : (
              <>
                <p className="text-4xl font-bold font-mono leading-none" style={{ color: corSlaExec(risco30Exec) }}>
                  {diasSemRiscos ?? '—'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">dias sem riscos novos</p>
              </>
            )}
          </div>
          <KpiLinha tv={tv} label="resolvidos ≤ 30d · meta > 90%" valor={risco30Exec != null ? `${risco30Exec}%` : '—'} cor={corSlaExec(risco30Exec)} />
          <KpiLinha tv={tv} label={`em aberto · ${riscosSg.length} SG + ${riscosDevops.length} DevOps`} valor={riscosCombinados} cor={riscosCombinados > 0 ? '#f59e0b' : undefined} />
          <KpiLinha tv={tv} label="riscos mapeados" valor={sgsiBase?.riscos.total ?? '—'} />
        </div>
        {/* Direita: listagem de riscos com solução (TV: altura toda, com scroll) */}
        <div className="flex-1 min-w-0 min-h-0 border-l pl-4 flex flex-col gap-2 overflow-hidden">
          <p className="flex-none text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Riscos · situação / solução</p>
          {riscosCombinados === 0 ? (
            <p className="text-[11px] text-muted-foreground">Sem riscos em aberto.</p>
          ) : (
            <div className={`space-y-2 pr-1 overflow-y-auto ${tv ? 'flex-1 min-h-0' : 'max-h-56'}`}>
              {riscosSg.map((r) => (
                <RecenteRow key={`sg-${r.id}`} tv={tv} data={`SG #${r.id}`} texto={r.descricao}
                  solucao={r.solucao !== '—' ? r.solucao : undefined} badge={r.status} />
              ))}
              {riscosDevops.map((r) => (
                <RecenteRow key={`do-${r.id}`} tv={tv} data={`DevOps #${r.id}`} texto={r.title ?? '—'} badge={r.state ?? ''} badgeCor="#3b82f6" />
              ))}
            </div>
          )}
        </div>
      </div>
      {!tv && <p className="text-[10px] text-muted-foreground/70 border-t pt-1.5">SG-LST-012 · análise de riscos + board DevOps (tag #Risco)</p>}
    </BlocoCard>
    );
  };

  const cardMudancas = (tv: boolean) => {
    // No TV o bloco é vertical (coluna direita inteira) — cabem mais linhas.
    const amostra = tv ? [...mudStats.concluidas.slice(0, 8), ...mudStats.pendentes.slice(0, 2)] : mudAmostra;
    return (
      <BlocoCard icon={RefreshCw} titulo={`Gestão de Mudanças · ${periodLabel ?? 'período selecionado'}`} className={tv ? 'h-full min-h-0 overflow-hidden' : undefined}>
        {tv ? (
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className="text-sm text-muted-foreground">Solicitações <b className="font-mono text-lg text-foreground">{mudStats.total}</b></span>
            <span className="text-sm text-muted-foreground">Concluídas <b className="font-mono text-lg text-[hsl(142,71%,45%)]">{mudStats.concluidas.length}</b> <span className="text-xs">({mudStats.total > 0 ? Math.round((mudStats.concluidas.length / mudStats.total) * 100) : 0}%)</span></span>
            <span className="text-sm text-muted-foreground">Pendentes <b className="font-mono text-lg text-amber-500">{mudStats.pendentes.length}</b></span>
            <span className="text-sm text-muted-foreground">Rejeitadas <b className="font-mono text-lg text-red-500">{mudStats.rejeitadas}</b></span>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="rounded-lg border bg-muted/20 px-3 py-1.5">
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Solicitações</p>
              <p className="text-2xl font-bold font-mono">{mudStats.total}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 px-3 py-1.5">
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Concluídas</p>
              <p className="text-2xl font-bold font-mono text-[hsl(142,71%,45%)]">
                {mudStats.concluidas.length}
                <span className="text-sm text-muted-foreground"> · {mudStats.total > 0 ? Math.round((mudStats.concluidas.length / mudStats.total) * 100) : 0}%</span>
              </p>
            </div>
            <div className="rounded-lg border bg-muted/20 px-3 py-1.5">
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Pendentes</p>
              <p className="text-2xl font-bold font-mono text-amber-500">{mudStats.pendentes.length}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 px-3 py-1.5">
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Rejeitadas</p>
              <p className="text-2xl font-bold font-mono text-red-500">{mudStats.rejeitadas}</p>
            </div>
          </div>
        )}

        {amostra.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3 text-center">Nenhuma mudança no período selecionado.</p>
        ) : (
          <div className={`overflow-x-auto rounded-lg border ${tv ? 'flex-1 min-h-0 overflow-y-hidden' : ''}`}>
            <table className="w-full text-xs">
              <thead className="border-b bg-muted/30">
                <tr className="text-muted-foreground text-[10px] uppercase tracking-wider">
                  <th className="py-1.5 px-3 text-left font-medium">Data</th>
                  <th className="py-1.5 px-3 text-left font-medium">OS / Chamado</th>
                  <th className="py-1.5 px-3 text-left font-medium">Ambiente</th>
                  <th className="py-1.5 px-3 text-left font-medium">Mudança (resumo)</th>
                  {!tv && <th className="py-1.5 px-3 text-left font-medium">Risco</th>}
                  <th className="py-1.5 px-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {amostra.map((m) => (
                  <tr key={m.id} className="border-b last:border-b-0">
                    <td className="py-1.5 px-3 font-mono text-muted-foreground whitespace-nowrap">{fmtDia(m.criado || m.modificado)}</td>
                    <td className="py-1.5 px-3 font-mono font-semibold text-primary whitespace-nowrap">{m.chamado}</td>
                    <td className="py-1.5 px-3 whitespace-nowrap">{m.ambiente}</td>
                    <td className={`py-1.5 px-3 truncate ${tv ? 'max-w-[200px]' : 'max-w-[320px]'}`} title={m.motivo}>{m.motivo !== '—' ? m.motivo : m.tipoMudanca}</td>
                    {!tv && (
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: `${corRiscoMud(m.risco)}20`, color: corRiscoMud(m.risco) }}>{m.risco}</span>
                      </td>
                    )}
                    <td className="py-1.5 px-3 whitespace-nowrap">
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: `${corStatusMud(m.status)}20`, color: corStatusMud(m.status) }}>{m.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!tv && (
          <p className="text-[10px] text-muted-foreground/70 border-t pt-1.5">
            Amostra resumida ({Math.min(6, mudStats.concluidas.length)} concluídas mais recentes{mudStats.pendentes.length > 0 ? ` + ${Math.min(2, mudStats.pendentes.length)} pendente${Math.min(2, mudStats.pendentes.length) > 1 ? 's' : ''}` : ''}) — detalhe completo na aba Gestão SG · Mudanças.
          </p>
        )}
      </BlocoCard>
    );
  };

  // ── Modo TV: layout aprovado em tela cheia — pipelines · incidentes|riscos · mudanças ──
  if (tvMode) {
    return (
      <div className="h-full min-h-0 flex flex-col gap-2.5 overflow-hidden">
        <div className="flex-none flex items-baseline gap-3">
          <h2 className="text-lg font-bold">Visão Executiva</h2>
          <p className="text-sm text-muted-foreground">Infraestrutura {periodLabel ? `· ${periodLabel}` : ''}</p>
        </div>

        {/* Meta pipelines em 3 blocos (pedido 21/08): automatizados/pipelines ·
            Projetos · status (alvos) · Pipelines por projeto. A META agora é de
            PROJETOS (X/3, semáforo e barra); pipelines novas é contador sem teto. */}
        <BlocoCard icon={GitBranch} titulo={`Meta · Pipelines ${pipelinesTri.trimestre}`} className="flex-none">
          <div className="flex items-stretch gap-5">
            {/* 1 · Automatizados × pipelines */}
            <div className="w-[270px] flex-shrink-0 space-y-1.5">
              <div>
                <div className="flex items-end gap-4">
                  <div>
                    <p className="text-4xl font-bold font-mono leading-none" style={{ color: corProjetos }}>
                      {reposLoading ? '—' : projetosAtuados.length}
                      <span className="text-lg text-muted-foreground"> / {META_PROJETOS_TRIMESTRE}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">projetos automatizados</p>
                  </div>
                  <div className="border-l pl-4">
                    <p className="text-4xl font-bold font-mono leading-none">
                      {reposLoading ? '—' : pipelinesNovas}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">pipelines novas</p>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min((projetosAtuados.length / META_PROJETOS_TRIMESTRE) * 100, 100)}%`, backgroundColor: corProjetos }} />
                </div>
              </div>
              <div className="flex items-end justify-between border-t pt-1">
                <span className="text-xs text-muted-foreground">cobertura CI/CD · meta {META_COBERTURA_PCT}%</span>
                <span className="text-base font-bold font-mono" style={{ color: corMetaHigh(coberturaPct) }}>{reposLoading ? '—' : `${coberturaPct}%`}</span>
              </div>
            </div>

            {/* 2 · Projetos · status (alvos do planejamento) */}
            <div className="flex-shrink-0 border-l pl-5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Projetos · status</p>
              <div className="flex flex-col gap-1.5">
                {TV_PIPELINE_ALVOS.map((a) => (
                  <span key={a.nome} className="inline-flex items-center justify-between gap-1.5 rounded-lg border bg-muted/30 px-2.5 py-1 text-xs">
                    <span className="font-semibold text-foreground">{a.nome}</span>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium rounded px-1 py-0.5 ${
                      a.status === 'Concluído' ? 'text-emerald-500 bg-emerald-500/10'
                        : a.status ? 'text-amber-500 bg-amber-500/10'
                        : 'text-sky-400 bg-sky-500/10'
                    }`}>
                      {a.status === 'Concluído' && <CheckCircle2 className="h-3 w-3" />}
                      {a.status ?? 'Em andamento'}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            {/* 3 · Pipelines por projeto (feito no trimestre — sem teto, rola se crescer) */}
            <div className="flex-1 min-w-0 border-l pl-5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pipelines por projeto · feito no trimestre</p>
              {projetosAtuados.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma pipeline criada no trimestre.</p>
              ) : (
                <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                  {projetosAtuados.map((p) => (
                    <div key={p.projeto} className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1.5 rounded-lg border bg-muted/30 px-2.5 py-1 text-xs">
                        <GitBranch className="h-3 w-3 text-[hsl(142,71%,45%)]" />
                        <span className="font-semibold text-foreground">{p.projeto}</span>
                        <span className="rounded bg-emerald-500/10 px-1 py-0.5 text-[10px] font-medium text-emerald-500">
                          {p.pipelines} pipeline{p.pipelines > 1 ? 's' : ''}
                        </span>
                      </span>
                      {p.repos.map((repo) => (
                        <span key={repo} className="inline-flex items-center rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                          {repo}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </BlocoCard>

        {/* Esquerda: Incidentes sobre Riscos · Direita: Mudanças vertical (mais linhas) */}
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-2.5 min-h-0">
            {cardIncidentes(true)}
            {cardRiscos(true)}
          </div>
          {cardMudancas(true)}
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
          {reposAtuados.length > 0 ? (
            <div className="border-t pt-2 space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">Feito no trimestre · repositórios atuados ({pipelinesNovas}/{META_PIPELINES_TRIMESTRE}):</p>
              <ul className="space-y-0.5">
                {reposAtuados.slice(0, 4).map((repo) => (
                  <li key={repo} className="flex items-center gap-1.5 text-[11px]">
                    <GitBranch className="h-3 w-3 text-[hsl(142,71%,45%)] flex-shrink-0" />
                    <span className="font-medium text-foreground truncate">{repo}</span>
                  </li>
                ))}
                {reposAtuados.length > 4 && (
                  <li className="text-[11px] text-muted-foreground">+{reposAtuados.length - 4} outros</li>
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

      {/* ── Linha 2: de onde viemos · iniciativas ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

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

      {/* ── Linha 3: Gestão de Incidentes | Gestão de Riscos (layout aprovado 17/07) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cardIncidentes(false)}
        {cardRiscos(false)}
      </div>

      {/* ── Linha 4: Gestão de Mudanças · sprint corrente (layout aprovado 17/07) ── */}
      {cardMudancas(false)}
    </div>
  );
}

// ── Linha truncada com "olhinho": …texto + Eye → texto completo. Hover mostra
// o title nativo (funciona em qualquer lugar); clique abre popover estilizado
// (o tooltip Radix falhava dentro do canvas escalado do kiosk). ──────────────
function LinhaOlho({ children, completo }: { children: ReactNode; completo: string }) {
  return (
    <div className="flex items-center gap-1 min-w-0">
      <p className="text-[11px] text-muted-foreground truncate min-w-0 flex-1">{children}</p>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" title={completo} aria-label="Ver texto completo" className="shrink-0 cursor-pointer text-muted-foreground/50 hover:text-foreground transition-colors">
            <Eye className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="w-auto max-w-md whitespace-pre-wrap p-3 text-xs leading-snug">
          {completo}
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ── Linha de ocorrência recente (incidentes/riscos) ──────────────────────
// `tv`: telão sem popover (tooltip nunca é a única fonte). Desde 21/08 (pedido
// do Igor) o item é ABREVIADO em 2 linhas — título + "causa · solução" numa
// linha truncada — para caberem mais ocorrências; clique expande o item por
// extenso (chevron indica). Fora do TV mantém truncate + olhinho.

// Título acima disto tende a truncar na coluna do TV (riscos têm descrições
// longas e badges compridas — "Plano de Tratamento Definido" come ~150px) →
// o item vira expansível mesmo sem causa/solução, e o expandir solta o título
// em várias linhas. Medido no canvas: SG #142 com 47 chars já cortava.
const TV_TEXTO_LONGO = 40;

function RecenteRow({ data, texto, badge, badgeCor = '#64748b', detalhe, solucao, tv }: {
  data: string; texto: string; badge?: string; badgeCor?: string;
  /** Texto do incidente/risco (linha secundária, truncada + olhinho). */
  detalhe?: string;
  /** Solução aplicada/plano de ação (linha verde, truncada + olhinho). */
  solucao?: string;
  tv?: boolean;
}) {
  const [expandido, setExpandido] = useState(false);
  const expansivel = !!tv && (!!detalhe || !!solucao || texto.length > TV_TEXTO_LONGO);
  const Chevron = expandido ? ChevronDown : ChevronRight;

  const linha1 = (
    <div className="flex items-start gap-1.5 text-[11px]">
      {tv && (expansivel
        ? <Chevron className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground/60" aria-hidden />
        : <span className="w-3 shrink-0" aria-hidden />
      )}
      <span className="font-mono text-muted-foreground shrink-0">{data}</span>
      <span
        className={`text-foreground flex-1 min-w-0 font-medium ${tv && expandido ? 'whitespace-normal break-words' : 'truncate'}`}
        title={texto}
      >
        {texto}
      </span>
      {badge && (
        <span className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium" style={{ background: `${badgeCor}20`, color: badgeCor }}>
          {badge}
        </span>
      )}
    </div>
  );

  if (tv) {
    return (
      <div
        className={`space-y-0.5 ${expansivel ? 'cursor-pointer' : ''}`}
        role={expansivel ? 'button' : undefined}
        tabIndex={expansivel ? 0 : undefined}
        aria-expanded={expansivel ? expandido : undefined}
        title={expansivel ? (expandido ? 'Recolher' : 'Expandir causa e solução') : undefined}
        onClick={expansivel ? () => setExpandido((e) => !e) : undefined}
        onKeyDown={expansivel ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandido((x) => !x); } } : undefined}
      >
        {linha1}
        {expandido ? (
          <div className="pl-[18px] space-y-0.5">
            {detalhe && <p className="text-[11px] leading-snug text-muted-foreground">{detalhe}</p>}
            {solucao && (
              <p className="text-[11px] leading-snug text-muted-foreground">
                <span className="font-medium text-[hsl(142,71%,45%)]">Solução:</span> {solucao}
              </p>
            )}
          </div>
        ) : (detalhe || solucao) && (
          <p className="pl-[18px] text-[11px] leading-snug text-muted-foreground truncate">
            {detalhe}
            {detalhe && solucao ? ' · ' : ''}
            {solucao && (
              <>
                <span className="font-medium text-[hsl(142,71%,45%)]">Solução:</span> {solucao}
              </>
            )}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {linha1}
      {detalhe && <LinhaOlho completo={detalhe}>{detalhe}</LinhaOlho>}
      {solucao && (
        <LinhaOlho completo={`Solução: ${solucao}`}>
          <span className="font-medium text-[hsl(142,71%,45%)]">Solução:</span> {solucao}
        </LinhaOlho>
      )}
    </div>
  );
}

// ── Contador "dias sem X" com recorde lado a lado (modo TV — aprovado 20/08) ──
// À esquerda a sequência atual; à direita o maior intervalo histórico entre
// registros (inclui o intervalo em curso). Quando a sequência atual EMPATA com
// o recorde, ela É o recorde — o número vira verde com o selo "recorde atual".
function DiasComRecorde({ dias, cor, label, recorde }: {
  dias: number | null; cor?: string; label: string; recorde: number | null;
}) {
  const recordeAtual = recorde != null && dias != null && dias >= recorde;
  return (
    <div className="flex items-end gap-3">
      <div>
        <p className="text-4xl font-bold font-mono leading-none" style={cor ? { color: cor } : undefined}>
          {dias ?? '—'}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
      </div>
      {recorde != null && (
        <div className="border-l pl-3">
          <p className="flex items-center gap-1 text-xl font-bold font-mono leading-none"
            style={{ color: recordeAtual ? 'hsl(142,71%,45%)' : 'hsl(var(--primary))' }}>
            <Trophy className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {recorde}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
            {recordeAtual ? 'recorde atual' : 'maior intervalo'}
          </p>
        </div>
      )}
    </div>
  );
}
