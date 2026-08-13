import { useMemo } from 'react';

/**
 * Horas lançadas por dia, com barra clicável que filtra o dia inteiro.
 *
 * SVG à mão em vez de recharts: são barras simples num card estreito, e o
 * recharts traria ResponsiveContainer e tooltip próprio só para reimplementar
 * o que trinta linhas resolvem — além de trazer um segundo vocabulário visual
 * para uma tela que já tem os rankings desenhados em CSS.
 */

const LARGURA = 760;
const ALTURA = 160;
const PAD_BAIXO = 20;
const PAD_TOPO = 6;

export function GraficoDiario({
  serie, diaSelecionado, onSelecionarDia,
}: {
  serie: Array<{ dia: string; horas: number }>;
  diaSelecionado: string | null;
  onSelecionarDia: (dia: string | null) => void;
}) {
  const { max, larguraBarra, rotulos } = useMemo(() => {
    const m = Math.max(1, ...serie.map((d) => d.horas));
    const lb = serie.length > 0 ? LARGURA / serie.length : LARGURA;
    // Um rótulo a cada ~7 posições mantém o eixo legível em mês cheio e em
    // período curto, sem calcular densidade de texto.
    const passo = Math.max(1, Math.ceil(serie.length / 5));
    const r = serie.map((d, i) => (i % passo === 0 ? i : -1)).filter((i) => i >= 0);
    return { max: m, larguraBarra: lb, rotulos: r };
  }, [serie]);

  if (serie.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
        Nenhuma hora lançada no período.
      </div>
    );
  }

  const alturaUtil = ALTURA - PAD_BAIXO - PAD_TOPO;

  return (
    <svg
      viewBox={`0 0 ${LARGURA} ${ALTURA}`}
      className="w-full h-auto"
      role="img"
      aria-label="Horas lançadas por dia no período"
    >
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={0} x2={LARGURA}
          y1={PAD_TOPO + alturaUtil * (1 - f)}
          y2={PAD_TOPO + alturaUtil * (1 - f)}
          className="stroke-border"
          strokeWidth={1}
        />
      ))}

      {serie.map((d, i) => {
        const alt = alturaUtil * (d.horas / max);
        const ativo = diaSelecionado === d.dia;
        return (
          <g
            key={d.dia}
            role="button"
            tabIndex={0}
            aria-label={`${d.dia}: ${d.horas.toFixed(1)} horas`}
            className="cursor-pointer focus:outline-none"
            onClick={() => onSelecionarDia(ativo ? null : d.dia)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelecionarDia(ativo ? null : d.dia);
              }
            }}
          >
            <rect
              x={i * larguraBarra + 1.5}
              y={PAD_TOPO + (alturaUtil - alt)}
              width={Math.max(1, larguraBarra - 3)}
              height={Math.max(alt, 1.5)}
              rx={2}
              className={ativo ? 'fill-flag-gold' : 'fill-primary hover:opacity-75'}
            />
            <title>{`${d.dia.slice(8)}/${d.dia.slice(5, 7)} — ${d.horas.toFixed(1)} h`}</title>
          </g>
        );
      })}

      {rotulos.map((i) => (
        <text
          key={i}
          x={i * larguraBarra + larguraBarra / 2}
          y={ALTURA - 5}
          textAnchor="middle"
          fontSize={10}
          className="fill-muted-foreground"
        >
          {serie[i].dia.slice(8)}
        </text>
      ))}
    </svg>
  );
}
