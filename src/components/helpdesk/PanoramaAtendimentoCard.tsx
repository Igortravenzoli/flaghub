import { Headphones } from 'lucide-react';
import { BlocoCard, SeloCalculado } from '@/components/executivo/BlocoCard';
import { Skeleton } from '@/components/ui/skeleton';
import { HEALTH_COLORS } from '@/lib/chartColors';
import { horasHM, tmaCurto } from '@/lib/formatHoras';
import { fmtMesAno } from '@/lib/formatMes';
import { useGestaoCoberturaClientes } from '@/hooks/useGestaoKpis';

/**
 * PAN-1 + PAN-2 — Panorama do Atendimento.
 *
 *  · registros · horas · TMA  → SEGUEM o filtro de período (PAN-1). Vêm por prop,
 *    já resolvidos pelo dashboard (inclusive o filtro de consultores).
 *  · cobertura de clientes    → MÊS CORRENTE, escopo fixo, IGNORA o filtro
 *    (PAN-2) → daí o selo do SLA-8 no header e a frase no rodapé.
 *
 * Horas em h:mm (`horasHM`), decisão de 26/07: "34.7h" foi lido como "34h07"
 * na conferência da S14 quando o real era 34:42.
 *
 * Modo TV: todo número tem rótulo visível; a janela da cobertura está escrita
 * no rodapé em texto, não só no `title` do selo.
 */
export function PanoramaAtendimentoCard({
  totalRegistros,
  totalMinutos,
  consultoresAtivos,
  totalSistemas,
  totalBandeiras,
  clientesNoPeriodo,
}: {
  totalRegistros: number;
  /** MINUTOS BRUTOS — não `totalHoras`: dividir o decimal já arredondado degrada o TMA. */
  totalMinutos: number;
  consultoresAtivos: number;
  totalSistemas: number;
  totalBandeiras: number;
  /** Clientes distintos atendidos DENTRO do filtro de período. */
  clientesNoPeriodo: number;
}) {
  const { data: cob, isLoading, isError, refetch } = useGestaoCoberturaClientes();
  const mesLabel = fmtMesAno(cob?.mesReferencia);   // '—' quando ausente
  const pct = cob?.pctCobertura;                    // null = sem base
  const semClienteAtivo = cob != null && cob.atendidosSemClienteAtivo > 0;

  return (
    <BlocoCard
      icon={Headphones}
      titulo="Panorama do Atendimento"
      headerRight={
        <SeloCalculado
          texto="cobertura fora do filtro"
          janela={`Registros, horas, TMA, consultores, sistemas, bandeiras e clientes no período seguem o filtro da tela.\nA cobertura de clientes é do MÊS CORRENTE (${mesLabel}) e não responde ao filtro.`}
        />
      }
    >
      {/* ── volume · horas · TMA (PAN-1: horas ao lado dos registros) ── */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-3xl font-bold font-mono tabular-nums leading-none">{totalRegistros}</p>
          <p className="text-[11px] text-muted-foreground mt-1">registros no período</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold font-mono tabular-nums leading-none">{horasHM(totalMinutos)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">horas de atendimento</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold font-mono tabular-nums leading-none">
            {tmaCurto(totalMinutos, totalRegistros)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">TMA por atendimento</p>
        </div>
      </div>

      {/* ── abrangência + cobertura ────────────────────────────────────
          A cobertura entra na MESMA faixa (não numa 3ª faixa com borda nova:
          o card já tem 2 `border-t` e um 3º nível violaria o DESIGN-SYSTEM). */}
      <div className="grid grid-cols-5 gap-2 border-t pt-3 text-center">
        <NumPequeno valor={consultoresAtivos} label="consultores" />
        <NumPequeno valor={totalSistemas} label="sistemas" />
        <NumPequeno valor={totalBandeiras} label="bandeiras" />
        <NumPequeno valor={clientesNoPeriodo} label="clientes no período" />
        {/* Skeleton por CÉLULA, não por card: os outros 7 números vêm de props e
            já estão resolvidos — trocar o card inteiro esconderia dado disponível. */}
        {isLoading ? (
          <div>
            <Skeleton className="h-5 w-10 mx-auto" />
            <p className="text-[10px] text-muted-foreground mt-1">cobertura da base</p>
          </div>
        ) : (
          <div>
            <p className="text-lg font-bold font-mono tabular-nums leading-tight">
              {/* null (não 0) quando não há base ativa: ausência de base não é 0% */}
              {pct == null ? '—' : `${Math.round(pct)}%`}
            </p>
            <p className="text-[10px] text-muted-foreground">cobertura da base</p>
          </div>
        )}
      </div>

      {/* ── rodapé: diz qual número obedece ao filtro e qual não ── */}
      <div className="border-t pt-2 space-y-1">
        <p className="text-[10px] text-muted-foreground/80">
          Registros, horas, TMA e abrangência seguem o filtro de período · TMA = horas ÷ registros.
          {' '}Cobertura da base = clientes ativos atendidos no mês corrente ({mesLabel}),
          independente do filtro:{' '}
          {cob
            ? <span className="font-mono tabular-nums text-foreground">{cob.atendidosMes} de {cob.totalClientesAtivos}</span>
            : '—'}
          {' '}clientes ativos.
        </p>
        {isError && (
          <button
            type="button"
            onClick={() => refetch()}
            className="text-[10px] font-medium text-primary hover:underline"
          >
            Cobertura de clientes indisponível (confira a VPN) — tentar novamente
          </button>
        )}
        {semClienteAtivo && (
          <p className="text-[10px]" style={{ color: HEALTH_COLORS.amarelo }}>
            {cob!.atendidosSemClienteAtivo} atendimento(s) sem cliente ativo correspondente —
            grafia divergente entre ATENDIMENTO e CLIENTES.
          </p>
        )}
      </div>
    </BlocoCard>
  );
}

function NumPequeno({ valor, label }: { valor: number; label: string }) {
  return (
    <div>
      <p className="text-lg font-bold font-mono tabular-nums leading-tight">{valor}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
