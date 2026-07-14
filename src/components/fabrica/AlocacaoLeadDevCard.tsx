import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cleanFabricaName } from '@/lib/fabricaNames';
import { fabricaColor } from '@/lib/chartColors';
import { normName, SQUADS } from '@/lib/fabricaRoster';
import { useFabricaRoster } from '@/hooks/useFabricaRoster';

type FabricaScopeRow = {
  key: string;
  collaborators: { name: string; minutes: number }[];
};

type AlocacaoLeadDevCardProps = {
  /** Horas por fábrica (Epic) com colaboradores — ex.: fab.horasPorFabricaFull. */
  fabricaRows: FabricaScopeRow[];
};

function fmtH(minutes: number): string {
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}

/**
 * Visão de alocação Lead → desenvolvedores. Cada squad do roster fixo abre para
 * os seus devs; a barra de cada dev fica bicolor quando parte das horas foi para
 * OUTRA fábrica (uso cruzado), com o destino no chip.
 *
 * O cabeçalho mostra o LEAD da squad quando ele está marcado no roster
 * (papel='lead'); enquanto não estiver, mostra o nome da squad.
 */
export function AlocacaoLeadDevCard({ fabricaRows }: AlocacaoLeadDevCardProps) {
  const { data: roster = [], isLoading } = useFabricaRoster();
  const [aberta, setAberta] = useState<string | null>(null);

  // Horas de cada colaborador por fábrica de DESTINO (fábrica do item).
  const byCollab = useMemo(() => {
    const m = new Map<string, { total: number; byDest: Map<string, number> }>();
    for (const row of fabricaRows) {
      const dest = cleanFabricaName(row.key);
      for (const c of row.collaborators) {
        const k = normName(c.name);
        const e = m.get(k) ?? { total: 0, byDest: new Map<string, number>() };
        e.total += c.minutes;
        e.byDest.set(dest, (e.byDest.get(dest) ?? 0) + c.minutes);
        m.set(k, e);
      }
    }
    return m;
  }, [fabricaRows]);

  const squads = useMemo(() => {
    return SQUADS.map((squad) => {
      const membros = roster.filter((r) => r.squad === squad);
      const lead = membros.find((r) => r.papel === 'lead') ?? null;
      const devs = membros
        .map((r) => {
          const stat = byCollab.get(normName(r.colaborador));
          const total = stat?.total ?? 0;
          const own = stat?.byDest.get(squad) ?? 0;
          const crossDests = [...(stat?.byDest ?? new Map<string, number>())]
            .filter(([d]) => d !== squad)
            .sort((a, b) => b[1] - a[1]);
          return { nome: r.colaborador, papel: r.papel, total, own, cross: total - own, crossDests };
        })
        .sort((a, b) => b.total - a.total);
      const total = devs.reduce((s, d) => s + d.total, 0);
      const cross = devs.reduce((s, d) => s + d.cross, 0);
      return { squad, lead, devs, total, cross };
    }).filter((s) => s.devs.length > 0);
  }, [roster, byCollab]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Alocação — Lead → desenvolvedores
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-8">Carregando roster das squads…</p>
        ) : squads.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            Roster das squads não carregado (tabela <code>fabrica_squad_membership</code> vazia).
          </p>
        ) : (
          <div className="space-y-2">
            {squads.map((s, si) => {
              const cor = fabricaColor(s.squad, si);
              const isOpen = aberta === s.squad;
              const crossPct = s.total > 0 ? Math.round((s.cross / s.total) * 100) : 0;
              return (
                <div key={s.squad} className="border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/40 transition-colors text-left"
                    onClick={() => setAberta(isOpen ? null : s.squad)}
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: cor }} />
                    <span className="font-semibold text-sm">
                      {s.lead ? s.lead.colaborador : s.squad}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: cor, color: cor }}>
                      {s.lead ? `Lead · ${s.squad}` : `${s.squad} · lead não definido`}
                    </span>
                    <span className="ml-auto text-xs tabular-nums">
                      <span className="font-mono font-semibold">{fmtH(s.total)}</span>
                      {s.cross > 0 && <span className="text-amber-600 dark:text-amber-400"> · {crossPct}% cruzado</span>}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="divide-y divide-border/60 border-t">
                      {s.devs.map((d) => {
                        const ownPct = d.total > 0 ? (d.own / d.total) * 100 : 0;
                        const crossPctDev = d.total > 0 ? (d.cross / d.total) * 100 : 0;
                        return (
                          <div key={d.nome} className="grid grid-cols-[1fr_84px_140px] items-center gap-3 px-3 py-2 pl-9">
                            <span className="text-sm flex items-center gap-1.5 flex-wrap">
                              <span className={d.total === 0 ? 'text-muted-foreground' : ''}>{d.nome}</span>
                              {d.papel === 'lead' && (
                                <span className="text-[10px] px-1 rounded bg-muted text-muted-foreground">lead</span>
                              )}
                              {d.crossDests.map(([dest, min]) => (
                                <span key={dest} className="text-[10px] px-1.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium">
                                  {fmtH(min)} → {dest}
                                </span>
                              ))}
                              {d.total === 0 && (
                                <span className="text-[10px] px-1.5 rounded bg-muted text-muted-foreground">sem apontamento</span>
                              )}
                            </span>
                            <span className="text-xs text-right font-mono tabular-nums">{fmtH(d.total)}</span>
                            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div style={{ width: `${ownPct}%`, background: cor }} title={`própria fábrica: ${fmtH(d.own)}`} />
                              <div style={{ width: `${crossPctDev}%`, background: 'hsl(38,92%,50%)' }} title={`outras fábricas: ${fmtH(d.cross)}`} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-2">
          Clique na squad para abrir os desenvolvedores. Segmento âmbar na barra = horas alocadas em
          <b> outra fábrica</b> (uso cruzado). O lead aparece no cabeçalho quando marcado no roster.
        </p>
      </CardContent>
    </Card>
  );
}
