import { businessDaysBetween } from '@/lib/sprintCalendar';

/**
 * Metas de Desempenho & Qualidade da Fábrica (KPI.pptx do gestor, slide 2).
 *
 * Vivem em código porque o setor ainda não tem tabela de metas; quando tiver,
 * estas constantes viram o fallback do hook — não o contrário.
 *
 * ATENÇÃO À BASE DE CÁLCULO: os 88% foram desenhados quando entrega era
 * `done ÷ escopo`. Desde 26/07/2026 o indicador conta `done + entregue`
 * (decisão do gestor: mesma régua do gerencial), então o mesmo trabalho marca
 * alguns pontos percentuais a mais. O valor precisa ser recalibrado com o
 * gestor depois que a série nova estiver visível — por isso as telas exibem a
 * base junto da meta.
 */
export const META_ENTREGA_PCT = 88;
export const TETO_BUG_PCT = 30;
export const TETO_RETORNO_QA_PCT = 30;

/** Rodapé padrão das telas que mostram a meta — explicita a troca de base. */
export const NOTA_BASE_META = `meta ${META_ENTREGA_PCT}% definida sobre "done"; base agora done + entregue`;

/** Cor semântica do atingimento: dentro da meta, perto, ou longe. */
export function corEntrega(pct: number): string {
  if (pct >= META_ENTREGA_PCT) return 'hsl(142,71%,42%)';
  if (pct >= META_ENTREGA_PCT - 10) return 'hsl(38,92%,50%)';
  return 'hsl(0,72%,52%)';
}

/** Cor de um indicador de qualidade contra seu teto (menor é melhor). */
export function corQualidade(pct: number, teto: number): string {
  if (pct > teto) return 'hsl(0,72%,52%)';
  if (pct > teto - 8) return 'hsl(38,92%,50%)';
  return 'hsl(142,71%,42%)';
}

export type RitmoSprint = {
  /** Dias úteis totais da sprint. */
  diasUteis: number;
  /** Dias úteis já decorridos (limitado ao fim da sprint). */
  diasDecorridos: number;
  diasRestantes: number;
  /** Itens encerrados por dia útil decorrido. */
  ritmoAtual: number;
  /** Itens/dia necessários no que resta para bater a meta. */
  ritmoNecessario: number;
  /** % que a sprint deveria ter encerrado a esta altura para terminar na meta. */
  esperadoPct: number;
};

/**
 * Ritmo da sprint em curso: o que a TV precisa para dizer "dá ou não dá" antes
 * do fim da sprint. Compara o que já foi encerrado com o que a meta exigiria
 * até hoje, sempre em dias ÚTEIS (mesma janela usada pela capacidade).
 */
export function calcRitmoSprint(params: {
  total: number;
  encerrados: number;
  from: Date;
  to: Date;
  hoje?: Date;
}): RitmoSprint | null {
  const { total, encerrados, from, to } = params;
  const hoje = params.hoje ?? new Date();
  const diasUteis = businessDaysBetween(from, to);
  if (diasUteis <= 0) return null;

  const fim = hoje > to ? to : hoje;
  const diasDecorridos = hoje < from ? 0 : Math.min(diasUteis, businessDaysBetween(from, fim));
  const diasRestantes = Math.max(0, diasUteis - diasDecorridos);

  const alvo = Math.ceil((total * META_ENTREGA_PCT) / 100);
  const faltamParaMeta = Math.max(0, alvo - encerrados);

  return {
    diasUteis,
    diasDecorridos,
    diasRestantes,
    ritmoAtual: diasDecorridos > 0 ? encerrados / diasDecorridos : 0,
    ritmoNecessario: diasRestantes > 0 ? faltamParaMeta / diasRestantes : faltamParaMeta,
    esperadoPct: (diasDecorridos / diasUteis) * META_ENTREGA_PCT,
  };
}
