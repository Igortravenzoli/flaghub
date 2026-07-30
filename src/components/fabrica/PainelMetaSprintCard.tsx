import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { useSprintSnapshots } from '@/hooks/useSprintSnapshots';
import { sprintsSeladas, concluidoDoEscopo, pctDe } from '@/lib/fabricaTvSeries';
import { META_ENTREGA_PCT, TETO_BUG_PCT, TETO_RETORNO_QA_PCT } from '@/lib/fabricaMetas';

/**
 * "Desempenho & qualidade por sprint" — um painel por meta (variante H, aprovada
 * por Igor em 29/07/2026; mock `MOCK_TV_FABRICA_H_REFINADA_29-07.html`).
 *
 * Por que três painéis e não um gráfico com três séries: as metas têm SENTIDOS
 * OPOSTOS — entrega é PISO (≥ 88%), bug e retorno QA são TETO (≤ 30%). Num eixo
 * só, o mesmo tracejado significaria "fique acima" para uma série e "fique
 * abaixo" para as outras, e a 5 m isso se lê errado. Cada painel carrega a sua
 * faixa de conformidade e o seu sentido escrito.
 *
 * Substitui a régua de faixas (`EntregaSprintReguaCard`) no slot da página 1.
 */

/** Verde de CONFORMIDADE — o mesmo para os três indicadores, de propósito. */
const COR_OK = 'hsl(150,64%,44%)';
const COR_ENTREGA = 'hsl(142,71%,42%)';
const COR_BUG = 'hsl(0,72%,52%)';
const COR_RETORNO = 'hsl(38,92%,50%)';

type Tipo = 'piso' | 'teto';

type SerieAtual = { sprint: string; entregaPct: number; bugPct: number; retornoPct: number } | null;

type Props = {
  /** Quantas fotografias seladas exibir (o telão comporta 8 + a em curso). */
  maxSprints?: number;
  /** Sprint em curso (dado ao vivo) — entra tracejada, como estimativa. */
  atual?: SerieAtual;
};

type Ponto = { sprint: string; valor: number; emCurso: boolean };

// ── Geometria do painel (px do mock, canvas 1320 do KioskSectorView) ──────────
const VB_W = 404, VB_H = 274;
const X0 = 64, X1 = VB_W - 10, Y0 = 34, Y1 = VB_H - 46;
const R = 15, RC = 19;

function caminhoSuave(pts: Array<[number, number]>): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C ${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)},`
      + ` ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)},`
      + ` ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function Painel({ titulo, pontos, cor, tipo, meta, dominio }: {
  titulo: string;
  pontos: Ponto[];
  cor: string;
  tipo: Tipo;
  meta: number;
  dominio: number;
}) {
  if (pontos.length === 0) {
    return (
      <div className="flex-1 min-w-0 rounded-[10px] border border-border bg-[hsl(var(--card))] flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Sem fotografias de sprint</p>
      </div>
    );
  }

  const step = pontos.length > 1 ? (X1 - X0) / (pontos.length - 1) : 0;
  const x = (i: number) => +(X0 + step * i).toFixed(1);
  const y = (v: number) => +(Y1 - (Math.min(v, dominio) / dominio) * (Y1 - Y0)).toFixed(1);
  const dentroDaMeta = (v: number) => (tipo === 'piso' ? v >= meta : v <= meta);

  const coords: Array<[number, number]> = pontos.map((p, i) => [x(i), y(p.valor)]);
  const seladas = coords.slice(0, pontos[pontos.length - 1].emCurso ? -1 : undefined);
  const temEmCurso = pontos[pontos.length - 1].emCurso && coords.length > 1;

  // Faixa de conformidade: acima da meta no piso, abaixo do teto no teto.
  const faixaY = tipo === 'piso' ? Y0 : y(meta);
  const faixaH = tipo === 'piso' ? y(meta) - Y0 : Y1 - y(meta);

  return (
    <div className="flex-1 min-w-0">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full h-full" preserveAspectRatio="none">
        <rect x="0" y="0" width={VB_W} height={VB_H} rx="10" fill="hsl(var(--card))" stroke="hsl(var(--border))" />
        <text x="14" y="21" fontSize="14" fontWeight="800" fill={cor}>{titulo}</text>
        <text x={VB_W - 14} y="21" textAnchor="end" fontSize="12" fontWeight="800" fill={COR_OK}>
          {tipo === 'piso' ? `↑ melhor · piso ${meta}%` : `↓ melhor · teto ${meta}%`}
        </text>

        <rect x={X0} y={faixaY} width={X1 - X0} height={Math.max(0, faixaH)} fill={COR_OK} opacity="0.13" />
        <line x1={X0} y1={y(meta)} x2={X1} y2={y(meta)} stroke={COR_OK} strokeWidth="2" strokeDasharray="9 6" />

        {[0, dominio / 2, dominio].map((p) => (
          <g key={p}>
            <text x={X0 - 18} y={y(p) + 4} textAnchor="end" fontSize="11.5" fill="hsl(var(--muted-foreground))">
              {Math.round(p)}%
            </text>
            {p !== 0 && <line x1={X0} y1={y(p)} x2={X1} y2={y(p)} stroke="hsl(var(--border))" strokeDasharray="3 6" />}
          </g>
        ))}
        <line x1={X0} y1={Y1} x2={X1} y2={Y1} stroke="hsl(var(--border))" />

        {/* Haste ligando cada bolinha ao seu rótulo de sprint (pedido de Igor). */}
        {pontos.map((p, i) => {
          const topo = y(p.valor) + (p.emCurso ? RC : R);
          if (topo >= Y1 - 2) return null;
          return (
            <line
              key={`haste-${p.sprint}`}
              x1={x(i)} y1={topo} x2={x(i)} y2={Y1}
              stroke={p.emCurso ? COR_RETORNO : cor}
              strokeWidth={p.emCurso ? 2 : 1}
              opacity={p.emCurso ? 0.55 : 0.22}
            />
          );
        })}

        <path d={caminhoSuave(seladas)} fill="none" stroke={cor} strokeWidth="4" strokeLinecap="round" />
        {temEmCurso && (
          <path
            d={`M ${seladas[seladas.length - 1][0]} ${seladas[seladas.length - 1][1]} L ${coords[coords.length - 1][0]} ${coords[coords.length - 1][1]}`}
            fill="none" stroke={cor} strokeWidth="4" strokeDasharray="10 7"
          />
        )}

        {pontos.map((p, i) => {
          const ok = dentroDaMeta(p.valor);
          const rr = p.emCurso ? RC : R;
          /**
           * Bateu a meta → bolinha CHEIA no verde de conformidade, igual nos três
           * painéis (pedido de Igor, 29/07/2026): pintar "dentro do teto" com o
           * vermelho da série fazia um acerto parecer problema. Fora da meta →
           * bolinha vazada na cor da série, que segue identificando o indicador.
           */
          return (
            <g key={p.sprint}>
              <circle
                cx={x(i)} cy={y(p.valor)} r={rr}
                fill={ok ? COR_OK : 'hsl(var(--card))'}
                stroke={ok ? COR_OK : cor}
                strokeWidth={ok ? 2 : 3}
              />
              <text
                x={x(i)} y={y(p.valor) + rr * 0.34} textAnchor="middle"
                fontSize={(rr * 0.86).toFixed(1)} fontWeight="800"
                fill={ok ? '#062B14' : cor}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {Math.round(p.valor)}
              </text>
            </g>
          );
        })}

        {pontos.map((p, i) => (
          <text
            key={`rot-${p.sprint}`}
            x={x(i)} y={Y1 + 21} textAnchor="middle"
            fontSize={p.emCurso ? 13.5 : 11.5}
            fontWeight={p.emCurso ? 800 : 600}
            fill={p.emCurso ? COR_RETORNO : 'hsl(var(--muted-foreground))'}
          >
            {p.sprint}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function PainelMetaSprintCard({ maxSprints = 8, atual = null }: Props) {
  const { data: snapshots = {}, isLoading } = useSprintSnapshots();
  const ano = new Date().getFullYear();

  const series = useMemo(() => {
    const seladas = sprintsSeladas(snapshots, ano, maxSprints);
    const base = seladas.map((s) => {
      const escopo = s.category_breakdown!.geral;
      return {
        sprint: s.sprint_code.split('-')[0],
        entrega: pctDe(concluidoDoEscopo(escopo), escopo.total),
        bug: pctDe(escopo.cats.bug, escopo.total),
        retorno: pctDe(escopo.cats.retorno_qa, escopo.total),
      };
    });
    if (atual) {
      base.push({ sprint: atual.sprint, entrega: atual.entregaPct, bug: atual.bugPct, retorno: atual.retornoPct });
    }
    const pontos = (k: 'entrega' | 'bug' | 'retorno'): Ponto[] =>
      base.map((b, i) => ({ sprint: b.sprint, valor: b[k], emCurso: !!atual && i === base.length - 1 }));
    return { entrega: pontos('entrega'), bug: pontos('bug'), retorno: pontos('retorno'), vazio: base.length === 0 };
  }, [snapshots, ano, maxSprints, atual]);

  return (
    <Card className="h-full flex flex-col min-h-0">
      <div className="flex-none flex items-baseline gap-2.5 px-4 pt-3 pb-1.5">
        <h3 className="text-sm font-semibold">Desempenho &amp; qualidade por sprint</h3>
        <span className="text-[11.5px] text-muted-foreground">
          um painel por meta · bolinha cheia = dentro da meta · tracejado = borda da faixa
        </span>
        {/*
          A base do último ponto é diferente das seladas (foto de fim de sprint ×
          escopo ao vivo), então o degrau nele tem componente de população, não só
          de desempenho. Declarado na tela para não ser lido como queda/melhora.
        */}
        {atual && (
          <span className="ml-auto text-[11px] text-muted-foreground/70">
            {atual.sprint} em curso · base ao vivo · anteriores = fotografia selada
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 px-4 pb-3 flex gap-3">
        {isLoading && series.vazio ? (
          <p className="text-sm text-muted-foreground text-center w-full py-8">Carregando fotografias de sprint…</p>
        ) : (
          <>
            <Painel titulo="ENTREGA" pontos={series.entrega} cor={COR_ENTREGA} tipo="piso" meta={META_ENTREGA_PCT} dominio={100} />
            <Painel titulo="BUG" pontos={series.bug} cor={COR_BUG} tipo="teto" meta={TETO_BUG_PCT} dominio={60} />
            <Painel titulo="RETORNO QA" pontos={series.retorno} cor={COR_RETORNO} tipo="teto" meta={TETO_RETORNO_QA_PCT} dominio={60} />
          </>
        )}
      </div>
    </Card>
  );
}
