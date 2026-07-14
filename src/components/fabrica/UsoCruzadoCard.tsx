import { useMemo } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cleanFabricaName } from '@/lib/fabricaNames';
import { fabricaColor } from '@/lib/chartColors';
import { buildHomeSquadMap, homeSquadOf, SQUADS } from '@/lib/fabricaRoster';
import { useFabricaRoster } from '@/hooks/useFabricaRoster';

type FabricaScopeRow = {
  key: string;
  collaborators: { name: string; minutes: number }[];
};

type UsoCruzadoCardProps = {
  /** Linhas de horas por fábrica (Epic) com colaboradores — ex.: fab.horasPorFabricaFull. */
  fabricaRows: FabricaScopeRow[];
  /** Modo TV: só as barras de alocação, sem a matriz detalhada. */
  compact?: boolean;
  /** Preenche a altura do card (modo TV). */
  fill?: boolean;
};

const SEM_SQUAD = 'Sem squad';
const OUTRAS = 'Outras';

function fmtH(minutes: number): string {
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}

/**
 * Uso cruzado de capacity: com o roster fixo (squad de casa de cada colaborador)
 * cruzado contra a fábrica do trabalho (Épico), mostra quanto da capacity de cada
 * squad foi para OUTRAS fábricas. Diagonal = trabalho na própria fábrica.
 */
export function UsoCruzadoCard({ fabricaRows, compact = false, fill = false }: UsoCruzadoCardProps) {
  const { data: rosterRows = [], isLoading: rosterLoading } = useFabricaRoster();
  const homeMap = useMemo(() => buildHomeSquadMap(rosterRows), [rosterRows]);

  const { matrix, squadTotals, crossTotals, semSquadMin, destinos, hasData } = useMemo(() => {
    // matrix[home][dest] = minutos
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

    // Ordena destinos: squads na ordem canônica, depois "Outras".
    const destinos = [...SQUADS.filter((s) => destSet.has(s)), ...(destSet.has(OUTRAS) ? [OUTRAS] : [])];
    const hasData = Object.keys(matrix).length > 0 && SQUADS.some((s) => squadTotals[s] > 0);

    return { matrix, squadTotals, crossTotals, semSquadMin: semSquad, destinos, hasData };
  }, [fabricaRows, homeMap]);

  const destColor = (dest: string, idx: number) => (dest === OUTRAS ? 'hsl(var(--muted-foreground))' : fabricaColor(dest, idx));

  return (
    <Card className={fill ? 'h-full flex flex-col' : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-primary" />
          Capacity por Squad — uso cruzado
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
            {/* Alocação por squad — own vs. outras fábricas */}
            <div className="space-y-2.5">
              {SQUADS.map((home, hi) => {
                const total = squadTotals[home] || 0;
                if (total === 0) return null;
                const byDest = matrix[home] ?? {};
                const cross = crossTotals[home] || 0;
                const crossPct = total > 0 ? Math.round((cross / total) * 100) : 0;
                // Segmentos: própria fábrica primeiro, depois as outras (desc).
                const segs = [
                  ...(byDest[home] ? [[home, byDest[home]] as const] : []),
                  ...Object.entries(byDest)
                    .filter(([d]) => d !== home)
                    .sort((a, b) => b[1] - a[1]),
                ];
                return (
                  <div key={home} className="grid grid-cols-[84px_1fr_150px] items-center gap-3">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: fabricaColor(home, hi) }} />
                      {home}
                    </span>
                    <div className="flex h-5 w-full overflow-hidden rounded bg-muted" title={`${home}: ${fmtH(total)} · ${fmtH(cross)} em outras fábricas`}>
                      {segs.map(([dest, min], i) => (
                        <div
                          key={dest}
                          style={{
                            width: `${(min / total) * 100}%`,
                            background: destColor(dest, destinos.indexOf(dest)),
                            opacity: dest === home ? 0.9 : 0.55,
                          }}
                          title={`${dest === home ? 'própria fábrica' : `→ ${dest}`}: ${fmtH(min)}`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-right tabular-nums">
                      <span className="font-mono font-semibold">{fmtH(total)}</span>
                      {cross > 0 && (
                        <span className="text-amber-600 dark:text-amber-400"> · {crossPct}% cruzado</span>
                      )}
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
                              style={isCross ? { background: 'hsl(38,92%,50%,0.12)' } : undefined}
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
              Roster fixo (planilha) define a squad de casa; a fábrica do trabalho vem do Épico da tarefa.
              Célula fora da diagonal (destacada) = <b>uso cruzado</b>.
              {semSquadMin > 0 && ` "${SEM_SQUAD}" = ${fmtH(semSquadMin)} de quem não está no roster.`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
