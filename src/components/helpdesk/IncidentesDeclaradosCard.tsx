import { AlertOctagon, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BlocoCard } from '@/components/executivo/BlocoCard';
import { HEALTH_COLORS, getChartColor } from '@/lib/chartColors';
import {
  useCsIncidentesDeclarados,
  type CsIncidenteDeclarado,
  type CsIncidentesDeclaradosResponse,
  type StatusBucket017,
} from '@/hooks/useCsIncidentesDeclarados';

// ── INC-2 — Incidentes declarados (SGSI/SharePoint) ────────────────────
// Substitui o antigo "Incidentes com parada · priorização", que renderizava
// 4 itens FICTÍCIOS hardcoded (INCIDENTES_PARADA_SEED) como se fossem dado real.
//
// Regra do modo TV (HelpdeskKiosk renderiza a mesma tab): todo indicador tem
// rótulo VISÍVEL, nada de informação só no hover, título do card sem truncar.
//
// Global × Pontual (INC-3) NÃO é renderizado: a lista 017 não tem campo de
// escopo nem de clientes afetados. O rodapé declara a ausência — zero exemplo
// fictício, zero valor sintetizado.

const COR_BUCKET: Record<StatusBucket017, string> = {
  ativo: HEALTH_COLORS.vermelho,
  contornado: HEALTH_COLORS.amarelo,
  resolvido: HEALTH_COLORS.verde,
  outro: HEALTH_COLORS.cinza,
};

/** Semáforo do % dentro do SLA. */
const corSla = (pct: number | null): string =>
  pct == null ? HEALTH_COLORS.cinza
  : pct > 90 ? HEALTH_COLORS.verde
  : pct >= 80 ? HEALTH_COLORS.amarelo
  : HEALTH_COLORS.vermelho;

const fmtInt = (n: number) => n.toLocaleString('pt-BR');
/** null → '—'. Nunca '0,0h' para campo não declarado. */
const fmtHoras = (h: number | null) => (h == null ? '—' : `${h.toFixed(1).replace('.', ',')}h`);
const fmtPct = (p: number | null) => (p == null ? '—' : `${p}%`);
const fmtDia = (iso: string | null) =>
  iso == null ? '—'
  : new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const fmtDataHora = (iso: string | null) =>
  iso == null ? '—'
  : new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });

/** KPI: rótulo à esquerda (sempre visível), número tabular à direita. */
function Stat({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-lg border px-3 py-2">
      <span className="text-[11px] leading-tight text-muted-foreground">{label}</span>
      <span className="font-mono text-lg font-bold leading-none tabular-nums" style={{ color: cor }}>
        {valor}
      </span>
    </div>
  );
}

/** Selo de frescor do espelho — cinza quando saudável, cor só quando desvia. */
function SeloEspelho({ d }: { d?: CsIncidentesDeclaradosResponse }) {
  if (!d) return null;
  const h = d.sincronizadoHaHoras;
  const texto =
    h == null ? 'sem sincronização'
    : h < 24 ? `sincronizado há ${h}h`
    : `sincronizado há ${Math.floor(h / 24)}d`;
  const cor = d.espelhoCritico ? HEALTH_COLORS.vermelho
    : d.espelhoDesatualizado ? HEALTH_COLORS.amarelo
    : undefined;
  return (
    <span className="text-[10px] font-medium leading-none shrink-0" style={{ color: cor }}>
      {texto}
    </span>
  );
}

function LinhaIncidente({ i }: { i: CsIncidenteDeclarado }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border p-2">
      <span
        className="mt-1 h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: COR_BUCKET[i.bucket] }}
      />
      <div className="min-w-0 flex-1">
        {/* sem `truncate`: na TV não existe hover para revelar o resto */}
        <p className="break-words text-xs font-medium leading-tight text-foreground">{i.titulo}</p>
        <p className="text-[10px] leading-tight text-muted-foreground">
          <span className="font-mono">{i.protocolo}</span> · {i.categoria} · {fmtDia(i.criadoEm)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge variant="outline" className="text-[10px]">{i.status}</Badge>
        <span className="font-mono text-[11px] font-bold tabular-nums text-muted-foreground">
          {fmtHoras(i.downtimeHoras)}
        </span>
      </div>
    </div>
  );
}

function CorpoSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((k) => <Skeleton key={k} className="h-12 w-full" />)}
      </div>
      <Skeleton className="h-4 w-2/3" />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {[0, 1, 2, 3].map((k) => <Skeleton key={k} className="h-14 w-full" />)}
      </div>
    </div>
  );
}

function CorpoErro({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 py-4">
      <p className="text-sm font-medium text-foreground">
        Não foi possível ler o espelho do SharePoint SGSI.
      </p>
      <p className="text-xs text-muted-foreground">
        A tabela <span className="font-mono">sgsi_items</span> não respondeu. Tente novamente; se
        persistir, verifique sua sessão (a leitura exige usuário aprovado no hub).
      </p>
      <Button variant="outline" size="sm" className="gap-2" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" />
        Tentar novamente
      </Button>
    </div>
  );
}

/** Empty state: "período vazio" ≠ "espelho não sincronizado". */
function CorpoVazio({ d }: { d: CsIncidentesDeclaradosResponse }) {
  if (d.estado === 'periodo-vazio') {
    return (
      <div className="py-6 text-center">
        <p className="text-sm font-medium text-foreground">
          Nenhum incidente declarado no período.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          O espelho tem {fmtInt(d.totalBase)} incidentes declarados no total — amplie o filtro de
          período para vê-los.
        </p>
      </div>
    );
  }
  if (d.estado === 'espelho-vazio') {
    return (
      <div className="py-6 text-center">
        <p className="text-sm font-medium text-foreground">
          A lista SG-LST-016/017 está sincronizada, mas sem nenhum registro.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Última sincronização: {fmtDataHora(d.sincronizadoEm)}. Nada foi declarado no SharePoint
          SGSI até agora.
        </p>
      </div>
    );
  }
  return (
    <div className="py-6 text-center">
      <p className="text-sm font-medium text-foreground">
        Espelho do SharePoint SGSI indisponível.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        A lista de incidentes (017) não aparece em <span className="font-mono">sgsi_items</span> —
        a sincronização nunca rodou, ou seu usuário não tem permissão de leitura no hub. Peça a um
        admin para executar “Sincronizar SGSI (SharePoint)” no setor Infraestrutura.
      </p>
    </div>
  );
}

function CorpoDados({ d }: { d: CsIncidentesDeclaradosResponse }) {
  const topCategorias = d.porCategoria.slice(0, 4);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Declarados" valor={fmtInt(d.total)} />
        <Stat label="Ativos" valor={fmtInt(d.ativos)} cor={COR_BUCKET.ativo} />
        <Stat label="Contornados" valor={fmtInt(d.contornados)} cor={COR_BUCKET.contornado} />
        <Stat label="Resolvidos" valor={fmtInt(d.resolvidos)} cor={COR_BUCKET.resolvido} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground">
        <span>
          Dentro do SLA:{' '}
          <b className="font-mono tabular-nums" style={{ color: corSla(d.pctDentroSla) }}>
            {fmtPct(d.pctDentroSla)}
          </b>
          {d.pctDentroSla != null && ` (${d.slaDentro} de ${d.slaDentro + d.slaFora} com SLA informado)`}
        </span>
        <span>
          Downtime declarado:{' '}
          <b className="font-mono tabular-nums">{fmtHoras(d.downtimeTotalHoras)}</b>
          {` em ${d.comDowntime} de ${d.total} registros`}
        </span>
        {d.naoClassificados > 0 && (
          <span>
            Status fora dos 3 grupos:{' '}
            <b className="font-mono tabular-nums">{fmtInt(d.naoClassificados)}</b>
          </span>
        )}
      </div>

      {topCategorias.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>Categorias:</span>
          {topCategorias.map((c, idx) => (
            <span key={c.name} className="inline-flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: getChartColor(idx) }}
              />
              {c.name}
              <b className="font-mono tabular-nums">{fmtInt(c.value)}</b>
            </span>
          ))}
        </div>
      )}

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Últimos declarados
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {d.recentes.map((i) => <LinhaIncidente key={i.id} i={i} />)}
        </div>
      </div>
    </div>
  );
}

export function IncidentesDeclaradosCard({
  dataInicio, dataFim,
}: { dataInicio: Date; dataFim: Date }) {
  const { data, isLoading, isError, refetch } = useCsIncidentesDeclarados(dataInicio, dataFim);

  return (
    <BlocoCard
      icon={AlertOctagon}
      titulo="Incidentes Declarados"
      className="lg:col-span-3"
      headerRight={<SeloEspelho d={data} />}
    >
      {isLoading ? (
        <CorpoSkeleton />
      ) : isError || !data ? (
        <CorpoErro onRetry={() => { void refetch(); }} />
      ) : data.estado === 'ok' ? (
        <CorpoDados d={data} />
      ) : (
        <CorpoVazio d={data} />
      )}

      <div className="border-t pt-2 text-[10px] leading-relaxed text-muted-foreground/80">
        <p>
          Origem: <b>SharePoint SGSI</b> · lista SG-LST-016/017 (declaração manual) — incidentes com
          parada <b>não são coletados automaticamente</b>.
        </p>
        <p>
          Período pela data de criação do registro no SharePoint; o campo de data do formulário é
          texto livre e não é parseável.
          {data?.sincronizadoEm && ` Última sincronização: ${fmtDataHora(data.sincronizadoEm)}.`}
          {data?.truncado && ` Exibindo ${fmtInt(data.limite)} de ${fmtInt(data.total)} registros do período.`}
        </p>
        <p>
          Escopo <b>Global × Pontual</b> não é exibido: a lista 017 não tem campo de escopo nem de
          clientes afetados — depende de coluna nova no SharePoint.
        </p>
      </div>
    </BlocoCard>
  );
}
