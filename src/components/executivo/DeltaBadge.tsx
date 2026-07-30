import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { HEALTH_COLORS } from '@/lib/chartColors';
import { COR_TOM, arredondaVariacao, avaliarVariacao, fmtVariacao } from '@/lib/variacao';

/**
 * Badge de variação mês a mês: ▲/▼/— + valor.
 *
 * REGRA CENTRAL: a SETA indica a DIREÇÃO do número; a COR indica se essa direção
 * é BOA ou RUIM. A versão anterior (inline em `HelpdeskExecutivoTab`) pintava de
 * verde sempre que `pct > 0` — mostrava "TTR subiu 12%" em verde e "TTR caiu 12%"
 * em vermelho, exatamente invertido para um indicador menor-é-melhor.
 *
 * Todos os insumos vêm PRONTOS do gateway (`/api/gestao/sla-mensal`) — o front
 * não recalcula delta, para não divergir da planilha por arredondamento:
 *   TTR    → variacao={ttr.variacaoPct}   menorMelhor={ttr.menorMelhor}   unidade={ttr.unidadeVariacao}   // true,  '%'
 *   TTR24h → variacao={ttr24h.variacaoPp} menorMelhor={ttr24h.menorMelhor} unidade={ttr24h.unidadeVariacao} // false, 'p.p.'
 */

export function DeltaBadge({
  variacao,
  menorMelhor,
  unidade,
  neutro = false,
  casas = 1,
  semBaseTexto = '—',
  semBaseTitulo = 'Sem base de comparação no período anterior',
  aria,
}: {
  /** Variação já calculada pelo backend. `null`/`undefined` = sem base de comparação. */
  variacao: number | null | undefined;
  /** true = cair é melhorar (TTR em dias). false = subir é melhorar (% ≤24h). */
  menorMelhor: boolean;
  /** '%' para variação percentual · 'p.p.' para variação entre percentuais · 'd' para dias. */
  unidade: string;
  /** Meta não definida → não julga: cinza, mantendo a seta da direção. */
  neutro?: boolean;
  casas?: number;
  /**
   * Texto de "sem base". Default '—' (regra dura: null nunca vira 0).
   * Os cards de SLA passam "sem base" porque, num slot de variação, um '—' isolado
   * se confunde com "métrica ausente"; aqui a métrica existe, o comparativo não.
   */
  semBaseTexto?: string;
  semBaseTitulo?: string;
  /** Leitura para leitor de tela / tooltip. Redundância, nunca fonte única. */
  aria?: string;
}) {
  const v = arredondaVariacao(variacao, casas);
  const av = avaliarVariacao(v, menorMelhor);

  // null ≠ 0: "sem base" nunca vira 0,0% (regra dura #4)
  if (av == null || v == null) {
    return (
      <span
        className="inline-flex items-center justify-end gap-1 text-xs font-semibold"
        style={{ color: HEALTH_COLORS.cinza }}
        /* `data-tom` expõe a semântica (tom) para teste e depuração: em jsdom a
           cor `hsl(var(--token))` é descartada pelo parser de CSS, então cor não
           serve de asserção confiável para o caso cinza. */
        data-tom="sem-base"
        aria-label={`variação indisponível — ${semBaseTitulo}`}
        title={semBaseTitulo}
      >
        <Minus className="h-3 w-3 shrink-0" aria-hidden />{semBaseTexto}
      </span>
    );
  }

  const Icon = av.direcao === 'sobe' ? TrendingUp : av.direcao === 'desce' ? TrendingDown : Minus;
  const cor = neutro ? HEALTH_COLORS.cinza : COR_TOM[av.tom];
  const texto = fmtVariacao(v, unidade, casas);
  const leitura = neutro
    ? 'sem meta definida'
    : av.tom === 'neutro' ? 'estável' : av.tom === 'bom' ? 'melhora' : 'piora';
  const titulo = aria ?? `vs mês anterior: ${texto} (${leitura})`;

  return (
    <span
      className="inline-flex items-center justify-end gap-1 text-xs font-semibold tabular-nums"
      style={{ color: cor }}
      data-tom={neutro ? 'neutro' : av.tom}
      aria-label={`variação ${texto} — ${leitura}`}
      title={titulo}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />{texto}
    </span>
  );
}
