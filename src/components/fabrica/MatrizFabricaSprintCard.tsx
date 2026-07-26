import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { useSprintSnapshots } from '@/hooks/useSprintSnapshots';
import { SQUADS } from '@/lib/fabricaRoster';
import {
  matrizFabricaSprint, serieEntregaGeral, pctDe,
  type AgregadoLive, type CelulaFabrica,
} from '@/lib/fabricaTvSeries';
import { META_ENTREGA_PCT, TETO_BUG_PCT, TETO_RETORNO_QA_PCT } from '@/lib/fabricaMetas';

type Props = {
  /** Sprints seladas exibidas (o telão comporta 3 + a em curso). */
  maxSprints?: number;
  /** Sprint aberta: agregados ao vivo por fábrica e do geral. */
  live?: { sprint: string; porFabrica: Record<string, AgregadoLive>; geral?: AgregadoLive } | null;
};

const MEDALHAS = ['🥇', '🥈', '🥉'];

/**
 * Matriz fábrica × sprint (modo TV).
 *
 * Funde o que antes eram dois blocos com o mesmo dado em linguagens diferentes
 * (tendência geral em cima, ranking por caixinha embaixo): as linhas já saem
 * ordenadas por encerrados na sprint mais recente, então a ordem É o ranking, e
 * a linha GERAL fecha a conta. Mostra o que a média esconde — uma squad
 * despencando aparece na hora.
 */
export function MatrizFabricaSprintCard({ maxSprints = 3, live = null }: Props) {
  const { data: snapshots = {}, isLoading } = useSprintSnapshots();
  const ano = new Date().getFullYear();

  const matriz = useMemo(
    () => matrizFabricaSprint(snapshots, { ano, maxSprints, squads: SQUADS, live }),
    [snapshots, ano, maxSprints, live],
  );

  const geral = useMemo(() => {
    const seladas = serieEntregaGeral(snapshots, { ano, maxSprints });
    const porSprint: Record<string, { pct: number; concluido: number; total: number } | null> = {};
    for (const s of seladas) porSprint[s.sprint] = { pct: s.pct, concluido: s.concluido, total: s.total };
    let bugPct = seladas.at(-1)?.bugPct ?? 0;
    let retornoPct = seladas.at(-1)?.retornoPct ?? 0;
    if (live) {
      const g = live.geral;
      porSprint[live.sprint] = g && g.total > 0
        ? { pct: pctDe(g.concluido, g.total), concluido: g.concluido, total: g.total }
        : null;
      if (g && g.total > 0) {
        bugPct = pctDe(g.bug, g.total);
        retornoPct = pctDe(g.retorno, g.total);
      }
    }
    return { porSprint, bugPct, retornoPct };
  }, [snapshots, ano, maxSprints, live]);

  const colunas = `112px repeat(${matriz.sprints.length}, 1fr) 186px`;

  if (!isLoading && matriz.sprints.length === 0) {
    return (
      <Card className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Sem fotografias de sprint para a matriz.</p>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col min-h-0">
      <div className="flex-none flex items-baseline justify-between px-4 pt-3 pb-1">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold">Entrega por fábrica × sprint</h3>
          <span className="text-[11px] text-muted-foreground">
            encerrados ÷ escopo da fábrica · ordem = encerrados na sprint mais recente
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10.5px] font-bold">
          <span className="rounded-full border border-[hsl(142,71%,42%)]/40 bg-[hsl(142,71%,42%)]/15 px-2 py-0.5 text-[hsl(142,71%,55%)]">
            ≥ {META_ENTREGA_PCT}% meta
          </span>
          <span className="rounded-full border border-[hsl(38,92%,50%)]/40 bg-[hsl(38,92%,50%)]/15 px-2 py-0.5 text-[hsl(38,92%,62%)]">
            {META_ENTREGA_PCT - 10}–{META_ENTREGA_PCT - 1}%
          </span>
          <span className="rounded-full border border-[hsl(0,72%,52%)]/40 bg-[hsl(0,72%,52%)]/15 px-2 py-0.5 text-[hsl(0,72%,68%)]">
            &lt; {META_ENTREGA_PCT - 10}%
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-4 pb-3 flex flex-col">
        {/* cabeçalho de colunas */}
        <div className="grid gap-2 pb-1.5 flex-none" style={{ gridTemplateColumns: colunas }}>
          <div />
          {matriz.sprints.map((s) => {
            const emCurso = live?.sprint === s;
            return (
              <div
                key={s}
                className={`text-center text-[15px] font-extrabold ${emCurso ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                {s}{emCurso && <span className="ml-1 text-[11px] font-semibold opacity-70">em curso</span>}
              </div>
            );
          })}
          <div className="text-center text-[13px] font-bold text-muted-foreground">qualidade na sprint</div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col gap-1.5">
          {matriz.linhas.map((linha, idx) => (
            <div key={linha.fabrica} className="flex-1 min-h-0 grid gap-2" style={{ gridTemplateColumns: colunas }}>
              <div className="flex items-center gap-1.5 text-[18px] font-extrabold truncate">
                <span>{MEDALHAS[idx] ?? ''}</span>
                <span className={idx > 2 ? 'text-muted-foreground' : ''}>{linha.fabrica}</span>
              </div>
              {matriz.sprints.map((s) => (
                <Celula key={s} celula={linha.celulas[s] ?? null} emCurso={live?.sprint === s} />
              ))}
              <BarrasQualidade bug={linha.bugPct} retorno={linha.retornoPct} />
            </div>
          ))}

          {/* linha GERAL — soma do setor, inclusive itens sem squad no roster */}
          <div
            className="flex-none grid gap-2 pt-1.5 border-t-2 border-border items-center"
            style={{ gridTemplateColumns: colunas }}
          >
            <div className="text-[17px] font-black tracking-wide">GERAL</div>
            {matriz.sprints.map((s) => {
              const c = geral.porSprint[s];
              return (
                <div key={s} className="flex items-center justify-center gap-2">
                  {c ? (
                    <>
                      <span className="text-[30px] font-black leading-none font-mono" style={{ color: corTexto(c.pct) }}>
                        {Math.round(c.pct)}%
                      </span>
                      {live?.sprint === s && (
                        <span className="text-[11px] text-muted-foreground">{c.concluido} de {c.total}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-[18px] text-muted-foreground">—</span>
                  )}
                </div>
              );
            })}
            <div className="flex items-center justify-center gap-3 text-[13px]">
              <span>bug <b className="font-mono" style={{ color: corTeto(geral.bugPct, TETO_BUG_PCT) }}>{Math.round(geral.bugPct)}%</b></span>
              <span>ret. QA <b className="font-mono" style={{ color: corTeto(geral.retornoPct, TETO_RETORNO_QA_PCT) }}>{Math.round(geral.retornoPct)}%</b></span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function corTexto(pct: number): string {
  if (pct >= META_ENTREGA_PCT) return 'hsl(142,71%,62%)';
  if (pct >= META_ENTREGA_PCT - 10) return 'hsl(38,92%,64%)';
  return 'hsl(0,72%,72%)';
}

function corTeto(pct: number, teto: number): string {
  return pct > teto ? 'hsl(0,72%,68%)' : 'hsl(142,71%,60%)';
}

function Celula({ celula, emCurso }: { celula: CelulaFabrica | null; emCurso: boolean }) {
  if (!celula) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border/60 bg-black/20">
        <span className="text-[16px] text-muted-foreground">—</span>
      </div>
    );
  }
  const { fundo, borda } = estiloCelula(celula.pct);
  return (
    <div
      className="flex items-center justify-center gap-2 rounded-lg"
      style={{ background: fundo, border: `1px ${emCurso ? 'dashed' : 'solid'} ${borda}` }}
    >
      <span className="text-[27px] font-black leading-none font-mono" style={{ color: corTexto(celula.pct) }}>
        {Math.round(celula.pct)}%
      </span>
      {emCurso && <span className="text-[11px] text-muted-foreground">{celula.concluido}/{celula.total}</span>}
    </div>
  );
}

/** Intensidade proporcional ao atingimento — mesma ideia do verde do ranking (TV-3). */
function estiloCelula(pct: number): { fundo: string; borda: string } {
  if (pct >= META_ENTREGA_PCT) {
    const r = Math.min(1, (pct - META_ENTREGA_PCT) / 12);
    return {
      fundo: `hsl(142 71% 42% / ${(0.16 + r * 0.2).toFixed(3)})`,
      borda: `hsl(142 71% 45% / ${(0.38 + r * 0.28).toFixed(3)})`,
    };
  }
  if (pct >= META_ENTREGA_PCT - 10) {
    return { fundo: 'hsl(38 92% 50% / 0.13)', borda: 'hsl(38 92% 50% / 0.30)' };
  }
  return { fundo: 'hsl(0 72% 52% / 0.15)', borda: 'hsl(0 72% 52% / 0.33)' };
}

function BarrasQualidade({ bug, retorno }: { bug: number; retorno: number }) {
  return (
    <div className="flex flex-col justify-center gap-1 pl-1.5">
      <Barra rotulo="bug" valor={bug} teto={TETO_BUG_PCT} cor="hsl(0,72%,52%)" />
      <Barra rotulo="ret. QA" valor={retorno} teto={TETO_RETORNO_QA_PCT} cor="hsl(38,92%,50%)" />
    </div>
  );
}

function Barra({ rotulo, valor, teto, cor }: { rotulo: string; valor: number; teto: number; cor: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-[48px] shrink-0 text-muted-foreground">{rotulo}</span>
      <span className="relative flex-1 h-[7px] min-w-0 rounded-full bg-white/10 overflow-hidden">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, valor))}%`, background: cor }}
        />
      </span>
      <span className="w-[32px] shrink-0 text-right font-mono font-semibold" style={{ color: valor > teto ? 'hsl(0,72%,68%)' : undefined }}>
        {Math.round(valor)}%
      </span>
    </div>
  );
}
