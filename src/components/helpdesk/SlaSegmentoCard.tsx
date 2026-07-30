import type { ReactNode } from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { BlocoCard, SeloCalculado } from '@/components/executivo/BlocoCard';
import { DeltaBadge } from '@/components/executivo/DeltaBadge';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { HEALTH_COLORS } from '@/lib/chartColors';
import { fmtDataIso, fmtMesAno } from '@/lib/formatMes';
import { DASH, corStatus, fmtDias, fmtInt, fmtPct, rotuloStatus } from '@/lib/slaFormat';
import {
  useGestaoSlaNestleDetalhe,
  type GestaoSlaMensalResponse,
  type SlaMensalStatusAnual,
} from '@/hooks/useGestaoKpis';

/* ─────────────────────────────────────────────────────────────────────────
 * SLA-3/4/5/8 — card de SLA por segmento (mês atual · mês anterior · ano).
 *
 * Regras que este arquivo materializa:
 *  · `null` do contrato = "sem base" → renderiza '—', NUNCA 0 (checagem
 *    explícita de null/undefined; `0 ?? '—'` seria bug — 0,00 dia é caso real
 *    com DATEDIFF(DAY)).
 *  · Nada é dirigido por `segmento === 'heineken'`: quem manda é o DADO
 *    (`metas.metaDefinida`, `abertos.incMaior5Dias == null`). Segmento novo
 *    entra sem tocar no componente.
 *  · O semáforo NÃO é recalculado no front: vem de `ttr.statusAnual` /
 *    `ttr24h.statusAnual` (a escada já está no gateway). Mês atual e mês
 *    anterior ficam sem cor semântica de propósito — o contrato só qualifica
 *    o anual, e recalcular no front recriaria a divergência de fórmula que
 *    este trabalho existe para eliminar.
 *  · Janela de CALENDÁRIO: o card não responde ao filtro de período da tela, e
 *    isso aparece no selo do header + no rótulo de cada métrica (SLA-8).
 *  · Modo TV: todo rótulo visível, nada essencial só no hover, nada truncado.
 * ──────────────────────────────────────────────────────────────────────── */

// Formatação (`fmtDias`/`fmtPct`/`fmtInt`) e semáforo (`corStatus`/`rotuloStatus`)
// vivem em `@/lib/slaFormat` — pura e testável sem render.

// ── Peças ────────────────────────────────────────────────────────────────

function MetricaCelula({ rotulo, periodo, valor, cor, sub }: {
  rotulo: string; periodo: string; valor: string; cor?: string; sub?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-xs font-mono tabular-nums text-muted-foreground">{periodo}</p>
      <p
        className="text-xl font-bold font-mono tabular-nums leading-tight"
        style={cor ? { color: cor } : undefined}
      >
        {valor}
      </p>
      {/* min-h fixo mantém a 4ª linha alinhada entre as 3 células, mesmo vazia */}
      <div className="min-h-4 text-xs">{sub}</div>
    </div>
  );
}

function GrupoMetrica({ titulo, status, children }: {
  titulo: string; status: SlaMensalStatusAnual; children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <Badge
          variant="outline"
          className="border-current text-xs font-semibold shrink-0"
          style={{ color: corStatus(status) }}
        >
          {rotuloStatus(status)}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-1 text-right">{children}</div>
    </div>
  );
}

function ValorAging({ texto, valor, destaque, onClick }: {
  texto: string; valor: number | null | undefined; destaque?: boolean; onClick?: () => void;
}) {
  const conteudo = (
    <>
      {texto}:{' '}
      <span
        className="font-mono tabular-nums font-semibold"
        style={destaque && valor != null && valor > 0 ? { color: HEALTH_COLORS.vermelho } : undefined}
      >
        {fmtInt(valor)}
      </span>
    </>
  );
  if (!onClick) return <span>{conteudo}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-sm"
    >
      {conteudo}
    </button>
  );
}

// ── Drill-down de INC ────────────────────────────────────────────────────

export interface SlaIncDrillAlvo {
  filtro: 'inc5' | 'inc30';
  label: string;
  /** Nº que o CARD mostra — necessário para "primeiros 500 de 812" quando truncado. */
  totalCard: number;
}

/**
 * Sheet do drill-down. Montado sempre, `enabled` só quando há alvo (mesmo padrão
 * do GestaoSlaPanel). Não reusei o `OsDetalheDrawer` de lá porque ele não é
 * exportado, é hardcoded em 11 hooks por tipo/filtro e ignora `truncado` — o
 * reuso custaria refatorar componente compartilhado.
 */
export function SlaIncDetalheSheet({ alvo, onClose }: { alvo: SlaIncDrillAlvo | null; onClose: () => void }) {
  const q = useGestaoSlaNestleDetalhe(alvo?.filtro ?? 'inc5', alvo != null);
  const items = q.data?.items ?? [];
  const truncado = q.data?.truncado === true;

  return (
    <Sheet open={alvo != null} onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="text-sm font-semibold">{alvo?.label ?? ''}</SheetTitle>
          {q.data && (
            <p className="text-xs text-muted-foreground">
              {truncado
                /* Sem esta frase o card diz 812 e a lista diz 500, sem nada explicando. */
                ? `primeiros ${fmtInt(q.data.limite)} de ${fmtInt(alvo?.totalCard)} INC do card`
                : `${fmtInt(q.data.total)} INC`}
            </p>
          )}
        </SheetHeader>
        <ScrollArea className="flex-1">
          {q.isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : q.isError ? (
            <DashboardEmptyState
              variant="error"
              description="Não foi possível carregar o detalhe das INC. Verifique a VPN e tente novamente."
              onRetry={() => q.refetch()}
            />
          ) : items.length === 0 ? (
            <DashboardEmptyState description="Nenhuma INC em aberto nesta faixa de aging." />
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background border-b border-border">
                <tr className="text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">OS</th>
                  <th className="px-3 py-2 text-left font-medium">Cliente</th>
                  <th className="px-3 py-2 text-left font-medium">Sistema</th>
                  <th className="px-3 py-2 text-right font-medium">Dias</th>
                  <th className="px-3 py-2 text-left font-medium">Ticket</th>
                </tr>
              </thead>
              <tbody>
                {items.map((os) => (
                  <tr key={os.os} className="border-b border-border/40">
                    <td className="px-3 py-2 font-mono tabular-nums">{os.os}</td>
                    <td className="px-3 py-2">{os.apelido}</td>
                    <td className="px-3 py-2 text-muted-foreground">{os.sistema ?? DASH}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtInt(os.diasAberto)}d</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{os.ticket ?? DASH}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────

export interface SlaSegmentoCardProps {
  /** Rótulo visível: "Nestlé" | "Heineken" | "Outras Bandeiras". */
  titulo: string;
  data: GestaoSlaMensalResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  /** Ausente = rodapé sem clique (é assim no modo TV). */
  onDrillInc?: (alvo: SlaIncDrillAlvo) => void;
}

export function SlaSegmentoCard({
  titulo, data, isLoading, isError, refetch, onDrillInc,
}: SlaSegmentoCardProps) {
  if (isError) {
    return (
      <DashboardEmptyState
        variant="error"
        title={`SLA ${titulo} — erro ao carregar`}
        description="O gateway não respondeu. Confirme a VPN da Flag e tente novamente."
        onRetry={refetch}
      />
    );
  }

  if (isLoading) {
    return (
      // Mantém o frame com header: o layout não pula quando os 3 cards resolvem
      // em tempos diferentes.
      <BlocoCard icon={ShieldCheck} titulo={`SLA ${titulo}`}>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-8 w-full" />
      </BlocoCard>
    );
  }

  if (!data) {
    // react-query com retry:1 pode terminar sem data e sem isError (ex.: mock
    // ausente). Sem este ramo daria crash no destructuring abaixo.
    return (
      <DashboardEmptyState
        title={`SLA ${titulo} — sem retorno`}
        description="O gateway não devolveu dados para este segmento. Recarregue; se persistir, confira /api/gestao/sla-mensal."
        onRetry={refetch}
      />
    );
  }

  const { referencia: ref, metas, ttr, ttr24h, abertos, volumes, qualidade } = data;
  const mAtual = fmtMesAno(ref.mesAtual);
  const mAnt = fmtMesAno(ref.mesAnterior);
  const rotAno = String(ref.ano);

  // DADO, não segmento: Heineken não usa ServiceNow, então o gateway manda
  // incMaior* null e o rodapé cai para OS em aberto.
  const temInc = abertos.incMaior5Dias != null || abertos.incMaior30Dias != null;

  // Com mês anterior = 0 (real no DATEDIFF(DAY)) o backend manda variacaoPct
  // null e variacaoDias definida. Cair para dias evita dizer "sem base" tendo base.
  const ttrVarValor = ttr.variacaoPct ?? ttr.variacaoDias;
  const ttrVarUnid = ttr.variacaoPct != null ? ttr.unidadeVariacao : 'd';

  const avisos: string[] = [];
  if (qualidade.osDuplicadasJanela > 0) {
    avisos.push(`${fmtInt(qualidade.osDuplicadasJanela)} OS duplicadas na janela do cálculo (TTR com peso duplicado)`);
  }
  if (qualidade.ttrNegativoMesAtual > 0) {
    avisos.push(`${fmtInt(qualidade.ttrNegativoMesAtual)} OS com TTR negativo em ${mAtual} (baixa anterior à abertura)`);
  }

  const semBase =
    volumes.fechadosMesAtual === 0 && volumes.fechadosMesAnterior === 0 && volumes.fechadosAno === 0;

  const tituloJanela = [
    `Mês atual: ${fmtDataIso(ref.inicioMesAtual)} a ${fmtDataIso(ref.hoje)} (hoje = relógio do gateway)`,
    `Mês anterior: ${mAnt} completo`,
    `Ano: ${fmtDataIso(ref.inicioAno)} a ${fmtDataIso(ref.hoje)}`,
    `Fim da janela (exclusivo): ${fmtDataIso(ref.fimJanelaExclusivo)}`,
    `Fórmula: ${data.formulaVersao}`,
    'Janela de calendário — não responde ao filtro de período da tela.',
  ].join('\n');

  const metaTtrTexto = metas.metaTTRDias == null ? null : `meta ≤ ${fmtDias(metas.metaTTRDias)}`;
  const meta24hTexto = metas.metaTTR24hPct == null ? null : `meta ≥ ${fmtPct(metas.metaTTR24hPct)}`;

  return (
    <BlocoCard
      icon={ShieldCheck}
      titulo={`SLA ${titulo}`}
      headerRight={<SeloCalculado texto={`${mAtual} · fora do filtro`} janela={tituloJanela} />}
    >
      <GrupoMetrica titulo="TTR (dias)" status={ttr.statusAnual}>
        <MetricaCelula
          rotulo="mês atual" periodo={mAtual} valor={fmtDias(ttr.mesAtual)}
          sub={
            <DeltaBadge
              variacao={ttrVarValor}
              unidade={ttrVarUnid}
              menorMelhor={ttr.menorMelhor}
              semBaseTexto="sem base"
              semBaseTitulo={`Sem ${mAnt} comparável (sem OS fechada ou base zero).`}
              aria={`TTR de ${mAtual} em relação a ${mAnt} — queda é melhora`}
            />
          }
        />
        <MetricaCelula rotulo="mês anterior" periodo={mAnt} valor={fmtDias(ttr.mesAnterior)} />
        <MetricaCelula
          rotulo="ano (média)" periodo={rotAno} valor={fmtDias(ttr.anual)}
          cor={corStatus(ttr.statusAnual)}
          sub={<span className="text-muted-foreground">{metaTtrTexto ?? 'sem meta'}</span>}
        />
      </GrupoMetrica>

      <GrupoMetrica titulo="TTR 24h (%)" status={ttr24h.statusAnual}>
        <MetricaCelula
          rotulo="mês atual" periodo={mAtual} valor={fmtPct(ttr24h.mesAtual)}
          sub={
            <DeltaBadge
              variacao={ttr24h.variacaoPp}
              unidade={ttr24h.unidadeVariacao}
              menorMelhor={ttr24h.menorMelhor}
              semBaseTexto="sem base"
              semBaseTitulo={`Sem ${mAnt} comparável (sem OS fechada ou base zero).`}
              aria={`%24h de ${mAtual} em relação a ${mAnt} — alta é melhora`}
            />
          }
        />
        <MetricaCelula rotulo="mês anterior" periodo={mAnt} valor={fmtPct(ttr24h.mesAnterior)} />
        <MetricaCelula
          rotulo="ano (média)" periodo={rotAno} valor={fmtPct(ttr24h.anual)}
          cor={corStatus(ttr24h.statusAnual)}
          sub={<span className="text-muted-foreground">{meta24hTexto ?? 'sem meta'}</span>}
        />
      </GrupoMetrica>

      <div className="border-t pt-2 space-y-1">
        <p className="text-xs text-muted-foreground">
          OS fechadas · {mAtual}{' '}
          <span className="font-mono tabular-nums text-foreground">{fmtInt(volumes.fechadosMesAtual)}</span>
          {' · '}{mAnt}{' '}
          <span className="font-mono tabular-nums text-foreground">{fmtInt(volumes.fechadosMesAnterior)}</span>
          {' · '}{rotAno}{' '}
          <span className="font-mono tabular-nums text-foreground">{fmtInt(volumes.fechadosAno)}</span>
        </p>

        {temInc ? (
          <p className="text-xs text-muted-foreground">
            INC em aberto ·{' '}
            <ValorAging
              texto="> 5 dias" valor={abertos.incMaior5Dias}
              onClick={onDrillInc && abertos.incMaior5Dias != null
                ? () => onDrillInc({
                    filtro: 'inc5',
                    label: `SLA ${titulo} — INC em aberto > 5 dias`,
                    totalCard: abertos.incMaior5Dias ?? 0,
                  })
                : undefined}
            />
            {' · '}
            <ValorAging
              texto="> 30 dias" valor={abertos.incMaior30Dias} destaque
              onClick={onDrillInc && abertos.incMaior30Dias != null
                ? () => onDrillInc({
                    filtro: 'inc30',
                    label: `SLA ${titulo} — INC em aberto > 30 dias`,
                    totalCard: abertos.incMaior30Dias ?? 0,
                  })
                : undefined}
            />
          </p>
        ) : (
          /* Segmento sem ticket ServiceNow (incMaior* null): OS em aberto no lugar de INC. */
          <p className="text-xs text-muted-foreground">
            OS em aberto · <ValorAging texto="total" valor={abertos.totalAbertos} />
            {' · '}<ValorAging texto="> 30 dias" valor={abertos.maior30Dias} destaque />
          </p>
        )}

        {avisos.length > 0 && (
          <p className="flex items-start gap-1 text-xs" style={{ color: HEALTH_COLORS.amarelo }}>
            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" aria-hidden />
            <span>Lançamento inconsistente: {avisos.join(' · ')}</span>
          </p>
        )}

        {semBase && (
          <p className="text-xs text-muted-foreground">
            Sem OS fechada em {mAtual}, {mAnt} nem em {rotAno} — confira a janela no selo do card
            ou a sincronização do VDESK.
          </p>
        )}
      </div>
    </BlocoCard>
  );
}
