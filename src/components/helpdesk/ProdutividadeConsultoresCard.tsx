import { Gauge } from 'lucide-react';
import { BlocoCard } from '@/components/executivo/BlocoCard';
import { Skeleton } from '@/components/ui/skeleton';
import { HEALTH_COLORS } from '@/lib/chartColors';
import { faixaCorProd, useProdutividadeConsultores } from '@/hooks/useProdutividadeConsultores';

/**
 * PRD-1 — Produtividade dos Consultores (uso de perto, com scroll).
 *
 * O merge dos 3 endpoints — e o porquê de a média vir do GATEWAY sobre dias
 * úteis, nunca da média aritmética dos dias com lançamento — vive em
 * `useProdutividadeConsultores` (07/08/2026), compartilhado com a TV do CS
 * (`CsTvView`). Aqui fica só a renderização de mesa: heatmap completo com
 * tooltip e rolagem horizontal, coisas que a TV não pode ter.
 */

export function ProdutividadeConsultoresCard({ dataInicio, dataFim }: { dataInicio: Date; dataFim: Date }) {
  return (
    <BlocoCard icon={Gauge} titulo="Produtividade dos Consultores">
      <ProdutividadeConsultores dataInicio={dataInicio} dataFim={dataFim} />
    </BlocoCard>
  );
}

function ProdutividadeConsultores({ dataInicio, dataFim }: { dataInicio: Date; dataFim: Date }) {
  const {
    dias, linhas, temAcima100, isLoading, falhouTudo, falhouMedia, refetchTudo, refetchMedia,
  } = useProdutividadeConsultores(dataInicio, dataFim);

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
          onClick={refetchTudo}
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
            onClick={refetchMedia}
            className="text-[10px] font-medium text-primary hover:underline"
          >
            Média por dias úteis indisponível — tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}
