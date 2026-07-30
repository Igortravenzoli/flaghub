import { useMemo } from 'react';
import { Gauge } from 'lucide-react';
import { BlocoCard } from '@/components/executivo/BlocoCard';
import { Skeleton } from '@/components/ui/skeleton';
import { HEALTH_COLORS } from '@/lib/chartColors';
import {
  useTechLeadPorDia,
  useTechLeadConsultorSistemas,
  useTechLeadConsultorInfra,
} from '@/hooks/useTechLeadKpis';

/**
 * PRD-1 — Produtividade dos Consultores.
 *
 * O bug que este card corrige: a coluna "Média" era a média ARITMÉTICA de
 * `produtividadeDia` **só dos dias que apareciam em `/api/techlead/por-dia`** —
 * isto é, só dias COM lançamento. Um sábado com 40 min entrava como ~8% e
 * derrubava a média; uma segunda-feira sem lançamento simplesmente não entrava
 * e a inflava. Não era o número da planilha do CS por construção.
 *
 * Agora:
 *  · Heatmap consultor × dia continua vindo de `/api/techlead/por-dia`
 *    (`produtividadeDia` = minutos do dia ÷ 480) — bom sinal visual.
 *  · Coluna "Média · dias úteis" vem de `/api/techlead/resumo-consultor`
 *    (sistemas) e `/resumo-consultor-infra` (infra), onde o gateway calcula
 *    `(SUM(DuracaoSeg) / TotalDiasUteis) / 28800 × 100` — exclui fim de semana
 *    e feriados. É o número da planilha do Wilker.
 *  · Lista ÚNICA, com a equipe marcada em texto (`sis`/`infra`) — cor tem papel
 *    de status nesta tela, então equipe não pode ser cor.
 *
 * Pode passar de 100%: o numerador soma TODOS os lançamentos do período
 * (inclusive fim de semana e feriado) e o divisor conta só dias úteis. O clamp
 * é aplicado só na LARGURA DA BARRA — o número exibido é o real, porque um
 * número truncado em 100% esconde justamente o sinal de dado suspeito.
 */

type EquipeProd = 'sistemas' | 'infra';

/** Faixa de produtividade: verde ≥ 80% · âmbar ≥ 50% · vermelho < 50%.
 *  Valores idênticos aos literais hsl() anteriores, agora via token. */
const faixaCorProd = (p: number) =>
  p >= 80 ? HEALTH_COLORS.verde : p >= 50 ? HEALTH_COLORS.amarelo : HEALTH_COLORS.vermelho;

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function ProdutividadeConsultoresCard({ dataInicio, dataFim }: { dataInicio: Date; dataFim: Date }) {
  return (
    <BlocoCard icon={Gauge} titulo="Produtividade dos Consultores">
      <ProdutividadeConsultores dataInicio={dataInicio} dataFim={dataFim} />
    </BlocoCard>
  );
}

function ProdutividadeConsultores({ dataInicio, dataFim }: { dataInicio: Date; dataFim: Date }) {
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
      media.set(norm(c.consultor), { pct: c.produtividade, equipe: 'sistemas', nome: c.consultor });
    }
    for (const c of inf.data?.consultores ?? []) {
      media.set(norm(c.consultor), { pct: c.produtividade, equipe: 'infra', nome: c.consultor });
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
    const vistos = new Set([...porConsultor.keys()].map(norm));
    for (const [chave, v] of media) if (!vistos.has(chave)) porConsultor.set(v.nome, new Map());

    const linhas = [...porConsultor.entries()]
      .map(([consultor, mapa]) => {
        const m = media.get(norm(consultor));
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

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  if (falhouTudo) {
    // Antes, falha de rede mostrava "Sem dados de produtividade no período" —
    // mentira: não é ausência de dado, é falha de VPN.
    return (
      <div className="py-8 text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          Não foi possível carregar a produtividade. Confirme a VPN da Flag.
        </p>
        <button
          type="button"
          onClick={() => { porDia.refetch(); sis.refetch(); inf.refetch(); }}
          className="text-xs font-medium text-primary hover:underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!linhas.length) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Sem lançamentos de produtividade no período — amplie o filtro de período.
      </p>
    );
  }

  const fmtDia = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit' });

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th className="sticky left-0 bg-background z-10" />
              {dias.map((d) => (
                <th key={d} className="text-[9px] text-muted-foreground font-medium px-0.5" title={d}>{fmtDia(d)}</th>
              ))}
              <th className="text-[9px] text-muted-foreground font-medium pl-2 text-left w-24">Média · dias úteis</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ consultor, mapa, media, equipe }) => (
              <tr key={consultor}>
                <td className="sticky left-0 bg-background z-10 pr-2 text-[11px] font-medium whitespace-nowrap">
                  {consultor}
                  {equipe && (
                    <span className="ml-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                      {equipe === 'infra' ? 'infra' : 'sis'}
                    </span>
                  )}
                </td>
                {dias.map((d) => {
                  const v = mapa.get(d);
                  return (
                    <td key={d} className="p-0">
                      <div
                        className="w-4 h-4 rounded-sm mx-auto"
                        style={{ backgroundColor: v == null ? 'hsl(var(--muted))' : faixaCorProd(v) }}
                        title={v == null ? `${consultor} · ${d}: sem registro` : `${consultor} · ${d}: ${Math.round(v)}%`}
                      />
                    </td>
                  );
                })}
                <td className="pl-2">
                  <div className="flex items-center gap-1">
                    {/* clamp NA BARRA (largura), nunca no número exibido */}
                    <div className="h-2 w-8 rounded-full bg-muted overflow-hidden shrink-0">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(media ?? 0, 100)}%`,
                          backgroundColor: media == null ? 'transparent' : faixaCorProd(media),
                        }}
                      />
                    </div>
                    <span
                      className="text-[11px] font-bold font-mono tabular-nums"
                      style={{ color: media == null ? undefined : faixaCorProd(media) }}
                    >
                      {media == null ? '—' : `${Math.round(media)}%`}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t pt-2 mt-2 space-y-1">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: HEALTH_COLORS.verde }} /> ≥ 80%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: HEALTH_COLORS.amarelo }} /> ≥ 50%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: HEALTH_COLORS.vermelho }} /> &lt; 50%</span>
        </div>
        <p className="text-[10px] text-muted-foreground/80">
          <b>Média = produtividade sobre dias úteis</b> (exclui fim de semana e feriados) — mesma
          base da planilha do CS. Os quadrados são a produtividade do dia sobre jornada de 8h.
          Lista única: <b>sis</b> = equipe de sistemas · <b>infra</b> = equipe de infraestrutura.
        </p>
        {temAcima100 && (
          <p className="text-[10px]" style={{ color: HEALTH_COLORS.amarelo }}>
            Acima de 100% = mais de 8h lançadas por dia útil, em média (inclui lançamento de fim de
            semana, que entra no total mas não no divisor). Conferir sobreposição de lançamentos.
          </p>
        )}
        {falhouMedia && !falhouTudo && (
          <button
            type="button"
            onClick={() => { sis.refetch(); inf.refetch(); }}
            className="text-[10px] font-medium text-primary hover:underline"
          >
            Média por dias úteis indisponível — tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}
