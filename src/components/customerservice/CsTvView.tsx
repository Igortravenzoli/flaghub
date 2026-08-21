import { useMemo, type ReactNode } from 'react';
import { format } from 'date-fns';
import { usePaginaKiosk } from '@/contexts/KioskRotationContext';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DeltaBadge } from '@/components/executivo/DeltaBadge';
import { corMetaHigh } from '@/components/executivo/BlocoCard';
import {
  COR_BUCKET, SeloEspelho, corSla, fmtHoras,
} from '@/components/helpdesk/IncidentesDeclaradosCard';
import { HEALTH_COLORS } from '@/lib/chartColors';
import { horasHM, tmaCurto } from '@/lib/formatHoras';
import { fmtMesAno } from '@/lib/formatMes';
import { DASH, corStatus, corValorVsMeta, fmtDias, fmtInt, fmtPct, rotuloStatus } from '@/lib/slaFormat';
import {
  CONSULTORES_CS, ROTULO_CONSULTOR_CS, agrupaVolumePorConsultorCS, isConsultorCS, tokenConsultorCS,
} from '@/lib/csConsultores';
import { useContagem } from '@/hooks/useContagem';
import {
  faixaCorProd, useProdutividadeConsultores, type LinhaProdutividade,
} from '@/hooks/useProdutividadeConsultores';
import {
  useGestaoCoberturaClientes, useGestaoSlaMensal, type GestaoSlaMensalResponse,
} from '@/hooks/useGestaoKpis';
import { useCsIncidentesDeclarados } from '@/hooks/useCsIncidentesDeclarados';
import type {
  ConsultorKpi, HistoricoEntry, RegistroPorGrupo, TipoChamadoKpi,
} from '@/hooks/useHelpdeskKpis';

/**
 * Modo TV do Customer Service — Direção A do mock MOCK_TV_CS_07-08 (aprovada
 * pelo Igor em 07/08/2026). Mesma receita da FabricaTvView: view em modo fill,
 * faixa de Panorama FIXA e 2 páginas alternando pela sequência única do kiosk:
 *   1) Resultado: os 3 cards de SLA (Nestlé · Heineken · Outras Bandeiras)
 *      com a altura inteira do telão — é o número que os gestores cobram.
 *   2) Operação: produtividade, volume por consultor/tipo/dia/sistema e
 *      incidentes declarados — listas fixas e top-N + agregado, ZERO rolagem.
 *
 * O que a TV NÃO herda da aba de mesa: selos/rodapés "fora do filtro" (no
 * kiosk não existe filtro — a janela é sempre o mês de calendário), rolagem
 * interna dos gráficos e qualquer informação só em hover/tooltip.
 *
 * Padrão de caixa exigido no aprovo: as DUAS páginas usam a mesma faixa fixa,
 * o mesmo wrapper `BlocoTv` (padding/título/borda idênticos), o mesmo gap e
 * grid-cols-3 — muda o conteúdo, nunca o formato.
 */
const PAGES = 2;

/** Heatmap: últimos N dias com lançamento — mais que isso não cabe ao lado da
 *  barra de média sem rolagem, e rolagem não existe na TV. */
const HEATMAP_MAX_DIAS = 10;
/** Teto de linhas do bloco de produtividade: os endpoints devolvem quem tiver
 *  lançamento (hoje ~9-10), e o container é overflow-hidden — sem teto, linha
 *  excedente sumiria EM SILÊNCIO. Corta pelas menores médias e declara o corte
 *  no rodapé (mesma regra do "Outros (+N)" dos sistemas). */
const PRODUTIVIDADE_MAX = 10;
/** Até aqui toda barra de dia leva o valor; acima, só máx/mín/último. */
const DIA_MAX_ROTULOS = 16;
/** Até aqui o rótulo do dia carrega o dia da semana ("seg 03"). */
const DIA_MAX_ROTULO_LONGO = 8;
const SISTEMAS_TOP = 8;
const TIPOS_TOP = 6;
/** 3 linhas de incidente cabem na linha baixa da página 2 sem espremer. */
const INCIDENTES_MAX = 3;

/**
 * Rampa categórica do DESIGN-SYSTEM §2.7a, valores do MODO ESCURO — o kiosk
 * força dark no mount. Mesma série, mesma cor nas duas telas do CS:
 * consultor = slot 3, sistema/dia = slot 1, tipo = slot 7. O agregado
 * "Outros" é neutro de propósito: não é uma série, é um resto.
 */
const COR_CONSULTOR = '#199e70';
const COR_SISTEMA = '#3987e5';
const COR_TIPO = '#9085e9';
const COR_OUTROS = '#33507F';

/** Recorte do retorno de `useHelpdeskKpis` que a TV consome (via HelpdeskKiosk). */
type CsTvKpis = {
  totalRegistros: number;
  /** MINUTOS BRUTOS — h:mm e TMA são derivados aqui, nunca do decimal arredondado. */
  totalMinutos: number;
  totalConsultores: number;
  registrosPorConsultor: ConsultorKpi[];
  tipoChamadoTempoMedio: TipoChamadoKpi[];
  registrosPorSistema: RegistroPorGrupo[];
  registrosPorBandeira: RegistroPorGrupo[];
  registrosPorCliente: RegistroPorGrupo[];
  historico: HistoricoEntry[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

/** Mês anterior COMPLETO — só o necessário para o delta de TMA da faixa. */
type CsTvKpisAnterior = {
  totalRegistros: number;
  totalMinutos: number;
  isLoading: boolean;
  isError: boolean;
};

type CsTvViewProps = {
  k: CsTvKpis;
  kAnterior?: CsTvKpisAnterior;
  /** Janela do telão — mês de calendário corrente (o kiosk não tem filtro). */
  dataInicio: Date;
  dataFim: Date;
};

export function CsTvView({ k, kAnterior, dataInicio, dataFim }: CsTvViewProps) {
  const page = usePaginaKiosk(PAGES);

  // Hooks SEMPRE no topo, nunca atrás do ternário de página: as 2 páginas
  // alternam no MESMO mount e hook condicional quebraria a ordem dos hooks.
  const slaNestle = useGestaoSlaMensal('nestle');
  const slaHeineken = useGestaoSlaMensal('heineken');
  const slaOutras = useGestaoSlaMensal('outros');
  const cobertura = useGestaoCoberturaClientes();
  const prod = useProdutividadeConsultores(dataInicio, dataFim);
  const inc = useCsIncidentesDeclarados(dataInicio, dataFim);

  const consultores = useMemo(
    () => agrupaVolumePorConsultorCS(k.registrosPorConsultor),
    [k.registrosPorConsultor],
  );

  return (
    <div className="w-full h-full flex flex-col gap-2.5 overflow-hidden">
      <FaixaPanorama
        k={k}
        kAnterior={kAnterior}
        cobertura={cobertura}
        dataInicio={dataInicio}
        dataFim={dataFim}
        page={page}
        totalConsultoresCs={consultores.length}
      />

      {page === 0 ? (
        /* ─── Página 1 — Resultado ─── */
        <div className="flex-1 min-h-0 grid grid-cols-3 gap-2.5">
          <SlaTvCard titulo="Nestlé" q={slaNestle} />
          <SlaTvCard titulo="Heineken" q={slaHeineken} />
          <SlaTvCard titulo="Outras Bandeiras" q={slaOutras} />
        </div>
      ) : (
        /* ─── Página 2 — Operação ─── */
        <>
          <div className="flex-[1.5] min-h-0 grid grid-cols-3 gap-2.5">
            <BlocoProdutividade prod={prod} />
            <BlocoVolumeConsultor consultores={consultores} k={k} />
            <BlocoTempoTipo tipos={k.tipoChamadoTempoMedio} k={k} />
          </div>
          <div className="flex-1 min-h-0 grid grid-cols-3 gap-2.5">
            <BlocoVolumeDia historico={k.historico} k={k} />
            <BlocoVolumeSistema sistemas={k.registrosPorSistema} k={k} />
            <BlocoIncidentes q={inc} />
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════ Faixa de Panorama — fixa nas duas páginas ═══════════ */

function FaixaPanorama({ k, kAnterior, cobertura, dataInicio, dataFim, page, totalConsultoresCs }: {
  k: CsTvKpis;
  kAnterior?: CsTvKpisAnterior;
  cobertura: ReturnType<typeof useGestaoCoberturaClientes>;
  dataInicio: Date;
  dataFim: Date;
  page: number;
  /** Consultores do CS com registro no mês — não o total do VDesk. */
  totalConsultoresCs: number;
}) {
  const cob = cobertura.data;
  const pct = cob?.pctCobertura ?? null;
  const carregando = k.isLoading || k.isError;

  // Delta de TMA vs mês anterior (chip do mock aprovado). null = sem base num
  // dos lados → DeltaBadge diz "sem base" em vez de inventar 0.
  const tmaAtual = k.totalRegistros > 0 ? k.totalMinutos / k.totalRegistros : null;
  const tmaAnt = kAnterior != null && !kAnterior.isLoading && !kAnterior.isError && kAnterior.totalRegistros > 0
    ? kAnterior.totalMinutos / kAnterior.totalRegistros
    : null;
  const tmaDelta = tmaAtual != null && tmaAnt != null ? Math.round(tmaAtual - tmaAnt) : null;
  const mesAntLabel = new Date(dataInicio.getFullYear(), dataInicio.getMonth() - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '');

  return (
    <div className="flex-none grid gap-2.5" style={{ gridTemplateColumns: '196px repeat(3, 1fr) 1.5fr' }}>
      <Card className="px-3.5 py-2 flex flex-col justify-center bg-gradient-to-br from-primary/10 to-transparent">
        <p className="text-[24px] font-black leading-none tracking-tight">CS</p>
        {/* Sem contagem de "dias úteis" (o mock ilustrava uma): o único número
            de dias úteis com autoridade é o do gateway, que exclui feriados —
            um Seg–Sex local divergiria dele na mesma parede. */}
        <p className="text-[11.5px] text-muted-foreground mt-1">
          Panorama · mês atual · {format(dataInicio, 'dd/MM')}–{format(dataFim, 'dd/MM')}
        </p>
        <div className="flex items-center gap-1.5 mt-1.5">
          {Array.from({ length: PAGES }, (_, i) => (
            <span
              key={i}
              className="block rounded-full transition-all"
              style={{
                width: i === page ? 18 : 6,
                height: 6,
                background: i === page ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                opacity: i === page ? 1 : 0.35,
              }}
            />
          ))}
        </div>
      </Card>

      <Heroi
        rotulo="Registros"
        valor={carregando ? DASH : fmtInt(k.totalRegistros)}
        rodape={carregando ? 'atendimentos no mês' : `atendimentos de ${fmtInt(k.registrosPorCliente.length)} clientes`}
      />
      <Heroi rotulo="Horas" valor={carregando ? DASH : horasHM(k.totalMinutos)} rodape="de atendimento" />
      <Heroi
        rotulo="TMA"
        valor={carregando ? DASH : tmaCurto(k.totalMinutos, k.totalRegistros)}
        rodape="por atendimento"
        chip={carregando || kAnterior == null ? undefined : (
          <span className="flex items-center gap-1">
            <DeltaBadge
              variacao={tmaDelta}
              unidade="m"
              menorMelhor
              semBaseTexto="sem base"
              aria={`TMA do mês atual em relação a ${mesAntLabel} — queda é melhora`}
            />
            {tmaDelta != null && (
              <span className="text-[11px] text-muted-foreground">vs {mesAntLabel}</span>
            )}
          </span>
        )}
      />

      <Card className="px-3 py-2 grid grid-cols-5 items-center bg-card/60">
        {/* 21/08: os 9 do CS, não os 18 de `k.totalConsultores` — este conta
            TODO consultor com registro no VDesk, inclusive quem não é do time,
            e o painel do CS não pode dizer um número que a tela abaixo desmente
            ("Volume por consultor" já lista os 9). */}
        <Apoio valor={carregando ? DASH : totalConsultoresCs} rotulo="consultores do CS" />
        <Apoio valor={carregando ? DASH : k.registrosPorSistema.length} rotulo="sistemas" />
        <Apoio valor={carregando ? DASH : k.registrosPorBandeira.length} rotulo="bandeiras" />
        {/* Cobertura vem de outro endpoint (mês corrente, PAN-2): null = sem base → '—'. */}
        <Apoio
          valor={pct == null ? DASH : `${Math.round(pct)}%`}
          rotulo="cobertura da base"
          cor={pct == null ? undefined : corMetaHigh(pct)}
        />
        <Apoio
          valor={cob == null ? DASH : (
            <>
              {fmtInt(cob.atendidosMes)}
              <span className="text-[13px] text-muted-foreground">/{fmtInt(cob.totalClientesAtivos)}</span>
            </>
          )}
          rotulo={`clientes ativos${cob ? ` · ${fmtMesAno(cob.mesReferencia)}` : ''}`}
        />
      </Card>
    </div>
  );
}

/** KPI-herói — mesma anatomia dos heróis da FabricaTvView (peças locais de lá,
 *  não exportadas). Sem `truncate` no rodapé: aqui ele carrega um dado
 *  (nº de clientes), e na TV nada essencial pode ser cortado.
 *  `chip` fica ao lado do valor (ex.: delta de TMA vs mês anterior). */
function Heroi({ rotulo, valor, rodape, cor, chip }: {
  rotulo: string; valor: ReactNode; rodape: string; cor?: string; chip?: ReactNode;
}) {
  return (
    <Card className="px-3.5 py-2 flex flex-col justify-center">
      <p className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground leading-none">{rotulo}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <p className="text-[44px] font-black leading-none font-mono" style={cor ? { color: cor } : undefined}>{valor}</p>
        {chip}
      </div>
      <p className="text-[11.5px] text-muted-foreground mt-1 leading-tight">{rodape}</p>
    </Card>
  );
}

/** KPI de apoio: contexto do herói, metade do tamanho. */
function Apoio({ valor, rotulo, cor }: { valor: ReactNode; rotulo: string; cor?: string }) {
  return (
    <div className="text-center px-1 border-l border-border first:border-l-0">
      <p className="text-[22px] font-extrabold leading-none font-mono tabular-nums" style={cor ? { color: cor } : undefined}>{valor}</p>
      <p className="text-[10.5px] text-muted-foreground mt-1 leading-tight">{rotulo}</p>
    </div>
  );
}

/* ═══════════ Wrapper padrão de bloco (páginas 1 e 2) ═══════════ */

/**
 * O ÚNICO formato de caixa das duas páginas (exigência do aprovo do mock):
 * mesmo padding, mesmo título, mesma borda — quem muda é só o conteúdo.
 */
function BlocoTv({ titulo, right, children }: {
  titulo: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="h-full min-h-0 overflow-hidden p-4 flex flex-col gap-2">
      <div className="flex-none flex items-center justify-between gap-2">
        <p className="text-[13px] font-extrabold uppercase tracking-widest text-muted-foreground">{titulo}</p>
        {right}
      </div>
      {children}
    </Card>
  );
}

function SkeletonTv() {
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      <Skeleton className="flex-1 w-full" />
      <Skeleton className="flex-1 w-full" />
    </div>
  );
}

/** Estado vazio/erro centralizado — sem spinner, mensagem sempre legível. */
function EstadoTv({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
      <p className="text-sm text-muted-foreground leading-snug">{children}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="text-xs font-medium text-primary hover:underline">
          Tentar novamente
        </button>
      )}
    </div>
  );
}

/* ═══════════ Página 1 — cards de SLA ═══════════ */

function SlaTvCard({ titulo, q }: {
  titulo: string;
  q: { data: GestaoSlaMensalResponse | undefined; isLoading: boolean; isError: boolean; refetch: () => void };
}) {
  if (q.isLoading) {
    return <BlocoTv titulo={`SLA ${titulo}`}><SkeletonTv /></BlocoTv>;
  }
  if (q.isError || !q.data) {
    return (
      <BlocoTv titulo={`SLA ${titulo}`}>
        <EstadoTv onRetry={() => q.refetch()}>
          O gateway não respondeu. Confirme a VPN da Flag.
        </EstadoTv>
      </BlocoTv>
    );
  }

  const { referencia: ref, metas, ttr, ttr24h, abertos, volumes } = q.data;
  const mAtual = fmtMesAno(ref.mesAtual);
  const mAnt = fmtMesAno(ref.mesAnterior);
  const rotAno = String(ref.ano);

  // Mesmas regras do SlaSegmentoCard de mesa (peças locais de lá, não exportadas):
  // · DADO, não segmento — incMaior* null = sem ServiceNow → rodapé cai p/ OS;
  // · com mês anterior = 0 o backend manda variacaoPct null e variacaoDias
  //   definida — cair para dias evita dizer "sem base" tendo base.
  const temInc = abertos.incMaior5Dias != null || abertos.incMaior30Dias != null;
  const ttrVarValor = ttr.variacaoPct ?? ttr.variacaoDias;
  const ttrVarUnid = ttr.variacaoPct != null ? ttr.unidadeVariacao : 'd';

  // Refino 21/08: o miolo deixou de ser `justify-evenly` — ele transformava a
  // folga da altura em BURACOS entre os grupos (58% de aproveitamento medido no
  // canvas do kiosk). Agora cada grupo é flex-1 e centra o próprio conteúdo:
  // a mesma informação preenche o card e a tipografia pôde crescer.
  return (
    <BlocoTv titulo={`SLA ${titulo}`}>
      <GrupoSlaTv
        titulo="TTR — dias"
        status={ttr.statusAnual}
        meta={metas.metaTTRDias == null ? 'sem meta definida' : `meta ≤ ${fmtDias(metas.metaTTRDias)}`}
        heroi={{
          rotulo: `mês atual · ${mAtual}`,
          valor: ttr.mesAtual,
          fmt: fmtDias,
          // vermelho quando o mês estoura a meta — antes o número ficava neutro
          // mesmo acima do alvo, e só o ano carregava cor
          cor: corValorVsMeta(ttr.mesAtual, metas.metaTTRDias, ttr.menorMelhor),
          sub: (
            <DeltaBadge
              variacao={ttrVarValor}
              unidade={ttrVarUnid}
              menorMelhor={ttr.menorMelhor}
              semBaseTexto="sem base"
              aria={`TTR de ${mAtual} em relação a ${mAnt} — queda é melhora`}
            />
          ),
        }}
        anterior={{ periodo: mAnt, valor: ttr.mesAnterior }}
        ano={{ periodo: rotAno, valor: ttr.anual, cor: corStatus(ttr.statusAnual) }}
      />
      <GrupoSlaTv
        titulo="TTR ≤ 24h — %"
        status={ttr24h.statusAnual}
        meta={metas.metaTTR24hPct == null ? 'sem meta definida' : `meta ≥ ${fmtPct(metas.metaTTR24hPct)}`}
        heroi={{
          rotulo: `mês atual · ${mAtual}`,
          valor: ttr24h.mesAtual,
          fmt: fmtPct,
          // aqui MAIOR é melhor: vermelho quando fica ABAIXO do piso da meta
          cor: corValorVsMeta(ttr24h.mesAtual, metas.metaTTR24hPct, ttr24h.menorMelhor),
          sub: (
            <DeltaBadge
              variacao={ttr24h.variacaoPp}
              unidade={ttr24h.unidadeVariacao}
              menorMelhor={ttr24h.menorMelhor}
              semBaseTexto="sem base"
              aria={`%24h de ${mAtual} em relação a ${mAnt} — alta é melhora`}
            />
          ),
        }}
        anterior={{ periodo: mAnt, valor: ttr24h.mesAnterior }}
        ano={{ periodo: rotAno, valor: ttr24h.anual, cor: corStatus(ttr24h.statusAnual) }}
      />

      {/* Rodapé com etiqueta fixa à esquerda: o olho encontra "Em aberto" sem
          reler a frase inteira, e o nº de > 30 dias sai do corpo do texto. */}
      <div className="flex-none border-t pt-2.5 space-y-1.5">
        <LinhaRodapeSla etiqueta="Fechadas">
          {mAtual} <ValorRodape v={volumes.fechadosMesAtual} /> · {mAnt}{' '}
          <ValorRodape v={volumes.fechadosMesAnterior} /> · {rotAno}{' '}
          <ValorRodape v={volumes.fechadosAno} />
        </LinhaRodapeSla>
        {temInc ? (
          <LinhaRodapeSla etiqueta="Em aberto">
            <ValorGrave v={abertos.incMaior30Dias} /> há mais de 30 dias ·{' '}
            <ValorRodape v={abertos.incMaior5Dias} /> acima de 5 dias
            {/* A Nestlé conta INC do ServiceNow e os demais OS do VDesk: sem
                dizer isso, 3 e 91 lado a lado parecem a mesma métrica. */}
            <span className="text-[11px] text-muted-foreground/70"> · INC ServiceNow</span>
          </LinhaRodapeSla>
        ) : (
          <LinhaRodapeSla etiqueta="Em aberto">
            <ValorGrave v={abertos.maior30Dias} /> há mais de 30 dias
            {abertos.totalAbertos > 0 && (
              <>
                {' · '}
                <b className="font-mono tabular-nums font-bold text-foreground">
                  {Math.round((abertos.maior30Dias / abertos.totalAbertos) * 100)}%
                </b>
                {' das '}
                <ValorRodape v={abertos.totalAbertos} /> abertas
              </>
            )}
          </LinhaRodapeSla>
        )}
      </div>
    </BlocoTv>
  );
}

/** Linha do rodapé: etiqueta de largura fixa + conteúdo. */
function LinhaRodapeSla({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <p className="flex items-baseline gap-2 text-[12.5px] text-muted-foreground leading-snug">
      <span className="w-[72px] shrink-0 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground/70">
        {etiqueta}
      </span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

const ValorRodape = ({ v }: { v: number | null | undefined }) => (
  <b className="font-mono tabular-nums font-bold text-foreground">{fmtInt(v)}</b>
);

/** Backlog envelhecido: o número mais acionável do card não pode ter o mesmo
 *  peso do texto em volta. Vermelho só quando existe de fato (> 0). */
const ValorGrave = ({ v }: { v: number | null | undefined }) => (
  <b
    className="font-mono tabular-nums font-extrabold text-[16px]"
    style={{ color: v != null && v > 0 ? HEALTH_COLORS.vermelho : undefined }}
  >
    {fmtInt(v)}
  </b>
);

/**
 * Grupo TTR do card de SLA da TV. O badge de status é POR GRUPO (não um só no
 * header do card): TTR-dias e TTR-24h têm `statusAnual` próprios no contrato e
 * podem divergir — condensar num badge único exigiria recombinar semáforo no
 * front, exatamente o que o contrato proíbe.
 *
 * Refino 21/08: o badge saiu do cabeçalho e desceu para BAIXO DO VALOR ANUAL.
 * `statusAnual` julga o ano, mas no cabeçalho ele ficava colado no título e o
 * olho o associava ao número gigante do mês — na Heineken isso lia como "META
 * OK" sobre 2,58d quando o aprovado era o ano de 9,46d, a 5% do teto de 10.
 * Só mudou de lugar: o contrato e o semáforo continuam intactos.
 */
function GrupoSlaTv({ titulo, status, meta, heroi, anterior, ano }: {
  titulo: string;
  status: GestaoSlaMensalResponse['ttr']['statusAnual'];
  meta: string;
  heroi: {
    rotulo: string;
    valor: number | null;
    fmt: (v: number | null | undefined) => string;
    /** Vermelho quando o mês não atinge a meta; undefined = cor normal. */
    cor?: string;
    sub: ReactNode;
  };
  anterior: { periodo: string; valor: number | null };
  ano: { periodo: string; valor: number | null; cor: string };
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col justify-center gap-2 border-t first:border-t-0 pt-3 first:pt-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12.5px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <span className="text-[11.5px] font-mono text-muted-foreground/80 shrink-0">{meta}</span>
      </div>
      {/* Grid (não flex): "mês anterior" e "ano" caem na MESMA vertical nos dois
          grupos, então o olho desce em linha reta entre TTR e %24h. */}
      <div className="grid grid-cols-[1.3fr_.85fr_1.1fr] gap-2 text-right items-end">
        <CelulaSlaTv rotulo={heroi.rotulo} valor={heroi.valor} fmt={heroi.fmt} cor={heroi.cor} heroi sub={heroi.sub} />
        <CelulaSlaTv rotulo="mês anterior" periodo={anterior.periodo} valor={anterior.valor} fmt={heroi.fmt} mudo />
        <CelulaSlaTv
          rotulo="ano · média"
          periodo={ano.periodo}
          valor={ano.valor}
          fmt={heroi.fmt}
          cor={ano.cor}
          destaque
          sub={(
            <Badge
              variant="outline"
              className="border-current text-[11px] font-bold shrink-0"
              style={{ color: corStatus(status) }}
            >
              {rotuloStatus(status)}
            </Badge>
          )}
        />
      </div>
    </div>
  );
}

function CelulaSlaTv({ rotulo, periodo, valor, fmt, cor, sub, heroi, mudo, destaque }: {
  rotulo: string; periodo?: string; valor: number | null;
  fmt: (v: number | null | undefined) => string;
  cor?: string; sub?: ReactNode; heroi?: boolean; mudo?: boolean;
  /** Coluna do ano: filete à esquerda separando o valor que a meta julga. */
  destaque?: boolean;
}) {
  // Contagem só no que é grande o bastante para se ver de longe; o atraso
  // escalona os números do card em vez de dispará-los todos no mesmo quadro.
  const animado = useContagem(valor, { atrasoMs: heroi ? 0 : destaque ? 120 : 60 });
  return (
    <div className={`min-w-0 ${destaque ? 'border-l-2 pl-2.5' : ''}`}>
      <p className="text-[11.5px] text-muted-foreground leading-tight">{rotulo}</p>
      <p className="text-[11px] font-mono tabular-nums text-muted-foreground/70 min-h-4">{periodo}</p>
      <p
        className={`${heroi ? 'text-[54px]' : destaque ? 'text-[38px]' : 'text-[28px]'} ${mudo ? 'text-muted-foreground' : ''} font-black font-mono tabular-nums leading-none mt-1`}
        style={cor ? { color: cor } : undefined}
      >
        {fmt(animado)}
      </p>
      {/* min-h fixo alinha a 4ª linha entre as células, mesmo vazia */}
      <div className="min-h-6 text-xs mt-1.5 flex justify-end items-center">{sub}</div>
    </div>
  );
}

/* ═══════════ Página 2 — blocos de operação ═══════════ */

/** Barra horizontal com o valor DENTRO da barra (rótulo sempre visível).
 *  `altura` menor na linha de baixo da página 2: 9 barras × 22px não cabem na
 *  linha `flex-1` — encolher a barra, nunca rolar nem cortar. */
function BarraH({ nome, valorLabel, pct, cor, nomeW = 'w-24', altura = 'h-[22px]' }: {
  nome: string; valorLabel: string; pct: number; cor: string; nomeW?: string; altura?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`${nomeW} flex-none text-right text-[12px] leading-tight text-muted-foreground break-words`}>
        {nome}
      </span>
      <span className={`flex-1 ${altura} rounded bg-muted/40 overflow-hidden`}>
        <span
          className="flex h-full items-center justify-end rounded pr-1.5 text-[12px] font-extrabold font-mono tabular-nums text-white"
          style={{ width: `${pct}%`, minWidth: 30, background: cor }}
        >
          {valorLabel}
        </span>
      </span>
    </div>
  );
}

function BlocoProdutividade({ prod }: { prod: ReturnType<typeof useProdutividadeConsultores> }) {
  const diasJanela = prod.dias.slice(-HEATMAP_MAX_DIAS);
  const janelaCortada = prod.dias.length > diasJanela.length;
  /**
   * SÓ os 9 do CS (21/08/2026, pedido do Igor) — e SEMPRE os 9.
   *
   * O hook é compartilhado com a tela de mesa do techlead, que mostra o time
   * inteiro de propósito (sistemas + infra) — por isso o recorte mora aqui, na
   * TV, e não no hook: mexer lá tiraria gente da tela de quem precisa vê-la.
   *
   * Quem o techlead não devolveu entra com média "sem base" e heatmap vazio, em
   * vez de sumir. Caso real: o Lucas Ferreira tinha 81 registros no Volume por
   * consultor e NENHUM lançamento de produtividade — some da lista e ninguém
   * nota que falta lançamento, que é justamente o sinal a mostrar.
   */
  const doCs = useMemo(() => {
    const presentes = prod.linhas.filter((l) => isConsultorCS(l.consultor));
    const vistos = new Set(presentes.map((l) => tokenConsultorCS(l.consultor)));
    const ausentes: LinhaProdutividade[] = CONSULTORES_CS
      .filter((t) => !vistos.has(t))
      .map((t) => ({
        consultor: ROTULO_CONSULTOR_CS[t] ?? t,
        mapa: new Map<string, number>(),
        media: null,
        equipe: null,
      }));
    // ausentes no fim: `media: null` é "sem base", que a lista já ordena por último
    return [...presentes, ...ausentes];
  }, [prod.linhas]);
  // `prod.linhas` já vem ordenado por média desc (null no fim) — o teto corta o rabo.
  const linhas = doCs.slice(0, PRODUTIVIDADE_MAX);
  const linhasCortadas = doCs.length - linhas.length;

  return (
    <BlocoTv
      titulo="Produtividade · dias úteis"
      right={
        <span className="text-[11px] text-muted-foreground shrink-0">
          {janelaCortada ? `heatmap · últimos ${diasJanela.length} dias` : 'heatmap · dia a dia'}
        </span>
      }
    >
      {prod.isLoading ? (
        <SkeletonTv />
      ) : prod.falhouTudo ? (
        <EstadoTv onRetry={prod.refetchTudo}>
          Não foi possível carregar a produtividade. Confirme a VPN da Flag.
        </EstadoTv>
      ) : doCs.length === 0 ? (
        <EstadoTv>Sem lançamentos de produtividade no mês.</EstadoTv>
      ) : (
        <>
          {/* cabeçalho do heatmap — mesmas larguras das linhas para alinhar as colunas */}
          <div className="flex-none flex items-center gap-1.5">
            <span className="w-[76px] flex-none" />
            <span className="w-[26px] flex-none" />
            <span className="flex-none flex gap-1">
              {diasJanela.map((d) => (
                <i key={d} className="w-3.5 not-italic text-center text-[8.5px] text-muted-foreground">
                  {d.slice(8)}
                </i>
              ))}
            </span>
            <span className="flex-1" />
            <span className="w-[42px] flex-none text-right text-[8.5px] text-muted-foreground">média</span>
          </div>

          <div className="flex-1 min-h-0 flex flex-col justify-evenly">
            {linhas.map((l) => (
              <div key={l.consultor} className="flex items-center gap-1.5">
                <span className="w-[76px] flex-none text-right text-[12px] leading-tight text-muted-foreground break-words">
                  {l.consultor}
                </span>
                {/* equipe em TEXTO: cor tem papel de status neste bloco */}
                <span className="w-[26px] flex-none text-[9px] uppercase tracking-wide text-muted-foreground/70">
                  {l.equipe == null ? '' : l.equipe === 'infra' ? 'infra' : 'sis'}
                </span>
                <span className="flex-none flex gap-1">
                  {diasJanela.map((d) => {
                    const v = l.mapa.get(d);
                    return (
                      <i
                        key={d}
                        className="block h-3.5 w-3.5 rounded-sm"
                        style={{ background: v == null ? 'hsl(var(--muted))' : faixaCorProd(v) }}
                      />
                    );
                  })}
                </span>
                {/* clamp NA BARRA (largura), nunca no número exibido */}
                <span className="flex-1 h-3 min-w-[40px] rounded-full bg-muted/60 overflow-hidden">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.min(l.media ?? 0, 100)}%`,
                      background: l.media == null ? 'transparent' : faixaCorProd(l.media),
                    }}
                  />
                </span>
                <span
                  className="w-[42px] flex-none text-right text-[13px] font-extrabold font-mono tabular-nums"
                  style={{ color: l.media == null ? undefined : faixaCorProd(l.media) }}
                >
                  {l.media == null ? DASH : `${Math.round(l.media)}%`}
                </span>
              </div>
            ))}
          </div>

          {(prod.temAcima100 || prod.falhouMedia) && (
            <p className="flex-none text-[10.5px] leading-tight" style={{ color: HEALTH_COLORS.amarelo }}>
              {prod.temAcima100 && 'Acima de 100% = mais de 8h lançadas por dia útil (barra clampada, número real). '}
              {prod.falhouMedia && 'Média por dias úteis indisponível — exibindo só o heatmap.'}
            </p>
          )}
          {linhasCortadas > 0 && (
            <p className="flex-none text-[10.5px] text-muted-foreground/80 leading-tight">
              +{linhasCortadas} consultor(es) com as menores médias fora da tela — detalhe na tela de mesa.
            </p>
          )}
        </>
      )}
    </BlocoTv>
  );
}

/** Estados dos blocos que dependem do volume do CS (`useHelpdeskKpis`):
 *  skeleton (nunca spinner) → erro com retry → vazio com instrução. */
function CorpoVolume({ k, temDados, vazioMsg, children }: {
  k: CsTvKpis; temDados: boolean; vazioMsg: string; children: ReactNode;
}) {
  if (k.isLoading) return <SkeletonTv />;
  if (k.isError) {
    return (
      <EstadoTv onRetry={k.refetch}>
        Não foi possível carregar os registros do CS. Confirme a VPN da Flag.
      </EstadoTv>
    );
  }
  if (!temDados) return <EstadoTv>{vazioMsg}</EstadoTv>;
  return <>{children}</>;
}

function BlocoVolumeConsultor({ consultores, k }: {
  consultores: Array<{ nome: string; registros: number }>;
  k: CsTvKpis;
}) {
  const max = Math.max(...consultores.map((c) => c.registros), 1);
  return (
    <BlocoTv titulo="Volume por consultor" right={<span className="text-[11px] text-muted-foreground shrink-0">mês atual</span>}>
      <CorpoVolume k={k} temDados={consultores.length > 0} vazioMsg="Sem registros de consultor no mês.">
        <div className="flex-1 min-h-0 flex flex-col justify-evenly">
          {consultores.map((c) => (
            <BarraH
              key={c.nome}
              nome={c.nome}
              valorLabel={fmtInt(c.registros)}
              pct={(c.registros / max) * 100}
              cor={COR_CONSULTOR}
            />
          ))}
        </div>
        <p className="flex-none text-[10.5px] text-muted-foreground/80 leading-tight">
          Os {consultores.length} consultores do CS — lista completa, sem rolagem.
        </p>
      </CorpoVolume>
    </BlocoTv>
  );
}

function BlocoTempoTipo({ tipos, k }: { tipos: TipoChamadoKpi[]; k: CsTvKpis }) {
  const { top, foraQtd, foraPct } = useMemo(() => {
    const ordenados = [...tipos].sort((a, b) => b.quantidade - a.quantidade);
    const top = ordenados.slice(0, TIPOS_TOP);
    const fora = ordenados.slice(TIPOS_TOP);
    const totalVolume = ordenados.reduce((s, t) => s + t.quantidade, 0);
    const foraVolume = fora.reduce((s, t) => s + t.quantidade, 0);
    return {
      top,
      foraQtd: fora.length,
      foraPct: totalVolume > 0 ? Math.round((foraVolume / totalVolume) * 100) : 0,
    };
  }, [tipos]);
  const maxTempo = Math.max(...top.map((t) => t.tempoMedio), 1);

  return (
    <BlocoTv
      titulo="Tempo médio por tipo"
      right={
        <span className="text-[11px] text-muted-foreground shrink-0">
          {top.length > 0 ? `top ${top.length} por volume · minutos` : 'mês atual'}
        </span>
      }
    >
      <CorpoVolume k={k} temDados={top.length > 0} vazioMsg="Sem dados de tipo de chamado no mês.">
        <div className="flex-1 min-h-0 flex flex-col justify-evenly">
          {top.map((t) => (
            <BarraH
              key={t.tipo}
              nome={t.tipo}
              valorLabel={`${Math.round(t.tempoMedio)}m`}
              pct={(t.tempoMedio / maxTempo) * 100}
              cor={COR_TIPO}
              nomeW="w-28"
            />
          ))}
        </div>
        <p className="flex-none text-[10.5px] text-muted-foreground/80 leading-tight">
          {foraQtd > 0
            ? `${foraQtd} tipo(s) fora do top somam ${foraPct}% do volume — detalhe completo na tela de mesa.`
            : 'Todos os tipos do mês.'}
        </p>
      </CorpoVolume>
    </BlocoTv>
  );
}

function BlocoVolumeDia({ historico, k }: { historico: HistoricoEntry[]; k: CsTvKpis }) {
  const barras = useMemo(() => {
    const serie = [...historico].sort((a, b) => a.date.localeCompare(b.date));
    const n = serie.length;
    if (n === 0) return [];
    const max = Math.max(...serie.map((h) => h.totalRegistros), 1);
    let idxMax = 0;
    let idxMin = 0;
    serie.forEach((h, i) => {
      if (h.totalRegistros > serie[idxMax].totalRegistros) idxMax = i;
      if (h.totalRegistros < serie[idxMin].totalRegistros) idxMin = i;
    });
    const passoDia = Math.ceil(n / 8);
    return serie.map((h, i) => {
      const d = new Date(h.date + 'T12:00:00');
      const dia = d.toLocaleDateString('pt-BR', { day: '2-digit' });
      const sem = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      return {
        key: h.date,
        valor: h.totalRegistros,
        alturaPct: 8 + (h.totalRegistros / max) * 78,
        // Rótulos adaptativos (regra da TV: nunca scroll, nunca hover): com o mês
        // cheio não cabe valor em toda barra — mantêm rótulo máx, mín e último.
        mostraValor: n <= DIA_MAX_ROTULOS || i === idxMax || i === idxMin || i === n - 1,
        diaLabel:
          n <= DIA_MAX_ROTULO_LONGO ? `${sem} ${dia}`
          : n <= DIA_MAX_ROTULOS ? dia
          : (i % passoDia === 0 || i === n - 1) ? dia : '',
      };
    });
  }, [historico]);

  return (
    <BlocoTv titulo="Volume por dia" right={<span className="text-[11px] text-muted-foreground shrink-0">mês atual</span>}>
      <CorpoVolume k={k} temDados={barras.length > 0} vazioMsg="Sem série diária no mês.">
        <div className="flex-1 min-h-0 flex items-stretch gap-1.5 pt-1">
          {barras.map((b) => (
            <div key={b.key} className="flex-1 min-w-0 flex flex-col items-center gap-0.5">
              <div className="flex-1 w-full min-h-0 flex flex-col items-center justify-end gap-0.5">
                {b.mostraValor && (
                  <span className="text-[12px] font-extrabold font-mono tabular-nums leading-none">
                    {b.valor}
                  </span>
                )}
                <i className="w-[70%] rounded-t" style={{ height: `${b.alturaPct}%`, background: COR_SISTEMA }} />
              </div>
              <span className="flex-none min-h-4 text-[10px] text-muted-foreground whitespace-nowrap">
                {b.diaLabel}
              </span>
            </div>
          ))}
        </div>
      </CorpoVolume>
    </BlocoTv>
  );
}

function BlocoVolumeSistema({ sistemas, k }: { sistemas: RegistroPorGrupo[]; k: CsTvKpis }) {
  const linhas = useMemo(() => {
    const ordenados = [...sistemas].sort((a, b) => b.quantidade - a.quantidade);
    const top = ordenados.slice(0, SISTEMAS_TOP);
    const resto = ordenados.slice(SISTEMAS_TOP);
    const outros = resto.reduce((s, g) => s + g.quantidade, 0);
    const rows = top.map((g) => ({ nome: g.nome, valor: g.quantidade, cor: COR_SISTEMA }));
    if (resto.length > 0) rows.push({ nome: `Outros (+${resto.length})`, valor: outros, cor: COR_OUTROS });
    return rows;
  }, [sistemas]);
  const max = Math.max(...linhas.map((l) => l.valor), 1);

  return (
    <BlocoTv
      titulo="Volume por sistema"
      right={
        <span className="text-[11px] text-muted-foreground shrink-0">
          {sistemas.length > SISTEMAS_TOP ? `top ${SISTEMAS_TOP} de ${sistemas.length}` : 'mês atual'}
        </span>
      }
    >
      <CorpoVolume k={k} temDados={linhas.length > 0} vazioMsg="Sem registros por sistema no mês.">
        <div className="flex-1 min-h-0 flex flex-col justify-evenly">
          {linhas.map((l) => (
            <BarraH
              key={l.nome}
              nome={l.nome}
              valorLabel={fmtInt(l.valor)}
              pct={(l.valor / max) * 100}
              cor={l.cor}
              altura="h-4"
            />
          ))}
        </div>
        {/* Sem rodapé "na TV nada rola" (21/08, pedido do Igor): o corte já é
            declarado no header do card ("top 8 de N") e a linha "Outros (+N)"
            entra no gráfico com o volume somado — dizer de novo era redundância
            que roubava altura das barras. */}
      </CorpoVolume>
    </BlocoTv>
  );
}

function BlocoIncidentes({ q }: { q: ReturnType<typeof useCsIncidentesDeclarados> }) {
  const d = q.data;
  const fmtDiaInc = (iso: string | null) =>
    iso == null ? DASH : new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  return (
    <BlocoTv titulo="Incidentes declarados" right={<SeloEspelho d={d} />}>
      {q.isLoading ? (
        <SkeletonTv />
      ) : q.isError || !d ? (
        <EstadoTv onRetry={() => { void q.refetch(); }}>
          Não foi possível ler o espelho do SharePoint SGSI.
        </EstadoTv>
      ) : d.estado !== 'ok' ? (
        <EstadoTv>
          {d.estado === 'periodo-vazio'
            ? `Nenhum incidente declarado no mês — o espelho tem ${fmtInt(d.totalBase)} no total.`
            : d.estado === 'espelho-vazio'
              ? 'Lista SG-LST-016/017 sincronizada, mas sem nenhum registro declarado.'
              : 'Espelho do SharePoint SGSI indisponível — sincronização nunca rodou.'}
        </EstadoTv>
      ) : (
        <>
          <div className="flex-none grid grid-cols-4 gap-1.5">
            <StatTv label="declarados" valor={fmtInt(d.total)} />
            <StatTv label="ativos" valor={fmtInt(d.ativos)} cor={COR_BUCKET.ativo} />
            <StatTv label="downtime" valor={fmtHoras(d.downtimeTotalHoras)} />
            <StatTv
              label="dentro do SLA"
              valor={d.pctDentroSla == null ? DASH : `${d.pctDentroSla}%`}
              cor={corSla(d.pctDentroSla)}
            />
          </div>
          {/* 21/08: item compactado (py-0.5, gap-0.5) e `justify-start` no lugar
              de `justify-evenly`. Medido: com 3 títulos longos o conteúdo passava
              22px da janela e o overflow-hidden do BlocoTv comia o rodapé do 3º
              incidente — o mesmo defeito de "sumir em silêncio" que a lista de
              produtividade declara com "+N". Aqui não há teto a declarar: o
              INCIDENTES_MAX já é o corte, então o que faltava era caber. */}
          <div className="flex-1 min-h-0 flex flex-col justify-start gap-1">
            {d.recentes.slice(0, INCIDENTES_MAX).map((i) => (
              <div key={i.id} className="flex items-start gap-2 rounded-lg border px-2.5 py-0.5">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR_BUCKET[i.bucket] }} />
                <div className="min-w-0 flex-1">
                  {/* sem `truncate`: na TV não existe hover para revelar o resto */}
                  <p className="break-words text-[13px] font-semibold leading-tight">{i.titulo}</p>
                  <p className="text-[10.5px] leading-tight text-muted-foreground">
                    <span className="font-mono">{i.protocolo}</span> · {i.categoria} · {fmtDiaInc(i.criadoEm)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  {/* produto afetado (pedido de 07/08) — padrão "Ativo" da Infra; DASH = sem chip */}
                  {i.produto !== DASH && (
                    <Badge variant="secondary" className="text-[10px] font-semibold">{i.produto}</Badge>
                  )}
                  <span
                    className="rounded-full border border-current px-2 text-[10px] font-bold whitespace-nowrap"
                    style={{ color: COR_BUCKET[i.bucket] }}
                  >
                    {i.status}{i.downtimeHoras != null ? ` · ${fmtHoras(i.downtimeHoras)}` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </BlocoTv>
  );
}

/** KPI compacto de incidente: rótulo à esquerda SEMPRE visível, número à direita. */
function StatTv({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 rounded-lg border px-2 py-0.5">
      <span className="text-[10.5px] leading-tight text-muted-foreground">{label}</span>
      <span className="font-mono text-[17px] font-extrabold leading-none tabular-nums" style={cor ? { color: cor } : undefined}>
        {valor}
      </span>
    </div>
  );
}
