import { useMemo } from 'react';
import { Zap, Gauge, Timer, Shuffle, RotateCcw, HeartPulse } from 'lucide-react';
import { BlocoCard } from '@/components/executivo/BlocoCard';
import { useGerencialFabrica } from '@/hooks/useGerencialFabrica';

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

export function FabricaExecutivoTab({ fab, selectedSprintCode, dateFrom, dateTo, periodLabel }: FabricaExecutivoTabProps) {
  const { data: gerencial = [] } = useGerencialFabrica(selectedSprintCode || undefined, toIso(dateFrom), toIso(dateTo));

  // Agrega as linhas por sprint do escopo selecionado
  const agg = useMemo(() => {
    const qaReturn = gerencial.reduce((s, r) => s + (r.qa_return_total || 0), 0);
    const criticos = gerencial.reduce((s, r) => s + (r.itens_criticos || 0), 0);
    const atencao = gerencial.reduce((s, r) => s + (r.itens_atencao || 0), 0);
    const saudaveis = gerencial.reduce((s, r) => s + (r.itens_saudaveis || 0), 0);
    const gargaloRow = [...gerencial].sort((a, b) => (b.gargalo_avg_days || 0) - (a.gargalo_avg_days || 0))[0];
    return {
      qaReturn,
      criticos,
      atencao,
      saudaveis,
      totalHealth: criticos + atencao + saudaveis,
      gargalo: gargaloRow?.gargalo_principal ?? null,
      gargaloDias: gargaloRow?.gargalo_avg_days ?? null,
    };
  }, [gerencial]);

  const conclPct = fab.total > 0 ? Math.round((fab.done / fab.total) * 100) : 0;
  const num = (v: number | null) => (v == null ? '—' : v);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Visão Executiva</h2>
        <p className="text-sm text-muted-foreground">
          Fábrica · onde estamos · o que queremos · de onde viemos {periodLabel ? `· ${periodLabel}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Onde estamos — Itens no escopo */}
        <BlocoCard icon={Zap} titulo="Onde estamos · Sprint">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-4xl font-bold font-mono">{fab.isLoading ? '—' : fab.total}</p>
              <p className="text-xs text-muted-foreground mt-0.5">itens no escopo</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold font-mono" style={{ color: conclPct >= 80 ? '#16a34a' : conclPct >= 50 ? '#f59e0b' : '#ef4444' }}>
                {fab.isLoading ? '—' : `${conclPct}%`}
              </p>
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

        {/* Velocidade média */}
        <BlocoCard icon={Gauge} titulo="Velocidade média">
          <div>
            <p className="text-4xl font-bold font-mono">
              {fab.isLoading ? '—' : num(fab.velocidadeMedia)}
              {fab.velocidadeMedia != null && <span className="text-lg text-muted-foreground"> h/sprint</span>}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">média de horas por sprint</p>
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2">
            Fonte: {fab.velocidadeSource === 'timelog' ? 'apontamento (timelog)' : 'estimativa (effort)'}.
          </p>
        </BlocoCard>

        {/* Lead time */}
        <BlocoCard icon={Timer} titulo="Lead time médio">
          <div>
            <p className="text-4xl font-bold font-mono">
              {fab.isLoading ? '—' : num(fab.leadTimeMedio)}
              {fab.leadTimeMedio != null && <span className="text-lg text-muted-foreground"> h/item</span>}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">horas médias por item finalizado</p>
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2">
            Fonte: {fab.leadTimeSource === 'timelog' ? 'apontamento (timelog)' : 'estimativa (effort)'}.
          </p>
        </BlocoCard>

        {/* Transbordo & overflow */}
        <BlocoCard icon={Shuffle} titulo="Transbordo & overflow">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-4xl font-bold font-mono" style={{ color: (fab.transbordoPct ?? 0) > 20 ? '#ef4444' : (fab.transbordoPct ?? 0) > 10 ? '#f59e0b' : '#16a34a' }}>
                {fab.transbordoPct == null ? '—' : `${fab.transbordoPct}%`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">itens que migraram de sprint</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold font-mono">{fab.realOverflowCount}</p>
              <p className="text-[11px] text-muted-foreground">overflow real</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2">Overflow real = migrações além da 1ª (represamento entre sprints).</p>
        </BlocoCard>

        {/* Retorno QA + gargalo */}
        <BlocoCard icon={RotateCcw} titulo="Retorno QA & gargalo">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-3xl font-bold font-mono text-destructive">{agg.qaReturn}</p>
              <p className="text-[11px] text-muted-foreground">retornos de QA</p>
            </div>
            <div>
              <p className="text-base font-bold text-foreground truncate" title={agg.gargalo ?? ''}>{agg.gargalo ?? '—'}</p>
              <p className="text-[11px] text-muted-foreground">
                gargalo principal{agg.gargaloDias != null ? ` · ${agg.gargaloDias}d` : ''}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2">Estágio com maior tempo médio de permanência.</p>
        </BlocoCard>

        {/* Health */}
        <BlocoCard icon={HeartPulse} titulo="Saúde dos itens">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-3xl font-bold font-mono text-[hsl(142,71%,45%)]">{agg.saudaveis}</p>
              <p className="text-[11px] text-muted-foreground">saudável</p>
            </div>
            <div>
              <p className="text-3xl font-bold font-mono text-amber-500">{agg.atencao}</p>
              <p className="text-[11px] text-muted-foreground">atenção</p>
            </div>
            <div>
              <p className="text-3xl font-bold font-mono text-destructive">{agg.criticos}</p>
              <p className="text-[11px] text-muted-foreground">crítico</p>
            </div>
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
    </div>
  );
}
