import { useMemo } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cleanFabricaName } from '@/lib/fabricaNames';
import { fabricaColor } from '@/lib/chartColors';
import { buildHomeSquadMap, homeSquadOf, SQUADS } from '@/lib/fabricaRoster';
import { useFabricaRoster } from '@/hooks/useFabricaRoster';
import { businessDaysBetween } from '@/lib/sprintCalendar';

type FabricaScopeRow = {
  key: string;
  collaborators: { name: string; minutes: number }[];
};

type UsoCruzadoCardProps = {
  /** Linhas de horas por fábrica (Epic) com colaboradores — ex.: fab.horasPorFabricaFull. */
  fabricaRows: FabricaScopeRow[];
  /** Período do realizado — capacidade = h/dia × dias úteis nesse intervalo. */
  dateFrom?: Date | null;
  dateTo?: Date | null;
  /** Modo TV: só as barras, sem a matriz detalhada. */
  compact?: boolean;
  /** Preenche a altura do card (modo TV). */
  fill?: boolean;
};

const SEM_SQUAD = 'Sem squad';
const OUTRAS = 'Outras';
const COR_CRUZADO = 'hsl(28,92%,55%)';

function fmtH(minutes: number): string {
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}
function fmtDelta(minutes: number): string {
  return `${minutes >= 0 ? '+' : '−'}${fmtH(Math.abs(minutes))}`;
}

/**
 * Capacidade × Realizado por squad (regra do gestor): capacidade = Σ h/dia dos
 * membros × dias úteis do período; realizado = timelog (DevOps) dos membros
 * fixos. A fatia âmbar do realizado é o uso cruzado (horas em item de outra
 * fábrica). Fora da diagonal na matriz = uso cruzado.
 */
export function UsoCruzadoCard({ fabricaRows, dateFrom, dateTo, compact = false, fill = false }: UsoCruzadoCardProps) {
  const { data: rosterRows = [], isLoading: rosterLoading } = useFabricaRoster();
  const homeMap = useMemo(() => buildHomeSquadMap(rosterRows), [rosterRows]);

  const businessDays = useMemo(
    () => (dateFrom && dateTo ? businessDaysBetween(dateFrom, dateTo) : null),
    [dateFrom, dateTo],
  );

  // Capacidade (minutos) por squad = Σ h/dia dos membros × dias úteis × 60.
  const capByHome = useMemo(() => {
    const out: Record<string, number> = {};
    if (!businessDays) return out;
    for (const squad of SQUADS) {
      const hDia = rosterRows.filter((r) => r.squad === squad).reduce((s, r) => s + (Number(r.capacidade_h_dia) || 0), 0);
      out[squad] = hDia * businessDays * 60;
    }
    return out;
  }, [rosterRows, businessDays]);

  const { matrix, squadTotals, crossTotals, semSquadMin, destinos, hasData } = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {};
    const destSet = new Set<string>();
    let semSquad = 0;
    const bump = (home: string, dest: string, min: number) => {
      (matrix[home] ??= {})[dest] = (matrix[home]?.[dest] ?? 0) + min;
    };
    for (const row of fabricaRows) {
      const clean = cleanFabricaName(row.key);
      const dest = SQUADS.includes(clean) ? clean : OUTRAS;
      destSet.add(dest);
      for (const c of row.collaborators) {
        const home = homeSquadOf(homeMap, c.name) ?? SEM_SQUAD;
        if (home === SEM_SQUAD) semSquad += c.minutes;
        bump(home, dest, c.minutes);
      }
    }
    const squadTotals: Record<string, number> = {};
    const crossTotals: Record<string, number> = {};
    for (const home of SQUADS) {
      const byDest = matrix[home] ?? {};
      const total = Object.values(byDest).reduce((s, v) => s + v, 0);
      squadTotals[home] = total;
      crossTotals[home] = total - (byDest[home] ?? 0);
    }
    const destinos = [...SQUADS.filter((s) => destSet.has(s)), ...(destSet.has(OUTRAS) ? [OUTRAS] : [])];
    const hasData = Object.keys(matrix).length > 0 && SQUADS.some((s) => squadTotals[s] > 0);
    return { matrix, squadTotals, crossTotals, semSquadMin: semSquad, destinos, hasData };
  }, [fabricaRows, homeMap]);

  const maxCap = useMemo(() => Math.max(1, ...SQUADS.map((s) => capByHome[s] ?? 0)), [capByHome]);
  const temCapacidade = !!businessDays && SQUADS.some((s) => (capByHome[s] ?? 0) > 0);

  return (
    <Card className={fill ? 'h-full flex flex-col' : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-primary" />
          Capacidade × Realizado por Squad
        </CardTitle>
      </CardHeader>
      <CardContent className={fill ? 'flex-1 min-h-0 flex flex-col justify-center' : undefined}>
        {rosterLoading ? (
          <p className="text-xs text-muted-foreground text-center py-8">Carregando roster das squads…</p>
        ) : rosterRows.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            Roster das squads não carregado (tabela <code>fabrica_squad_membership</code> vazia).
          </p>
        ) : !hasData ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            Sem apontamentos no período para cruzar com o roster das squads.
          </p>
        ) : (
          <>
            <div className="space-y-2.5">
              {SQUADS.map((home, hi) => {
                const real = squadTotals[home] || 0;
                if (real === 0 && (capByHome[home] ?? 0) === 0) return null;
                const cor = fabricaColor(home, hi);
                const cross = crossTotals[home] || 0;
                const own = real - cross;
                const cap = capByHome[home] ?? 0;

                if (temCapacidade && cap > 0) {
                  const trackPct = (cap / maxCap) * 100;         // largura ∝ capacidade
                  const fillPct = Math.min(real / cap, 1) * 100;  // realizado dentro da capacidade
                  const ownPct = real > 0 ? (own / real) * 100 : 0;
                  const crossPct = real > 0 ? (cross / real) * 100 : 0;
                  const util = Math.round((real / cap) * 100);
                  const delta = real - cap;
                  return (
                    <div key={home} className="grid grid-cols-[84px_1fr_176px] items-center gap-3">
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: cor }} />{home}
                      </span>
                      <div className="relative" title={`capacidade ${fmtH(cap)} · realizado ${fmtH(real)}`}>
                        <div className="relative h-5 rounded overflow-hidden bg-[hsl(var(--muted))]" style={{ width: `${trackPct}%` }}>
                          {/* ociosa (hachura) */}
                          <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(90deg, transparent, transparent 5px, hsl(var(--border)) 5px, hsl(var(--border)) 6px)' }} />
                          {/* realizado: própria + cruzado */}
                          <div className="absolute inset-y-0 left-0 flex" style={{ width: `${fillPct}%` }}>
                            <div style={{ width: `${ownPct}%`, background: cor }} />
                            <div style={{ width: `${crossPct}%`, background: COR_CRUZADO }} title={`uso cruzado ${fmtH(cross)}`} />
                          </div>
                          {/* traço de 100% da capacidade (borda direita do track) */}
                          <div className="absolute inset-y-[-2px] right-0 w-0.5 bg-foreground/60" />
                        </div>
                      </div>
                      <span className="text-xs text-right tabular-nums">
                        <span className="font-mono font-semibold">{util}%</span>
                        <span className="text-muted-foreground"> · {fmtH(real)}/{fmtH(cap)} </span>
                        <span className={delta >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-destructive font-medium'}>{fmtDelta(delta)}</span>
                      </span>
                    </div>
                  );
                }

                // Fallback (sem período/capacidade): só realizado, própria vs cruzado.
                const crossPctReal = real > 0 ? Math.round((cross / real) * 100) : 0;
                return (
                  <div key={home} className="grid grid-cols-[84px_1fr_150px] items-center gap-3">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: cor }} />{home}
                    </span>
                    <div className="flex h-5 w-full overflow-hidden rounded bg-muted">
                      <div style={{ width: `${real > 0 ? (own / real) * 100 : 0}%`, background: cor }} />
                      <div style={{ width: `${real > 0 ? (cross / real) * 100 : 0}%`, background: COR_CRUZADO }} />
                    </div>
                    <span className="text-xs text-right tabular-nums">
                      <span className="font-mono font-semibold">{fmtH(real)}</span>
                      {cross > 0 && <span className="text-amber-600 dark:text-amber-400"> · {crossPctReal}% cruzado</span>}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Matriz origem → destino */}
            <div className={`mt-4 overflow-x-auto ${compact ? 'hidden' : ''}`}>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-medium py-1.5 pr-2">origem ↓ / destino →</th>
                    {destinos.map((d) => (
                      <th key={d} className="text-center font-medium px-2" style={{ color: d === OUTRAS ? undefined : fabricaColor(d, destinos.indexOf(d)) }}>{d}</th>
                    ))}
                    <th className="text-right font-medium pl-2">total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...SQUADS, ...(semSquadMin > 0 ? [SEM_SQUAD] : [])].map((home) => {
                    const byDest = matrix[home] ?? {};
                    const total = Object.values(byDest).reduce((s, v) => s + v, 0);
                    if (total === 0) return null;
                    return (
                      <tr key={home} className="border-t border-border/60">
                        <th className="text-left font-semibold py-1.5 pr-2">{home}</th>
                        {destinos.map((dest) => {
                          const min = byDest[dest] ?? 0;
                          const isCross = home !== dest && min > 0 && home !== SEM_SQUAD;
                          return (
                            <td
                              key={dest}
                              className={`text-center px-2 font-mono tabular-nums ${isCross ? 'text-amber-700 dark:text-amber-300 font-semibold' : min > 0 ? '' : 'text-muted-foreground/40'}`}
                              style={isCross ? { background: 'hsl(28,92%,55%,0.12)' } : undefined}
                            >
                              {min > 0 ? fmtH(min) : '—'}
                            </td>
                          );
                        })}
                        <td className="text-right pl-2 font-mono font-semibold tabular-nums">{fmtH(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-muted-foreground mt-2">
              {temCapacidade
                ? <>Barra até o traço = 100% da capacidade (Σ h/dia × {businessDays} dias úteis). Preenchida = realizado; <b style={{ color: COR_CRUZADO }}>âmbar</b> = uso cruzado; hachura = ociosa.</>
                : <>Realizado por squad; <b style={{ color: COR_CRUZADO }}>âmbar</b> = uso cruzado. (Selecione uma sprint para ver a capacidade.)</>}
              {semSquadMin > 0 && ` "${SEM_SQUAD}" = ${fmtH(semSquadMin)} de quem não está no roster.`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
