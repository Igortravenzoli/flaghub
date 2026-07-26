import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { useSprintSnapshots } from '@/hooks/useSprintSnapshots';
import { serieEntregaGeral, pctDe, type PontoEntrega } from '@/lib/fabricaTvSeries';
import { META_ENTREGA_PCT, NOTA_BASE_META, TETO_BUG_PCT, TETO_RETORNO_QA_PCT } from '@/lib/fabricaMetas';

/** Dados ao vivo da sprint aberta — entra como última faixa, tracejada. */
export type SprintAtualRegua = {
  /** Rótulo curto, ex.: "S15". */
  sprint: string;
  total: number;
  concluido: number;
  bugPct: number;
  retornoPct: number;
  diaAtual?: number;
  diasUteis?: number;
  /** Itens/dia necessários no que resta para bater a meta. */
  ritmoNecessario?: number;
};

type Props = {
  /** Sprints seladas exibidas (o telão comporta 3 + a em curso). */
  maxSprints?: number;
  atual?: SprintAtualRegua | null;
};

/**
 * Régua de entrega por sprint (modo TV).
 *
 * Substitui o gráfico cartesiano da página 1: cada sprint é uma faixa que usa a
 * largura inteira do telão e o marcador de meta cai na MESMA coluna em todas
 * elas — a 5 m o gestor lê "passou/não passou" pela posição, antes de ler o
 * número. O gráfico antigo desperdiçava ~85% da área com 3 barras de 56px e
 * empilhava entrega (79–91%) e qualidade (12–33%) no mesmo eixo 0–100%.
 */
export function EntregaSprintReguaCard({ maxSprints = 3, atual = null }: Props) {
  const { data: snapshots = {}, isLoading } = useSprintSnapshots();
  const ano = new Date().getFullYear();

  const seladas = useMemo(
    () => serieEntregaGeral(snapshots, { ano, maxSprints }),
    [snapshots, ano, maxSprints],
  );

  const faixas: PontoEntrega[] = useMemo(() => {
    if (!atual || atual.total <= 0) return seladas;
    return [
      ...seladas,
      {
        sprint: atual.sprint,
        code: atual.sprint,
        total: atual.total,
        concluido: atual.concluido,
        pct: pctDe(atual.concluido, atual.total),
        bugPct: atual.bugPct,
        retornoPct: atual.retornoPct,
        emCurso: true,
      },
    ];
  }, [seladas, atual]);

  return (
    <Card className="h-full flex flex-col min-h-0">
      <div className="flex-none flex items-baseline justify-between px-4 pt-3 pb-1">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold">Entrega por sprint</h3>
          <span className="text-[11px] text-muted-foreground">
            itens encerrados (done + entregue) ÷ escopo · fotografia selada
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground">
          marca tracejada = <span className="font-semibold text-foreground">meta {META_ENTREGA_PCT}%</span>
          <span className="ml-2 text-[10px] opacity-70">{NOTA_BASE_META}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-4 pb-3 pt-0.5 flex flex-col gap-[7px]">
        {isLoading && faixas.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Carregando fotografias de sprint…</p>
        )}
        {!isLoading && faixas.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Sem fotografias de sprint para a régua.</p>
        )}
        {faixas.map((f) => (
          <Faixa key={f.code} ponto={f} atual={f.emCurso ? atual : null} />
        ))}
      </div>
    </Card>
  );
}

function gradienteEntrega(pct: number): string {
  if (pct >= META_ENTREGA_PCT) return 'linear-gradient(90deg, hsl(142 71% 20%), hsl(142 71% 42%))';
  if (pct >= META_ENTREGA_PCT - 10) return 'linear-gradient(90deg, hsl(38 92% 24%), hsl(38 92% 48%))';
  return 'linear-gradient(90deg, hsl(0 72% 24%), hsl(0 72% 50%))';
}

function fmt(n: number, casas = 1): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

function Faixa({ ponto, atual }: { ponto: PontoEntrega; atual: SprintAtualRegua | null }) {
  const largura = Math.max(0, Math.min(100, ponto.pct));
  const delta = Math.round(ponto.pct - META_ENTREGA_PCT);
  const faltaAteMeta = Math.max(0, META_ENTREGA_PCT - largura);
  const bugEstourou = ponto.bugPct > TETO_BUG_PCT;
  const retornoEstourou = ponto.retornoPct > TETO_RETORNO_QA_PCT;

  return (
    <div className="flex-1 min-h-0 flex items-center gap-3">
      <div className={`w-[54px] shrink-0 text-[19px] font-extrabold ${ponto.emCurso ? '' : 'text-muted-foreground'}`}>
        {ponto.sprint}
      </div>

      <div
        className={`relative flex-1 h-full min-w-0 rounded-lg bg-black/30 flex items-center ${
          ponto.emCurso ? 'border border-dashed border-[#33507F]' : 'border border-border'
        }`}
      >
        <span
          className="absolute inset-y-0 left-0 rounded-[7px]"
          style={{ width: `${largura}%`, background: gradienteEntrega(ponto.pct), opacity: ponto.emCurso ? 0.78 : 1 }}
        />
        {/* Hachura: o que ainda falta para a meta na sprint que está rodando. */}
        {ponto.emCurso && faltaAteMeta > 0 && (
          <span
            className="absolute inset-y-0"
            style={{
              left: `${largura}%`,
              width: `${faltaAteMeta}%`,
              background: 'repeating-linear-gradient(135deg, rgba(33,196,93,.22) 0 8px, transparent 8px 16px)',
            }}
          />
        )}
        <span
          className="absolute -inset-y-1 border-l-[3px] border-dashed border-white/60"
          style={{ left: `${META_ENTREGA_PCT}%` }}
        />

        <div className="relative flex items-center gap-4 pl-4 min-w-0">
          <span className="text-[32px] font-black leading-none font-mono">{Math.round(ponto.pct)}%</span>
          {ponto.emCurso ? (
            <span className="text-[13px] text-white/80 truncate">
              em curso
              {atual?.diaAtual != null && atual?.diasUteis != null && ` · dia ${atual.diaAtual} de ${atual.diasUteis}`}
              {' · '}
              {ponto.concluido} de {ponto.total} itens · hachura = o que falta p/ meta
            </span>
          ) : (
            <span className="text-[13px] text-white/80 truncate">
              bug <b className={bugEstourou ? 'text-[#FFB4B4]' : ''}>{Math.round(ponto.bugPct)}%{bugEstourou && ' ✗ teto'}</b>
              {' · '}
              retorno QA <b className={retornoEstourou ? 'text-[#FFB4B4]' : ''}>{Math.round(ponto.retornoPct)}%{retornoEstourou && ' ✗ teto'}</b>
            </span>
          )}
        </div>
      </div>

      <div className="w-[116px] shrink-0 text-[13px] font-bold text-right">
        {ponto.emCurso ? (
          atual?.ritmoNecessario != null ? (
            <span className="text-[hsl(38,92%,50%)]">{fmt(atual.ritmoNecessario)} itens/dia</span>
          ) : (
            <span className="text-muted-foreground">em curso</span>
          )
        ) : (
          <span className={delta >= 0 ? 'text-[hsl(142,71%,42%)]' : 'text-[hsl(0,72%,52%)]'}>
            {delta >= 0 ? '+' : '−'}{Math.abs(delta)}pp da meta
          </span>
        )}
      </div>
    </div>
  );
}
