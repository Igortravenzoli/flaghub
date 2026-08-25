import { useMemo, useState } from 'react';
import { ArrowLeftRight, ChevronRight, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlocacaoLeadDevCard } from '@/components/fabrica/AlocacaoLeadDevCard';
import { cleanFabricaName } from '@/lib/fabricaNames';
import { fabricaColor } from '@/lib/chartColors';
import { buildHomeSquadMap, buildNaoContaSet, ehArea, GRUPOS_HORAS, homeSquadOf, normName, SEM_SQUAD, SQUADS } from '@/lib/fabricaRoster';
import { useFabricaRoster } from '@/hooks/useFabricaRoster';
import { useColaboradorAusencias } from '@/hooks/useColaboradorAusencias';
import { capacidadeMinutos, diasUteisAusentes, indexarAusencias } from '@/lib/capacidade';
import { businessDaysBetween } from '@/lib/sprintCalendar';
import { horasHM, horasHMComSinal } from '@/lib/formatHoras';

type FabricaScopeRow = {
  key: string;
  collaborators: { name: string; minutes: number }[];
};

type UsoCruzadoCardProps = {
  /** Linhas de horas por fábrica (Epic) com colaboradores — ex.: fab.horasPorFabricaFull. */
  fabricaRows: FabricaScopeRow[];
  /** Período do realizado — capacidade = h/dia × dias úteis nesse intervalo. */
  dateFrom?: Date | null;
  dateTo?: Date | null;
  /** Modo TV: só as barras, sem a matriz detalhada. */
  compact?: boolean;
  /** Preenche a altura do card (modo TV). */
  fill?: boolean;
  /** Task id -> PBI/Bug pai; habilita o nivel de PBI no drill dos devs. */
  pbiByTaskId?: Record<number, number>;
  /**
   * Apontamento fora dos épicos de squad (sem Épico ou Infra) — ex.:
   * `fab.horasForaDasFabricas`. Entra SÓ no balde "Sem squad": somar às squads
   * inflaria a utilização de quem está no roster.
   */
  foraDasFabricas?: FabricaScopeRow[];
  /** Abre o popup analítico de um colaborador a partir do drill. */
  onAnalisarColaborador?: (nome: string) => void;
};

const OUTRAS = 'Outras';
const COR_CRUZADO = 'hsl(28,92%,55%)';

/**
 * Teto de linhas no telão (TV). A lista cresceu ao passar a exibir capacidade
 * também das áreas de apoio — 4 fábricas + 4 áreas (+ "Sem squad") — e não
 * cabia mais na altura do card.
 *
 * O teto existe para o PRÓXIMO crescimento: telão não tem scroll nem mouse,
 * então sumir com uma linha em silêncio é o pior desfecho. Passando daqui, o
 * excedente é declarado como "+N" no rodapé. Com 9 nada é escondido hoje.
 */
const TV_MAX_LINHAS = 9;

// Horas em h:mm (mesma língua do DevOps e da planilha do gestor) — src/lib/formatHoras.ts.

/**
 * Capacidade × Realizado por squad (regra do gestor): capacidade = Σ h/dia dos
 * membros × dias úteis do período; realizado = timelog (DevOps) dos membros
 * fixos. A fatia âmbar do realizado é o uso cruzado (horas em item de outra
 * fábrica). Fora da diagonal na matriz = uso cruzado.
 */
export function UsoCruzadoCard({ fabricaRows, dateFrom, dateTo, compact = false, fill = false, pbiByTaskId, foraDasFabricas, onAnalisarColaborador }: UsoCruzadoCardProps) {
  const { data: rosterRows = [], isLoading: rosterLoading } = useFabricaRoster();
  const { data: ausencias = [] } = useColaboradorAusencias();
  const ausenciasPorPessoa = useMemo(() => indexarAusencias(ausencias), [ausencias]);
  const homeMap = useMemo(() => buildHomeSquadMap(rosterRows), [rosterRows]);
  // Lead só gestor (conta_horas=false) não conta como hora de fábrica — fora da capacidade e do realizado.
  const naoContaSet = useMemo(() => buildNaoContaSet(rosterRows), [rosterRows]);

  const businessDays = useMemo(
    () => (dateFrom && dateTo ? businessDaysBetween(dateFrom, dateTo) : null),
    [dateFrom, dateTo],
  );

  /**
   * Capacidade (minutos) por squad = Σ dos membros, cada um já sem os dias de
   * ausência dele dentro do período. Antes era `Σ h/dia × dias úteis`, igual
   * para todos: quem estava de férias entrava como capacidade fantasma e a
   * squad parecia ociosa (ver src/lib/capacidade.ts).
   *
   * `ausenteByHome` guarda quanto foi descontado, para a tela poder dizer POR QUE
   * a capacidade encolheu em vez de só mostrar um número menor.
   */
  const { capByHome, ausenteByHome } = useMemo(() => {
    const cap: Record<string, number> = {};
    const ausente: Record<string, number> = {};
    if (!businessDays || !dateFrom || !dateTo) return { capByHome: cap, ausenteByHome: ausente };
    for (const squad of GRUPOS_HORAS) {
      let total = 0;
      let descontado = 0;
      for (const r of rosterRows) {
        if (r.squad !== squad || r.conta_horas === false) continue;
        const dias = diasUteisAusentes(ausenciasPorPessoa.get(r.colaborador) ?? [], dateFrom, dateTo);
        total += capacidadeMinutos(r.capacidade_h_dia, businessDays, dias);
        descontado += capacidadeMinutos(r.capacidade_h_dia, dias);
      }
      cap[squad] = total;
      ausente[squad] = descontado;
    }
    return { capByHome: cap, ausenteByHome: ausente };
  }, [rosterRows, businessDays, dateFrom, dateTo, ausenciasPorPessoa]);

  const { matrix, squadTotals, crossTotals, semSquadMin, destinos, hasData } = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {};
    const destSet = new Set<string>();
    let semSquad = 0;
    const bump = (home: string, dest: string, min: number) => {
      (matrix[home] ??= {})[dest] = (matrix[home]?.[dest] ?? 0) + min;
    };
    for (const row of fabricaRows) {
      const clean = cleanFabricaName(row.key);
      const dest = SQUADS.includes(clean) ? clean : OUTRAS;
      destSet.add(dest);
      for (const c of row.collaborators) {
        if (naoContaSet.has(normName(c.name))) continue; // lead só gestor não conta
        const home = homeSquadOf(homeMap, c.name) ?? SEM_SQUAD;
        if (home === SEM_SQUAD) semSquad += c.minutes;
        bump(home, dest, c.minutes);
      }
    }
    /**
     * Horas fora dos épicos de squad entram SÓ para quem não tem squad de casa.
     * Somá-las a um membro do roster inflaria a utilização dele contra uma
     * capacidade que é medida sobre trabalho de squad.
     */
    let foraMin = 0;
    for (const row of foraDasFabricas ?? []) {
      for (const c of row.collaborators) {
        if (naoContaSet.has(normName(c.name))) continue;
        const home = homeSquadOf(homeMap, c.name);
        // Membro de FÁBRICA continua de fora: hora sem épico de squad inflaria a
        // utilização dele contra uma capacidade medida sobre trabalho de squad.
        if (home && !ehArea(home)) continue;
        foraMin += c.minutes;
        if (home) {
          /**
           * Área é o caso oposto: o trabalho dela VIVE fora dos épicos de squad
           * (o do Infra pendura no épico 2700, que é justamente o que
           * `horasPorFabricaFull` descarta). Sem esta linha, quem entra numa
           * área perde as horas duas vezes — não conta na fábrica porque não é
           * fábrica, e não conta em "Sem squad" porque agora tem casa. Em
           * 08/2026 isso deixou o INFRA com 1:30 de realizado.
           */
          bump(home, OUTRAS, c.minutes);
        } else {
          semSquad += c.minutes;
          bump(SEM_SQUAD, OUTRAS, c.minutes);
        }
      }
    }
    if (foraMin > 0) destSet.add(OUTRAS);

    /**
     * Os totais fecham DEPOIS do laço acima, nunca antes.
     *
     * Enquanto eram calculados antes, a barra de uma área lia o total sem as
     * horas fora de épico e a matriz lia com — mesmo card, dois números
     * diferentes (INFRA aparecia com 1:30 na barra e 64:41 na matriz).
     */
    const squadTotals: Record<string, number> = {};
    const crossTotals: Record<string, number> = {};
    for (const home of GRUPOS_HORAS) {
      const byDest = matrix[home] ?? {};
      const total = Object.values(byDest).reduce((s, v) => s + v, 0);
      squadTotals[home] = total;
      // Área não é destino de apontamento (o destino sai do Épico), então tudo
      // que ela faz seria lido como cruzado. Uso cruzado só existe entre fábricas.
      crossTotals[home] = ehArea(home) ? 0 : total - (byDest[home] ?? 0);
    }

    const destinos = [...SQUADS.filter((s) => destSet.has(s)), ...(destSet.has(OUTRAS) ? [OUTRAS] : [])];
    // "Sem squad" conta como dado: senão, filtrar alguém fora do roster deixava
    // o card vazio mesmo havendo horas apontadas.
    const hasData = Object.keys(matrix).length > 0
      && (GRUPOS_HORAS.some((s) => squadTotals[s] > 0) || semSquad > 0);
    return { matrix, squadTotals, crossTotals, semSquadMin: semSquad, destinos, hasData };
  }, [fabricaRows, foraDasFabricas, homeMap, naoContaSet]);

  const maxCap = useMemo(() => Math.max(1, ...GRUPOS_HORAS.map((s) => capByHome[s] ?? 0)), [capByHome]);
  const temCapacidade = !!businessDays && GRUPOS_HORAS.some((s) => (capByHome[s] ?? 0) > 0);

  /**
   * Densidade de telão. No modo TV o card divide a faixa de baixo com o
   * DailyProgress e recebe ~210px úteis de altura; com 8 linhas + divisor +
   * legenda o conteúdo passava de 260px e transbordava. Aqui encolhem só
   * respiro e paddings — o TEXTO fica no tamanho original, porque telão se lê
   * a 3–5 m e diminuir fonte seria trocar um defeito por outro.
   */
  const denso = compact && fill;

  /**
   * Linhas que realmente vão para a tela. Precisa ser resolvido ANTES do JSX:
   * o teto do telão só é aplicável sobre a lista já filtrada, senão o "+N"
   * contaria squads que nem seriam desenhadas (as sem hora e sem capacidade).
   */
  const gruposVisiveis = GRUPOS_HORAS.filter(
    (home) => (squadTotals[home] || 0) !== 0 || (capByHome[home] ?? 0) !== 0,
  );
  // "Sem squad" também ocupa uma linha; reservar o lugar dela evita estourar
  // justo no período em que aparece gente fora do roster.
  const tetoGrupos = Math.max(1, TV_MAX_LINHAS - (semSquadMin > 0 ? 1 : 0));
  const gruposExibidos = denso ? gruposVisiveis.slice(0, tetoGrupos) : gruposVisiveis;
  const gruposOcultos = gruposVisiveis.length - gruposExibidos.length;

  /**
   * Lead de cada squad. `papel='lead'` + `conta_horas` distingue os dois papéis:
   * quem só gerencia (horas fora da conta da fábrica) e quem também opera.
   * A fábrica é fixa, o lead pode mudar — por isso o nome fica num (i) discreto
   * ao lado da squad, não no lugar dela (decisão de 11/08/2026).
   */
  const leadPorSquad = useMemo(() => {
    const out: Record<string, { nome: string; papel: 'gestor' | 'executor' } | null> = {};
    for (const squad of GRUPOS_HORAS) {
      const lead = rosterRows.find((r) => r.squad === squad && r.papel === 'lead');
      out[squad] = lead
        ? { nome: lead.colaborador, papel: lead.conta_horas === false ? 'gestor' : 'executor' }
        : null;
    }
    return out;
  }, [rosterRows]);

  // Drill-down: qual squad está aberta na lista de desenvolvedores.
  const [squadAberta, setSquadAberta] = useState<string | null>(null);
  const podeAbrir = !compact;

  /**
   * Função, não componente: declarar um componente dentro do corpo de outro cria
   * um TIPO novo a cada render, e o Radix remonta perdendo o estado de aberto —
   * o tooltip nunca chegava a aparecer.
   */
  /**
   * O (i) da linha. Um só, para fábrica e para área.
   *
   * A área já teve um selo "ÁREA" ao lado do nome; saiu em 12/08/2026 por
   * poluir a linha. O que ele dizia virou um parágrafo dentro deste tooltip,
   * abaixo do lead — texto igual, lugar mais discreto. Quem separa fábrica de
   * área na leitura rápida é o divisor entre os dois blocos de barras.
   */
  /**
   * Primeira linha de área: onde entra o divisor entre fábricas de entrega e
   * áreas de apoio. Sem o selo por linha, é ele que faz a separação na leitura
   * rápida (pedido de 12/08/2026).
   *
   * Compara com a linha ANTERIOR JÁ EXIBIDA, não com a vizinha em
   * GRUPOS_HORAS: uma fábrica sem hora e sem capacidade não é desenhada, e
   * olhar para ela deixava o divisor no lugar errado (ou fora da tela).
   */
  const abreBlocoAreas = (home: string, anterior: string | undefined) =>
    ehArea(home) && !!anterior && !ehArea(anterior);

  const divisorAreas = (
    <div className={`flex items-center gap-2 ${denso ? 'pt-1 pb-0.5' : 'pt-2 pb-1'}`}>
      <span className={`text-[9px] uppercase tracking-wide text-muted-foreground/70 ${denso ? 'leading-none' : ''}`}>áreas de apoio</span>
      <span className="h-px flex-1 bg-border/60" />
    </div>
  );

  const leadInfo = (squad: string) => {
    const area = ehArea(squad);

    const lead = leadPorSquad[squad];
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={[
              lead ? `Lead ${lead.papel} da squad ${squad}: ${lead.nome}` : `${squad} sem lead definido`,
              area ? `${squad} é área de apoio: horas sim, KPI de entrega e qualidade não` : '',
            ].filter(Boolean).join('. ')}
            className="inline-flex items-center text-muted-foreground/70 hover:text-foreground transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className={`text-xs ${area ? 'max-w-xs' : ''}`}>
          {lead
            ? <>Lead {lead.papel === 'gestor' ? 'Gestor' : 'Executor'}: <b>{lead.nome}</b></>
            : <>Sem lead definido no roster</>}
          {area && (
            <p className="mt-1.5 border-t border-border/60 pt-1.5">
              Área de apoio: as horas aparecem nesta visão, mas <b>não são contabilizadas nos KPIs
              de entrega e de qualidade</b> nesta versão. Se for necessário que todas as áreas
              entrem nesses indicadores, solicitar ajuste.
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <Card className={fill ? 'h-full flex flex-col' : undefined}>
      <CardHeader className={denso ? 'px-4 pt-2 pb-1' : 'pb-2'}>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-primary" />
          Capacidade × Realizado por Squad
        </CardTitle>
      </CardHeader>
      {/*
        `justify-center` puro transborda para os DOIS lados quando o conteúdo
        excede a área, e a sobra de cima cobria o título (mesma classe de bug
        de 20/08/2026 no bloco Produtos do Comercial). `safe_center` centraliza
        enquanto cabe e degrada para o topo quando não cabe; o overflow-hidden
        garante que o que sobrar seja cortado embaixo, nunca por cima.
      */}
      <CardContent
        className={
          fill
            ? `flex-1 min-h-0 flex flex-col [justify-content:safe_center] overflow-hidden ${denso ? 'px-4 pb-2' : ''}`
            : undefined
        }
      >
        {rosterLoading ? (
          <p className="text-xs text-muted-foreground text-center py-8">Carregando roster das squads…</p>
        ) : rosterRows.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            Roster das squads não carregado (tabela <code>fabrica_squad_membership</code> vazia).
          </p>
        ) : !hasData ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            Sem apontamentos no período para cruzar com o roster das squads.
          </p>
        ) : (
          <>
            <div className={denso ? 'space-y-1' : 'space-y-2.5'}>
              {gruposExibidos.map((home, idx) => {
                const real = squadTotals[home] || 0;
                // Cor é posicional em GRUPOS_HORAS: usar o índice da lista
                // filtrada trocaria a cor da squad quando alguma some.
                const hi = GRUPOS_HORAS.indexOf(home);
                const anterior = gruposExibidos[idx - 1];
                const cor = fabricaColor(home, hi);
                const cross = crossTotals[home] || 0;
                const own = real - cross;
                const cap = capByHome[home] ?? 0;

                if (temCapacidade && cap > 0) {
                  const trackPct = (cap / maxCap) * 100;         // largura ∝ capacidade
                  const fillPct = Math.min(real / cap, 1) * 100;  // realizado dentro da capacidade
                  const ownPct = real > 0 ? (own / real) * 100 : 0;
                  const crossPct = real > 0 ? (cross / real) * 100 : 0;
                  const util = Math.round((real / cap) * 100);
                  const delta = real - cap;
                  const aberta = squadAberta === home;
                  return (
                    <div key={home}>
                    {abreBlocoAreas(home, anterior) && divisorAreas}
                    <div
                      className={`grid grid-cols-[148px_1fr_176px] items-center gap-3 rounded ${podeAbrir ? 'cursor-pointer hover:bg-muted/40' : ''}`}
                      onClick={podeAbrir ? () => setSquadAberta(aberta ? null : home) : undefined}
                      title={podeAbrir ? (aberta ? 'Recolher os desenvolvedores' : 'Ver os desenvolvedores da squad') : undefined}
                    >
                      <span className="flex items-center gap-1 text-sm font-semibold">
                        {podeAbrir && <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${aberta ? 'rotate-90' : ''}`} />}
                        <span className="inline-block w-2.5 h-2.5 shrink-0 rounded-sm" style={{ background: cor }} />
                        <span className="truncate" title={home}>{home}</span>
                        {leadInfo(home)}
                      </span>
                      <div
                        className="relative"
                        title={[
                          `capacidade ${horasHM(cap)}`,
                          `realizado ${horasHM(real)}`,
                          (ausenteByHome[home] ?? 0) > 0
                            ? `já descontado ${horasHM(ausenteByHome[home])} de ausência no período`
                            : '',
                        ].filter(Boolean).join(' · ')}
                      >
                        <div className="relative h-5 rounded overflow-hidden bg-[hsl(var(--muted))]" style={{ width: `${trackPct}%` }}>
                          {/* ociosa (hachura) */}
                          <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(90deg, transparent, transparent 5px, hsl(var(--border)) 5px, hsl(var(--border)) 6px)' }} />
                          {/* realizado: própria + cruzado */}
                          <div className="absolute inset-y-0 left-0 flex" style={{ width: `${fillPct}%` }}>
                            <div style={{ width: `${ownPct}%`, background: cor }} />
                            <div style={{ width: `${crossPct}%`, background: COR_CRUZADO }} title={`uso cruzado ${horasHM(cross)}`} />
                          </div>
                          {/* traço de 100% da capacidade (borda direita do track) */}
                          <div className="absolute inset-y-[-2px] right-0 w-0.5 bg-foreground/60" />
                        </div>
                      </div>
                      <span className="text-xs text-right tabular-nums">
                        <span className="font-mono font-semibold">{util}%</span>
                        <span className="text-muted-foreground"> · {horasHM(real)}/{horasHM(cap)} </span>
                        <span className={delta >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-destructive font-medium'}>{horasHMComSinal(delta)}</span>
                      </span>
                    </div>
                    {aberta && (
                      <div className="mt-1 mb-2 border rounded-lg overflow-hidden">
                        <AlocacaoLeadDevCard
                          fabricaRows={ehArea(home) ? [...fabricaRows, ...(foraDasFabricas ?? [])] : fabricaRows}
                          dateFrom={dateFrom}
                          dateTo={dateTo}
                          squadEmbutida={home}
                          pbiByTaskId={pbiByTaskId}
                          onAnalisarColaborador={onAnalisarColaborador}
                        />
                      </div>
                    )}
                    </div>
                  );
                }

                // Fallback (sem período/capacidade): só realizado, própria vs cruzado.
                const crossPctReal = real > 0 ? Math.round((cross / real) * 100) : 0;
                const abertaSemCap = squadAberta === home;
                return (
                  <div key={home}>
                  {abreBlocoAreas(home, anterior) && divisorAreas}
                  <div
                    className={`grid grid-cols-[148px_1fr_150px] items-center gap-3 rounded ${podeAbrir ? 'cursor-pointer hover:bg-muted/40' : ''}`}
                    onClick={podeAbrir ? () => setSquadAberta(abertaSemCap ? null : home) : undefined}
                  >
                    <span className="flex items-center gap-1 text-sm font-semibold">
                      {podeAbrir && <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${abertaSemCap ? 'rotate-90' : ''}`} />}
                      <span className="inline-block w-2.5 h-2.5 shrink-0 rounded-sm" style={{ background: cor }} />
                        <span className="truncate" title={home}>{home}</span>
                      {leadInfo(home)}
                    </span>
                    <div className="flex h-5 w-full overflow-hidden rounded bg-muted">
                      <div style={{ width: `${real > 0 ? (own / real) * 100 : 0}%`, background: cor }} />
                      <div style={{ width: `${real > 0 ? (cross / real) * 100 : 0}%`, background: COR_CRUZADO }} />
                    </div>
                    <span className="text-xs text-right tabular-nums">
                      <span className="font-mono font-semibold">{horasHM(real)}</span>
                      {cross > 0 && <span className="text-amber-600 dark:text-amber-400"> · {crossPctReal}% cruzado</span>}
                    </span>
                  </div>
                  {abertaSemCap && (
                    <div className="mt-1 mb-2 border rounded-lg overflow-hidden">
                      <AlocacaoLeadDevCard
                        fabricaRows={ehArea(home) ? [...fabricaRows, ...(foraDasFabricas ?? [])] : fabricaRows}
                        dateFrom={dateFrom}
                        dateTo={dateTo}
                        squadEmbutida={home}
                        pbiByTaskId={pbiByTaskId}
                        onAnalisarColaborador={onAnalisarColaborador}
                      />
                    </div>
                  )}
                  </div>
                );
              })}

              {/*
                "Sem squad" também abre. Quem não está no roster (Igor, Ana,
                Leonardo, Mauricio, Rodolfo…) só aparecia como linha da matriz:
                filtrar uma dessas pessoas no topo zerava as 4 squads e o card
                dizia "sem apontamentos", sem PBI nem task (reportado em 11/08/2026).
              */}
              {semSquadMin > 0 && (() => {
                const aberta = squadAberta === SEM_SQUAD;
                return (
                  <div key={SEM_SQUAD}>
                    <div
                      className={`grid grid-cols-[148px_1fr_176px] items-center gap-3 rounded ${podeAbrir ? 'cursor-pointer hover:bg-muted/40' : ''}`}
                      onClick={podeAbrir ? () => setSquadAberta(aberta ? null : SEM_SQUAD) : undefined}
                      title={podeAbrir ? 'Ver quem apontou fora do roster das squads' : undefined}
                    >
                      <span className="flex items-center gap-1 text-sm font-semibold text-muted-foreground">
                        {podeAbrir && <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${aberta ? 'rotate-90' : ''}`} />}
                        <span className="inline-block w-2.5 h-2.5 shrink-0 rounded-sm bg-muted-foreground/40" />
                        <span className="truncate" title={SEM_SQUAD}>{SEM_SQUAD}</span>
                      </span>
                      <div className="flex h-5 w-full overflow-hidden rounded bg-muted">
                        <div style={{ width: '100%', background: 'hsl(var(--muted-foreground) / 0.35)' }} />
                      </div>
                      <span className="text-xs text-right tabular-nums">
                        <span className="font-mono font-semibold">{horasHM(semSquadMin)}</span>
                        <span className="text-muted-foreground"> · fora do roster</span>
                      </span>
                    </div>
                    {aberta && (
                      <div className="mt-1 mb-2 border rounded-lg overflow-hidden">
                        <AlocacaoLeadDevCard
                          fabricaRows={[...fabricaRows, ...(foraDasFabricas ?? [])]}
                          dateFrom={dateFrom}
                          dateTo={dateTo}
                          squadEmbutida={SEM_SQUAD}
                          pbiByTaskId={pbiByTaskId}
                          onAnalisarColaborador={onAnalisarColaborador}
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/*
              Telão não tem scroll: se alguma squad não coube, ela é DECLARADA
              aqui. Some em silêncio = quem olha a TV lê o card como completo.
            */}
            {gruposOcultos > 0 && (
              <p className="text-[10px] text-muted-foreground/80 pt-1">
                +{gruposOcultos} {gruposOcultos === 1 ? 'squad não exibida' : 'squads não exibidas'} — sem espaço no telão
              </p>
            )}

            {/* Matriz origem → destino */}
            <div className={`mt-4 overflow-x-auto ${compact ? 'hidden' : ''}`}>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-medium py-1.5 pr-2">origem ↓ / destino →</th>
                    {destinos.map((d) => (
                      <th key={d} className="text-center font-medium px-2" style={{ color: d === OUTRAS ? undefined : fabricaColor(d, destinos.indexOf(d)) }}>{d}</th>
                    ))}
                    <th className="text-right font-medium pl-2">total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...GRUPOS_HORAS, ...(semSquadMin > 0 ? [SEM_SQUAD] : [])].map((home, hi, lista) => {
                    const byDest = matrix[home] ?? {};
                    const total = Object.values(byDest).reduce((s, v) => s + v, 0);
                    if (total === 0) return null;
                    return (
                      <tr key={home} className={abreBlocoAreas(home, lista[hi - 1]) ? 'border-t-2 border-border' : 'border-t border-border/60'}>
                        <th className="text-left font-semibold py-1.5 pr-2">{home}</th>
                        {destinos.map((dest) => {
                          const min = byDest[dest] ?? 0;
                          const isCross = home !== dest && min > 0 && home !== SEM_SQUAD && !ehArea(home);
                          return (
                            <td
                              key={dest}
                              className={`text-center px-2 font-mono tabular-nums ${isCross ? 'text-amber-700 dark:text-amber-300 font-semibold' : min > 0 ? '' : 'text-muted-foreground/40'}`}
                              style={isCross ? { background: 'hsl(28,92%,55%,0.12)' } : undefined}
                            >
                              {min > 0 ? horasHM(min) : '—'}
                            </td>
                          );
                        })}
                        <td className="text-right pl-2 font-mono font-semibold tabular-nums">{horasHM(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legenda enxuta: o parágrafo antigo tinha 4 linhas e competia com os dados. */}
            <p className={`text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 ${denso ? 'text-[10px] mt-1' : 'text-[11px] mt-2'}`}>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-2.5 h-2 rounded-sm" style={{ background: COR_CRUZADO }} />uso cruzado
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-2.5 h-2 rounded-sm" style={{ background: 'repeating-linear-gradient(90deg, transparent, transparent 2px, hsl(var(--border)) 2px, hsl(var(--border)) 3px)', border: '1px solid hsl(var(--border))' }} />ociosa
              </span>
              {temCapacidade
                ? <span>traço = 100% da capacidade ({businessDays} dias úteis)</span>
                : <span>selecione uma sprint para ver a capacidade</span>}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="inline-flex items-center text-muted-foreground/70 hover:text-foreground" aria-label="Como ler este card">
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  Capacidade = Σ h/dia dos membros × dias úteis do período; lead só gestor não conta.
                  A barra preenchida é o realizado.
                  {podeAbrir && ' No dev, o chip verde é a fábrica de casa e o âmbar é o uso cruzado — os dois somados dão o total da pessoa.'}
                  {' '}Abaixo do divisor ficam as áreas de apoio: elas mostram horas, mas não entram
                  nos KPIs de entrega e de qualidade nesta versão.
                  {' '}Na matriz, a diagonal só existe para fábrica: como o destino sai do Épico do item
                  e não há épico de área, a linha de uma área mostra EM QUAL fábrica ela trabalhou, e
                  isso não é uso cruzado. O que sobra cai em "Outras" (o trabalho próprio da área, como
                  o épico de Infra).
                  {podeAbrir && ' Clique na squad para abrir os desenvolvedores, no desenvolvedor para ver os PBIs, no PBI para ver as tasks e na task para ver cada lançamento.'}
                  {semSquadMin > 0 && ` "${SEM_SQUAD}" = ${horasHM(semSquadMin)} de quem não está no roster.`}
                </TooltipContent>
              </Tooltip>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
