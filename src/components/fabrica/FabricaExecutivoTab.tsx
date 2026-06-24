import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip,
} from 'recharts';
import { Zap, Gauge, Timer, Shuffle, RotateCcw, HeartPulse, Target, CalendarClock, Activity } from 'lucide-react';
import { BlocoCard, MetaCard, SecHeader } from '@/components/executivo/BlocoCard';
import { useGerencialFabrica } from '@/hooks/useGerencialFabrica';

// Metas desejadas (TO BE) — placeholders configuráveis; alinhar com a gestão (Henrique).
const META_CONCLUSAO_PCT = 90;   // % do escopo concluído ao fim da sprint
const META_SAUDAVEL_PCT = 85;    // % de itens saudáveis
const META_TRANSBORDO_PCT = 10;  // teto de transbordo (quanto menor melhor)

interface FabKpisLite {
  total: number;
  done: number;
  inProgress: number;
  toDo: number;
  velocidadeMedia: number | null;
  velocidadeSource?: string | null;
  leadTimeMedio: number | null;
  leadTimeSource?: string | null;
  transbordoPct: number | null;
  transbordoCount: number;
  realOverflowCount: number;
  isLoading: boolean;
}

interface FabricaExecutivoTabProps {
  fab: FabKpisLite;
  selectedSprintCode?: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  periodLabel?: string;
}

function toIso(d?: Date | null): string | undefined {
  return d ? d.toISOString().slice(0, 10) : undefined;
}

function sprintNum(code: string): number {
  return Number(code.replace(/[^0-9]/g, '').match(/^\d+/)?.[0] ?? code.replace(/^S/i, '').split('-')[0]) || 0;
}

export function FabricaExecutivoTab({ fab, selectedSprintCode, dateFrom, dateTo, periodLabel }: FabricaExecutivoTabProps) {
  // Escopo selecionado (AS IS / TO BE)
  const { data: gerencial = [] } = useGerencialFabrica(selectedSprintCode || undefined, toIso(dateFrom), toIso(dateTo));
  // Série histórica completa (De onde viemos) — independe do filtro de sprint
  const { data: historicoRaw = [] } = useGerencialFabrica();

  const agg = useMemo(() => {
    const qaReturn = gerencial.reduce((s, r) => s + (r.qa_return_total || 0), 0);
    const criticos = gerencial.reduce((s, r) => s + (r.itens_criticos || 0), 0);
    const atencao = gerencial.reduce((s, r) => s + (r.itens_atencao || 0), 0);
    const saudaveis = gerencial.reduce((s, r) => s + (r.itens_saudaveis || 0), 0);
    const gargaloRow = [...gerencial].sort((a, b) => (b.gargalo_avg_days || 0) - (a.gargalo_avg_days || 0))[0];
    return {
      qaReturn, criticos, atencao, saudaveis,
      totalHealth: criticos + atencao + saudaveis,
      gargalo: gargaloRow?.gargalo_principal ?? null,
      gargaloDias: gargaloRow?.gargalo_avg_days ?? null,
    };
  }, [gerencial]);

  const conclPct = fab.total > 0 ? Math.round((fab.done / fab.total) * 100) : 0;
  const saudavelPct = agg.totalHealth > 0 ? Math.round((agg.saudaveis / agg.totalHealth) * 100) : 0;
  const transbordoPct = fab.transbordoPct ?? 0;
  const num = (v: number | null) => (v == null ? '—' : v);

  // Apenas sprints do ANO VIGENTE — o RPC retorna também 2024/2025 (ex.: S33-2025).
  const anoVigente = new Date().getFullYear();
  const evolucao = useMemo(() => {
    const reAno = new RegExp(`^S\\d+-${anoVigente}$`);
    return [...historicoRaw]
      .filter(r => reAno.test(r.sprint_code))
      .sort((a, b) => sprintNum(a.sprint_code) - sprintNum(b.sprint_code))
      .slice(-8)
      .map(r => ({
        sprint: r.sprint_code.split('-')[0],
        conclusao: r.total_itens > 0 ? Math.round((r.done_count / r.total_itens) * 100) : 0,
        lead: r.avg_lead_time_days != null ? Math.round(r.avg_lead_time_days * 10) / 10 : null,
      }));
  }, [historicoRaw, anoVigente]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Visão Executiva</h2>
        <p className="text-sm text-muted-foreground">
          Fábrica · onde estamos · o que queremos · de onde viemos {periodLabel ? `· ${periodLabel}` : ''}
        </p>
      </div>

      {/* ═══════ ONDE ESTAMOS — AS IS ═══════ */}
      <SecHeader title="Onde estamos" subtitle="AS IS · cenário atual" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <BlocoCard icon={Zap} titulo="Itens no escopo">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-4xl font-bold font-mono">{fab.isLoading ? '—' : fab.total}</p>
              <p className="text-xs text-muted-foreground mt-0.5">itens na sprint</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold font-mono" style={{ color: conclPct >= 80 ? '#16a34a' : conclPct >= 50 ? '#f59e0b' : '#ef4444' }}>{conclPct}%</p>
              <p className="text-[11px] text-muted-foreground">concluído</p>
            </div>
          </div>
          {fab.total > 0 && (
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              <div style={{ width: `${(fab.done / fab.total) * 100}%`, backgroundColor: 'hsl(142,71%,45%)' }} />
              <div style={{ width: `${(fab.inProgress / fab.total) * 100}%`, backgroundColor: 'hsl(210,80%,52%)' }} />
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 border-t pt-2 text-center">
            <div><p className="text-lg font-bold font-mono text-[hsl(210,80%,52%)]">{fab.inProgress}</p><p className="text-[11px] text-muted-foreground">em dev</p></div>
            <div><p className="text-lg font-bold font-mono text-amber-500">{fab.toDo}</p><p className="text-[11px] text-muted-foreground">a fazer</p></div>
            <div><p className="text-lg font-bold font-mono text-[hsl(142,71%,45%)]">{fab.done}</p><p className="text-[11px] text-muted-foreground">done</p></div>
          </div>
        </BlocoCard>

        <BlocoCard icon={RotateCcw} titulo="Retorno QA & gargalo">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-3xl font-bold font-mono text-destructive">{agg.qaReturn}</p>
              <p className="text-[11px] text-muted-foreground">retornos de QA</p>
            </div>
            <div>
              <p className="text-base font-bold text-foreground truncate" title={agg.gargalo ?? ''}>{agg.gargalo ?? '—'}</p>
              <p className="text-[11px] text-muted-foreground">gargalo{agg.gargaloDias != null ? ` · ${agg.gargaloDias}d` : ''}</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2">Estágio com maior tempo médio de permanência.</p>
        </BlocoCard>

        <BlocoCard icon={HeartPulse} titulo="Saúde dos itens">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><p className="text-3xl font-bold font-mono text-[hsl(142,71%,45%)]">{agg.saudaveis}</p><p className="text-[11px] text-muted-foreground">saudável</p></div>
            <div><p className="text-3xl font-bold font-mono text-amber-500">{agg.atencao}</p><p className="text-[11px] text-muted-foreground">atenção</p></div>
            <div><p className="text-3xl font-bold font-mono text-destructive">{agg.criticos}</p><p className="text-[11px] text-muted-foreground">crítico</p></div>
          </div>
          {agg.totalHealth > 0 && (
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              <div style={{ width: `${(agg.saudaveis / agg.totalHealth) * 100}%`, backgroundColor: 'hsl(142,71%,45%)' }} />
              <div style={{ width: `${(agg.atencao / agg.totalHealth) * 100}%`, backgroundColor: '#f59e0b' }} />
              <div style={{ width: `${(agg.criticos / agg.totalHealth) * 100}%`, backgroundColor: '#ef4444' }} />
            </div>
          )}
        </BlocoCard>
      </div>

      {/* ═══════ O QUE QUEREMOS — TO BE ═══════ */}
      <SecHeader title="O que queremos" subtitle="TO BE · meta desejada (atingimento)" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetaCard
          icon={Target}
          titulo="Conclusão da sprint"
          realizado={conclPct}
          meta={META_CONCLUSAO_PCT}
          detalhe={`${fab.done}/${fab.total} itens concluídos no escopo.`}
        />
        <MetaCard
          icon={HeartPulse}
          titulo="Itens saudáveis"
          realizado={saudavelPct}
          meta={META_SAUDAVEL_PCT}
          detalhe={`${agg.saudaveis}/${agg.totalHealth} itens com saúde verde.`}
        />
        <MetaCard
          icon={Shuffle}
          titulo="Transbordo"
          realizado={transbordoPct}
          meta={META_TRANSBORDO_PCT}
          menorMelhor
          detalhe={`${fab.transbordoCount} itens migraram de sprint · ${fab.realOverflowCount} overflow real.`}
        />
      </div>

      {/* ═══════ DE ONDE VIEMOS — HISTÓRICO ═══════ */}
      <SecHeader title="De onde viemos" subtitle="histórico · linha de base · evolução" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BlocoCard icon={CalendarClock} titulo="Evolução · conclusão por sprint" className="lg:col-span-2">
          {evolucao.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Sem histórico de sprints na base.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={evolucao} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="sprint" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                <RTooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [`${v}%`, 'conclusão']} />
                <Line type="monotone" dataKey="conclusao" stroke="hsl(142,71%,45%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
          <p className="text-[11px] text-muted-foreground border-t pt-2">% do escopo concluído ao fim de cada sprint (últimas 8).</p>
        </BlocoCard>

        <BlocoCard icon={Activity} titulo="Linha de base">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold font-mono">{num(fab.velocidadeMedia)}{fab.velocidadeMedia != null ? ' h' : ''}<span className="text-xs text-muted-foreground">/sprint</span></p>
                <p className="text-[11px] text-muted-foreground">velocidade média ({fab.velocidadeSource === 'timelog' ? 'timelog' : 'effort'})</p>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t pt-2">
              <Timer className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold font-mono">{num(fab.leadTimeMedio)}{fab.leadTimeMedio != null ? ' h' : ''}<span className="text-xs text-muted-foreground">/item</span></p>
                <p className="text-[11px] text-muted-foreground">lead time médio ({fab.leadTimeSource === 'timelog' ? 'timelog' : 'effort'})</p>
              </div>
            </div>
          </div>
        </BlocoCard>
      </div>
    </div>
  );
}
