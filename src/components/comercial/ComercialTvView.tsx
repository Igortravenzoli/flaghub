import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Filter as FilterIcon, Loader2 } from 'lucide-react';
import { FunnelBands } from '@/components/comercial/FunnelBands';
import { useComercialFunil } from '@/hooks/useComercialFunil';
import {
  mesesDoTrimestre, qKeyAnterior, qLabel, ymAnterior, ymLabel,
  type VisaoTrimestre,
} from '@/lib/comercialPeriodo';
import type { FunilEtapa } from '@/hooks/useComercialFunil';

/**
 * Funil de vendas no telão — modelo da reunião quinzenal (18/08/2026).
 *
 * O que mudou em relação ao que existia: o funil dividia uma coluna da Visão
 * Executiva em modo `compact`, com escopo travado no trimestre inteiro. Não
 * havia como ver o mês, e as duas etiquetas de funil disputavam ~430px de
 * largura. Agora o funil tem tela própria — cada funil ocupa metade dela — e o
 * telão percorre mês a mês + acumulado pela rotação única do kiosk.
 *
 * Decisões que valem para as três visões:
 *  • sem nome de pessoa no título — o funil é do processo, não de quem opera;
 *  • a faixa de KPIs de baixo é IDÊNTICA nas três visões, porque é o resumo do
 *    trimestre; quem troca com a aba são só os dois funis. É o que permite ler
 *    "julho × agosto × acumulado" sem esperar a rotação dar a volta;
 *  • nenhum valor monetário — decisão anterior do modo TV, mantida.
 */

interface ComercialTvViewProps {
  /** Visões do trimestre — viram as abas clicáveis. */
  visoes: VisaoTrimestre[];
  /** Rótulo completo do trimestre ('Q3 2026 · jul–set'), derivado do calendário. */
  trimestreLabel: string;
  /** Chave do trimestre vigente ('2026-Q3'), derivada do calendário. */
  qKey: string;
  /** Visão inicial — default: o acumulado (ou o único mês, no começo do trimestre). */
  visaoInicial?: string;
}

/** Última etapa do funil = o que de fato fechou/chegou ao fim. */
const base = (etapas: FunilEtapa[]) => etapas[etapas.length - 1]?.quantidade ?? 0;
const topo = (etapas: FunilEtapa[]) => etapas[0]?.quantidade ?? 0;

/** Conversão do próprio funil: base ÷ topo. É o número do selo de cada card. */
function conversaoPropria(etapas: FunilEtapa[]): number | null {
  const t = topo(etapas);
  return t > 0 ? (base(etapas) / t) * 100 : null;
}

/** Conversão ponta a ponta: lead captado (topo do SDR) → fechado (base do Comercial). */
function conversaoTotal(sdr: FunilEtapa[], comercial: FunilEtapa[]): number | null {
  const t = topo(sdr);
  return t > 0 ? (base(comercial) / t) * 100 : null;
}

/** Variação percentual — null quando não há base de comparação (divisão por 0). */
function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

function DeltaChip({ valor, sufixo, referencia }: { valor: number | null; sufixo: string; referencia: string }) {
  if (valor === null) {
    return <span className="text-[12.5px] text-muted-foreground">sem base em {referencia}</span>;
  }
  const positivo = valor >= 0;
  const sinal = positivo ? '+' : '−';
  return (
    <span
      className={`text-[12px] font-mono font-bold tabular-nums px-1.5 py-0.5 rounded whitespace-nowrap ${
        positivo ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
      }`}
    >
      {sinal}{Math.abs(valor).toFixed(1).replace('.', ',')}{sufixo} vs {referencia}
    </span>
  );
}

function KpiCard({
  rotulo, valor, legenda, delta, destaque = false,
}: {
  rotulo: string;
  valor: string;
  legenda: string;
  delta: React.ReactNode;
  destaque?: boolean;
}) {
  return (
    <Card className={`px-4 py-3 flex flex-col gap-0.5 ${destaque ? 'border-primary/50 bg-primary/5' : ''}`}>
      <p className="text-[12px] font-bold uppercase tracking-[0.13em] text-muted-foreground">{rotulo}</p>
      <p className="text-[38px] leading-[1.05] font-mono font-extrabold tabular-nums">{valor}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12.5px] text-muted-foreground">{legenda}</span>
        {delta}
      </div>
    </Card>
  );
}

function FunilCard({
  titulo, subtitulo, etapas, conversao, carregando, recorte,
}: {
  titulo: string;
  subtitulo: string;
  etapas: FunilEtapa[];
  conversao: number | null;
  carregando: boolean;
  /** Recorte no ar — troca ⇒ a cascata das faixas roda de novo. */
  recorte: string;
}) {
  return (
    <Card className="p-5 flex flex-col gap-3 min-h-0">
      <div className="flex items-center gap-3">
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border bg-muted/40 flex-shrink-0">
          <FilterIcon className="h-[18px] w-[18px] text-primary" />
        </span>
        <div className="min-w-0">
          <p className="text-xl font-bold leading-tight">{titulo}</p>
          <p className="text-[12.5px] text-muted-foreground leading-tight">{subtitulo}</p>
        </div>
        {conversao !== null && (
          <div className="ml-auto text-right flex-shrink-0">
            <p className="text-[22px] leading-none font-mono font-extrabold tabular-nums">
              {conversao.toFixed(1).replace('.', ',')}%
            </p>
            <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">conversão</p>
          </div>
        )}
      </div>
      {carregando ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <FunnelBands
          etapas={etapas}
          variante="tv"
          animacaoKey={recorte}
          textoVazio="Sem lançamento no período — lance na aba Funil de Vendas."
        />
      )}
    </Card>
  );
}

export function ComercialTvView({ visoes, trimestreLabel, qKey, visaoInicial }: ComercialTvViewProps) {
  // A troca de visão é um clique na própria tela — não uma página a mais na
  // rotação (decisão do Igor em 18/08/2026). Com 4 setores no telão, transformar
  // cada recorte em página fazia o Comercial sozinho ocupar metade da volta.
  const [visaoKey, setVisaoKey] = useState<string>(
    () => visaoInicial ?? visoes[visoes.length - 1].key,
  );
  // Fallback por identidade, não por índice: se o trimestre virar com o telão
  // ligado, a chave selecionada some da lista e a tela cai no acumulado novo
  // em vez de renderizar vazio.
  const visao = visoes.find(v => v.key === visaoKey) ?? visoes[visoes.length - 1];

  const { sdr, comercial, etapasDe, fallbackDe, isLoading } = useComercialFunil(visao.meses);

  // ── Faixa de KPIs: o trimestre inteiro, igual nas três visões ──────────
  const mesesDaVisaoAcumulada = visoes.find(v => v.tipo === 'acumulado')?.meses
    ?? visoes.flatMap(v => (v.tipo === 'mes' ? v.meses : []));

  const kpisMes = visoes
    .filter(v => v.tipo === 'mes')
    .map(v => {
      const mes = v.meses[0];
      const atual = base(etapasDe([mes]).comercial);
      const anterior = base(etapasDe([ymAnterior(mes)]).comercial);
      return {
        key: mes,
        rotulo: v.label,
        valor: atual,
        delta: variacao(atual, anterior),
        referencia: ymLabel(ymAnterior(mes)),
      };
    });

  const acumulado = etapasDe(mesesDaVisaoAcumulada);
  const qAnterior = qKeyAnterior(qKey);
  const anteriorTrimestre = etapasDe(mesesDoTrimestre(qAnterior));

  const acumuladoBase = base(acumulado.comercial);
  const deltaAcumulado = variacao(acumuladoBase, base(anteriorTrimestre.comercial));

  const conversaoAcumulada = conversaoTotal(acumulado.sdr, acumulado.comercial);
  const conversaoAnterior = conversaoTotal(anteriorTrimestre.sdr, anteriorTrimestre.comercial);
  const deltaConversao =
    conversaoAcumulada !== null && conversaoAnterior !== null
      ? conversaoAcumulada - conversaoAnterior
      : null;

  // Só o comparativo cita o trimestre anterior ('vs Q2') — e sai do calendário,
  // igual ao resto. O card do acumulado se chama só "Acumulado".
  const qAnteriorCurto = qLabel(qAnterior, false).split(' ')[0];

  return (
    <div className="w-full h-full flex flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[27px] font-bold leading-none">
          Funil de Vendas <span className="text-muted-foreground font-medium">· Comercial</span>
        </h2>
        <span className="text-[19px] font-bold font-mono px-4 py-1.5 rounded-lg border-2 border-primary/60 bg-primary/10 text-primary whitespace-nowrap">
          {trimestreLabel}
        </span>
      </div>

      {/* Abas clicáveis também no telão: a rotação do kiosk continua trocando de
          SETOR, e quem quiser abrir um mês específico na reunião clica aqui. */}
      <div className="flex items-center justify-center gap-2.5" aria-label="Visão exibida">
        {visoes.map(v => {
          const ativa = v.key === visao.key;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => setVisaoKey(v.key)}
              aria-current={ativa ? 'true' : undefined}
              className={`flex items-center gap-2 text-[17px] font-semibold rounded-full px-5 py-1.5 border whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                ativa
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
              }`}
            >
              <span className={`h-[7px] w-[7px] rounded-full bg-current ${ativa ? '' : 'opacity-50'}`} />
              {v.label}
            </button>
          );
        })}
      </div>

      {fallbackDe && (
        <p className="text-[13px] text-amber-500 text-center leading-none">
          Sem lançamento em {fallbackDe.map(ymLabel).join(', ')} — exibindo o último mês lançado.
        </p>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-2 gap-4">
        <FunilCard
          titulo="Funil SDR"
          subtitulo={
            visao.tipo === 'acumulado'
              ? `Soma de ${visao.meses.map(ymLabel).join(' + ')}`
              : 'Da captação do lead à transferência para o Comercial'
          }
          etapas={sdr}
          conversao={conversaoPropria(sdr)}
          carregando={isLoading}
          recorte={visao.key}
        />
        <FunilCard
          titulo="Funil Comercial"
          subtitulo={
            visao.tipo === 'acumulado'
              ? `Soma de ${visao.meses.map(ymLabel).join(' + ')}`
              : 'Da oportunidade recebida ao fechamento'
          }
          etapas={comercial}
          conversao={conversaoPropria(comercial)}
          carregando={isLoading}
          recorte={visao.key}
        />
      </div>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${kpisMes.length + 2}, minmax(0, 1fr))` }}
      >
        {kpisMes.map(k => (
          <KpiCard
            key={k.key}
            rotulo={k.rotulo}
            valor={isLoading ? '—' : k.valor.toLocaleString('pt-BR')}
            legenda="oportunidades fechadas"
            delta={<DeltaChip valor={k.delta} sufixo="%" referencia={k.referencia} />}
          />
        ))}
        <KpiCard
          destaque
          rotulo="Acumulado"
          valor={isLoading ? '—' : acumuladoBase.toLocaleString('pt-BR')}
          legenda="oportunidades fechadas"
          delta={<DeltaChip valor={deltaAcumulado} sufixo="%" referencia={qAnteriorCurto} />}
        />
        <KpiCard
          rotulo="Taxa de conversão"
          valor={
            isLoading || conversaoAcumulada === null
              ? '—'
              : `${conversaoAcumulada.toFixed(1).replace('.', ',')}%`
          }
          legenda="lead captado → fechado"
          delta={<DeltaChip valor={deltaConversao} sufixo=" p.p." referencia={qAnteriorCurto} />}
        />
      </div>

      <div className="flex items-center justify-between text-[12.5px] text-muted-foreground border-t pt-2">
        <span>Lançamento mensal — o trimestre é a soma dos meses</span>
        <span>{visao.tipo === 'acumulado' ? `Acumulado de ${visao.meses.length} meses` : ymLabel(visao.meses[0])}</span>
      </div>
    </div>
  );
}
