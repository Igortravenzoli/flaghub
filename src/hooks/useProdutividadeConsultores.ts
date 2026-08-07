import { useMemo } from 'react';
import { HEALTH_COLORS } from '@/lib/chartColors';
import { normalizaNome } from '@/lib/csConsultores';
import {
  useTechLeadPorDia,
  useTechLeadConsultorSistemas,
  useTechLeadConsultorInfra,
} from '@/hooks/useTechLeadKpis';

/**
 * PRD-1 — merge da produtividade dos consultores (média por dias úteis + heatmap).
 *
 * Promovido de `ProdutividadeConsultoresCard.tsx` (07/08/2026): a TV do CS
 * (`CsTvView`) consome os MESMOS 3 endpoints com os mesmos estados de falha
 * parcial — duplicar o merge criaria duas médias divergindo em silêncio.
 *
 * O bug que este merge corrige: a "Média" era a média ARITMÉTICA de
 * `produtividadeDia` só dos dias COM lançamento — um sábado com 40 min entrava
 * como ~8% e derrubava a média; uma segunda sem lançamento a inflava. Agora:
 *  · Heatmap consultor × dia vem de `/api/techlead/por-dia`
 *    (`produtividadeDia` = minutos do dia ÷ 480) — sinal visual.
 *  · Média vem de `/api/techlead/resumo-consultor` (sistemas) e
 *    `/resumo-consultor-infra` (infra), onde o gateway calcula
 *    `(SUM(DuracaoSeg) / TotalDiasUteis) / 28800 × 100` — exclui fim de semana
 *    e feriados. É o número da planilha do Wilker.
 *  · Lista ÚNICA, equipe marcada em TEXTO (`sis`/`infra`) — cor tem papel de
 *    status nesta tela, então equipe não pode ser cor.
 *
 * Pode passar de 100%: o numerador soma TODOS os lançamentos (inclusive fim de
 * semana) e o divisor conta só dias úteis. O clamp é só na LARGURA DA BARRA —
 * o número exibido é o real, porque truncar em 100% esconde o sinal de dado
 * suspeito (`temAcima100` existe para a nota amarela).
 */

export type EquipeProd = 'sistemas' | 'infra';

export interface LinhaProdutividade {
  consultor: string;
  /** dia 'YYYY-MM-DD' → produtividade do dia (minutos ÷ 480, em %). */
  mapa: Map<string, number>;
  /** Média sobre dias úteis do gateway. `null` = sem base (ordena para o FIM). */
  media: number | null;
  equipe: EquipeProd | null;
}

/** Faixa de produtividade: verde ≥ 80% · âmbar ≥ 50% · vermelho < 50%. */
export const faixaCorProd = (p: number) =>
  p >= 80 ? HEALTH_COLORS.verde : p >= 50 ? HEALTH_COLORS.amarelo : HEALTH_COLORS.vermelho;

export function useProdutividadeConsultores(dataInicio: Date, dataFim: Date) {
  const porDia = useTechLeadPorDia(dataInicio, dataFim);
  const sis = useTechLeadConsultorSistemas(dataInicio, dataFim);
  const inf = useTechLeadConsultorInfra(dataInicio, dataFim);

  const isLoading = porDia.isLoading || sis.isLoading || inf.isLoading;
  const falhouTudo = porDia.isError && sis.isError && inf.isError;
  const falhouMedia = sis.isError || inf.isError;

  const { dias, linhas, temAcima100 } = useMemo(() => {
    // média por dias úteis, indexada por nome normalizado (imune a acento/caixa)
    const media = new Map<string, { pct: number; equipe: EquipeProd; nome: string }>();
    for (const c of sis.data?.consultores ?? []) {
      media.set(normalizaNome(c.consultor), { pct: c.produtividade, equipe: 'sistemas', nome: c.consultor });
    }
    for (const c of inf.data?.consultores ?? []) {
      media.set(normalizaNome(c.consultor), { pct: c.produtividade, equipe: 'infra', nome: c.consultor });
    }

    // heatmap dia-a-dia
    const diasSet = new Set<string>();
    const porConsultor = new Map<string, Map<string, number>>();
    for (const r of porDia.data?.registros ?? []) {
      const dia = r.dataRegistro?.slice(0, 10);
      if (!dia) continue;
      diasSet.add(dia);
      if (!porConsultor.has(r.consultor)) porConsultor.set(r.consultor, new Map());
      porConsultor.get(r.consultor)!.set(dia, r.produtividadeDia);
    }
    // união, não interseção: quem tem média mas nenhum dia no por-dia também aparece
    const vistos = new Set([...porConsultor.keys()].map(normalizaNome));
    for (const [chave, v] of media) if (!vistos.has(chave)) porConsultor.set(v.nome, new Map());

    const linhas: LinhaProdutividade[] = [...porConsultor.entries()]
      .map(([consultor, mapa]) => {
        const m = media.get(normalizaNome(consultor));
        return { consultor, mapa, media: m?.pct ?? null, equipe: m?.equipe ?? null };
      })
      // null vai para o FIM: com `?? 0` um consultor sem base ficava à frente de um 0% real
      .sort((a, b) => (b.media ?? -1) - (a.media ?? -1));

    return {
      dias: [...diasSet].sort(),
      linhas,
      temAcima100: linhas.some((l) => l.media != null && l.media > 100),
    };
  }, [porDia.data, sis.data, inf.data]);

  return {
    dias,
    linhas,
    temAcima100,
    isLoading,
    falhouTudo,
    falhouMedia,
    refetchTudo: () => { void porDia.refetch(); void sis.refetch(); void inf.refetch(); },
    refetchMedia: () => { void sis.refetch(); void inf.refetch(); },
  };
}
