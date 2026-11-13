import { useMemo, useState } from 'react';
import { ArrowLeftRight, ChevronRight, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlocacaoLeadDevCard } from '@/components/fabrica/AlocacaoLeadDevCard';
import { cleanFabricaName } from '@/lib/fabricaNames';
import { fabricaColor } from '@/lib/chartColors';
import { alocacaoPct, buildAlocacaoMap, buildNaoContaSet, casasDe, ehArea, GRUPOS_HORAS, normName, SEM_SQUAD, SQUADS } from '@/lib/fabricaRoster';
import { epicoDaFabrica, fabricaOrg, fabricasDoGrupo, GRUPOS, grupoDaFabrica, rotuloFabrica, rotuloFabricaLongo, type GrupoId } from '@/lib/fabricaOrganograma';
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
/** Até quantos grupos o telão comporta COM a linha de fábricas sob cada um. */
const TV_MAX_GRUPOS_COM_FABRICAS = 4;

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
  /**
   * Casas de cada pessoa, com o rateio das horas. Só entram as linhas que
   * contam hora: quem é gestor numa fábrica e executor na outra tem as horas
   * todas na fábrica em que executa.
   */
  const alocMap = useMemo(
    () => buildAlocacaoMap(rosterRows.filter((r) => r.conta_horas !== false)),
    [rosterRows],
  );
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
        // Alocação parcial: a fábrica só dispõe da fatia da jornada que é dela.
        const hDia = (Number(r.capacidade_h_dia) || 0) * alocacaoPct(r) / 100;
        total += capacidadeMinutos(hDia, businessDays, dias);
        descontado += capacidadeMinutos(hDia, dias);
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
        const casas = casasDe(alocMap, c.name);
        if (casas.length === 0) {
          semSquad += c.minutes;
          bump(SEM_SQUAD, dest, c.minutes);
          continue;
        }
        // Quem divide o tempo entre duas fábricas tem a hora rateada pela
        // alocação: não existe Épico por fábrica nova para dizer onde ela caiu.
        for (const casa of casas) bump(casa.squad, dest, c.minutes * casa.peso);
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
        const casas = casasDe(alocMap, c.name);
        if (casas.length === 0) {
          foraMin += c.minutes;
          semSquad += c.minutes;
          bump(SEM_SQUAD, OUTRAS, c.minutes);
          continue;
        }
        for (const casa of casas) {
          // Fatia de FÁBRICA continua de fora: hora sem épico de squad inflaria
          // a utilização contra uma capacidade medida sobre trabalho de squad.
          if (!ehArea(casa.squad)) continue;
          /**
           * Área é o caso oposto: o trabalho dela VIVE fora dos épicos de squad
           * (o do Infra pendura no épico 2700, que é justamente o que
           * `horasPorFabricaFull` descarta). Sem esta linha, quem entra numa
           * área perde as horas duas vezes — não conta na fábrica porque não é
           * fábrica, e não conta em "Sem squad" porque agora tem casa. Em
           * 08/2026 isso deixou o INFRA com 1:30 de realizado.
           */
          const min = c.minutes * casa.peso;
          foraMin += min;
          bump(casa.squad, OUTRAS, min);
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
      /**
       * Uso cruzado = hora da fábrica em item de OUTRO Épico. Só dá para medir
       * onde a fábrica tem um Épico de squad que ainda a representa (STAGING e
       * APP, além das squads do formato anterior). Para as demais não existe
       * "casa" no DevOps: tratar tudo como cruzado pintaria a fábrica inteira
       * de âmbar por um motivo que não é dela.
       */
      const epico = epicoDaFabrica(home);
      crossTotals[home] = epico ? total - (byDest[epico] ?? 0) : 0;
    }

    const destinos = [...SQUADS.filter((s) => destSet.has(s)), ...(destSet.has(OUTRAS) ? [OUTRAS] : [])];
    // "Sem squad" conta como dado: senão, filtrar alguém fora do roster deixava
    // o card vazio mesmo havendo horas apontadas.
    const hasData = Object.keys(matrix).length > 0
      && (GRUPOS_HORAS.some((s) => squadTotals[s] > 0) || semSquad > 0);
    return { matrix, squadTotals, crossTotals, semSquadMin: semSquad, destinos, hasData };
  }, [fabricaRows, foraDasFabricas, alocMap, naoContaSet]);

  const temCapacidade = !!businessDays && GRUPOS_HORAS.some((s) => (capByHome[s] ?? 0) > 0);

  /**
   * Densidade de telão. No modo TV o card divide a faixa de baixo com o
   * DailyProgress e recebe ~210px úteis de altura. Aqui encolhem só respiro e
   * paddings — o TEXTO fica no tamanho original, porque telão se lê a 3–5 m e
   * diminuir fonte seria trocar um defeito por outro.
   */
  const denso = compact && fill;

  // Fábricas que têm o que mostrar (hora ou capacidade) no período.
  const fabricasVisiveis = GRUPOS_HORAS.filter(
    (home) => (squadTotals[home] || 0) !== 0 || (capByHome[home] ?? 0) !== 0,
  );

  /**
   * Consolidado por grupo do organograma (Sustentação, Evolução, Híbrida, áreas
   * de apoio). É o primeiro nível da leitura: o grupo abre nas fábricas dele, e
   * a fábrica abre nas pessoas.
   *
   * Grupo é sempre SOMA das fábricas — capacidade, realizado e ausência. Nunca
   * média de percentuais: fábrica de uma pessoa pesaria igual à de cinco.
   */
  const gruposResumo = GRUPOS.map((grupo) => {
    const fabs = fabricasDoGrupo(grupo.id).map((f) => f.codigo).filter((c) => fabricasVisiveis.includes(c));
    const soma = (rec: Record<string, number>) => fabs.reduce((s, c) => s + (rec[c] ?? 0), 0);
    return { grupo, fabs, real: soma(squadTotals), cross: soma(crossTotals), cap: soma(capByHome), ausente: soma(ausenteByHome) };
  }).filter((g) => g.fabs.length > 0);
  /**
   * UMA escala de horas para o card inteiro: a barra da fábrica usa a mesma
   * régua da barra do grupo. Assim a fábrica nunca fica mais comprida que o
   * grupo que a contém, e as fábricas abertas somam visualmente o grupo.
   */
  const maxCapGrupo = Math.max(1, ...gruposResumo.map((g) => g.cap));
  const maxRealGrupo = Math.max(1, ...gruposResumo.map((g) => g.real));

  /**
   * Teto de linhas do telão, agora contado em GRUPOS: no modo TV o card mostra
   * só o consolidado (não há mouse para abrir o grupo). "Sem squad" também
   * ocupa uma linha; reservar o lugar dela evita estourar justo no período em
   * que aparece gente fora do roster.
   */
  const tetoGrupos = Math.max(1, TV_MAX_LINHAS - (semSquadMin > 0 ? 1 : 0));
  const gruposExibidos = denso ? gruposResumo.slice(0, tetoGrupos) : gruposResumo;
  const gruposOcultos = gruposResumo.length - gruposExibidos.length;
  /**
   * No telão o grupo não abre, então a fábrica aparece numa linha de texto sob
   * a barra do grupo (nome + utilização). Medido na caixa real de 524×286: 4
   * grupos com essa linha + "Sem squad" + legenda ocupam ~228 de 244px úteis.
   * Um quinto grupo já não cabe — aí a linha some e fica só a barra empilhada.
   */
  const fabricasNoTelao = denso && gruposExibidos.length <= TV_MAX_GRUPOS_COM_FABRICAS;

  /**
   * Lead de cada fábrica. `papel='lead'` + `conta_horas` distingue os dois papéis:
   * quem só gerencia (horas fora da conta da fábrica) e quem também opera.
   * A fábrica é fixa, o lead pode mudar — por isso o nome fica num (i) discreto
   * ao lado da fábrica, não no lugar dela (decisão de 11/08/2026).
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

  // Drill: grupos abertos (vários ao mesmo tempo) e a fábrica aberta nas pessoas.
  const [gruposAbertos, setGruposAbertos] = useState<Set<GrupoId>>(new Set());
  const [squadAberta, setSquadAberta] = useState<string | null>(null);
  const podeAbrir = !compact;
  const todosAbertos = gruposResumo.length > 0 && gruposResumo.every((g) => gruposAbertos.has(g.grupo.id));
  const alternarGrupo = (id: GrupoId) => setGruposAbertos((atual) => {
    const novo = new Set(atual);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    return novo;
  });
  const alternarTodos = () =>
    setGruposAbertos(todosAbertos ? new Set() : new Set(gruposResumo.map((g) => g.grupo.id)));

  // Coluna do nome mais larga fora do telão: a fábrica entra recuada sob o grupo.
  const colunas = denso ? 'grid-cols-[148px_1fr_176px]' : 'grid-cols-[184px_1fr_176px]';

  /**
   * As linhas são FUNÇÕES, não componentes: declarar um componente dentro do
   * corpo de outro cria um TIPO novo a cada render, e o Radix remonta perdendo
   * o estado de aberto — o tooltip nunca chegava a aparecer.
   *
   * O (i) da linha é um só, para fábrica e para área. O que o selo "ÁREA" dizia
   * (saiu em 12/08/2026 por poluir a linha) virou um parágrafo deste tooltip.
   */
  const leadInfo = (squad: string) => {
    const area = ehArea(squad);
    const nome = rotuloFabricaLongo(squad);
    const produtos = fabricaOrg(squad)?.produtos;
    const lead = leadPorSquad[squad];
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={[
              lead ? `Lead ${lead.papel} de ${nome}: ${lead.nome}` : `${nome} sem lead definido`,
              area ? `${nome} conta só horas: KPI de entrega e qualidade não` : '',
            ].filter(Boolean).join('. ')}
            className="inline-flex items-center text-muted-foreground/70 hover:text-foreground transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {lead
            ? <>Lead {lead.papel === 'gestor' ? 'Gestor' : 'Executor'}: <b>{lead.nome}</b></>
            : <>Sem lead definido no roster</>}
          {produtos && <p className="mt-1 text-muted-foreground">{produtos}</p>}
          {area && (
            <p className="mt-1.5 border-t border-border/60 pt-1.5">
              Só horas: aparecem nesta visão, mas <b>não são contabilizadas nos KPIs
              de entrega e de qualidade</b> nesta versão. Se for necessário que entrem
              nesses indicadores, solicitar ajuste.
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    );
  };

  /** Pessoas da fábrica (ou de quem está fora do roster): dev › PBI › task › lançamento. */
  const drillPessoas = (home: string) => (
    <div className={`mt-1 mb-2 border rounded-lg overflow-hidden ${home === SEM_SQUAD ? '' : 'ml-4'}`}>
      <AlocacaoLeadDevCard
        fabricaRows={home === SEM_SQUAD || ehArea(home) ? [...fabricaRows, ...(foraDasFabricas ?? [])] : fabricaRows}
        dateFrom={dateFrom}
        dateTo={dateTo}
        squadEmbutida={home}
        pbiByTaskId={pbiByTaskId}
        onAnalisarColaborador={onAnalisarColaborador}
      />
    </div>
  );

  /** Linha de uma fábrica, recuada sob o grupo. Abre as pessoas. */
  const linhaFabrica = (home: string) => {
    const real = squadTotals[home] || 0;
    const cor = fabricaColor(home, GRUPOS_HORAS.indexOf(home));
    const cross = crossTotals[home] || 0;
    const own = real - cross;
    const cap = capByHome[home] ?? 0;
    const comCap = temCapacidade && cap > 0;
    const aberta = squadAberta === home;
    const ownPct = real > 0 ? (own / real) * 100 : 0;
    const crossPct = real > 0 ? (cross / real) * 100 : 0;
    const delta = real - cap;
    return (
      <div key={home}>
        <div
          className={`grid ${colunas} items-center gap-3 rounded pl-4 ${podeAbrir ? 'cursor-pointer hover:bg-muted/40' : ''}`}
          onClick={podeAbrir ? () => setSquadAberta(aberta ? null : home) : undefined}
          title={podeAbrir ? (aberta ? 'Recolher as pessoas' : 'Ver as pessoas da fábrica') : undefined}
        >
          <span className="flex min-w-0 items-center gap-1 text-sm font-medium">
            {podeAbrir && <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${aberta ? 'rotate-90' : ''}`} />}
            <span className="inline-block w-2.5 h-2.5 shrink-0 rounded-sm" style={{ background: cor }} />
            <span className="truncate" title={rotuloFabricaLongo(home)}>{rotuloFabrica(home)}</span>
            {leadInfo(home)}
          </span>
          {comCap ? (
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
              <div className="relative h-4 rounded overflow-hidden bg-[hsl(var(--muted))]" style={{ width: `${(cap / maxCapGrupo) * 100}%` }}>
                {/* ociosa (hachura) */}
                <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(90deg, transparent, transparent 5px, hsl(var(--border)) 5px, hsl(var(--border)) 6px)' }} />
                {/* realizado: própria + cruzado */}
                <div className="absolute inset-y-0 left-0 flex" style={{ width: `${Math.min(real / cap, 1) * 100}%` }}>
                  <div style={{ width: `${ownPct}%`, background: cor }} />
                  <div style={{ width: `${crossPct}%`, background: COR_CRUZADO }} title={`uso cruzado ${horasHM(cross)}`} />
                </div>
                {/* traço de 100% da capacidade (borda direita do track) */}
                <div className="absolute inset-y-[-2px] right-0 w-0.5 bg-foreground/60" />
              </div>
            </div>
          ) : (
            // Sem período/capacidade: só realizado, própria vs cruzado.
            <div className="h-4 w-full overflow-hidden rounded bg-muted">
              <div className="flex h-full" style={{ width: `${(real / maxRealGrupo) * 100}%` }}>
                <div style={{ width: `${ownPct}%`, background: cor }} />
                <div style={{ width: `${crossPct}%`, background: COR_CRUZADO }} />
              </div>
            </div>
          )}
          <span className="text-xs text-right tabular-nums">
            {comCap ? (
              <>
                <span className="font-mono font-semibold">{Math.round((real / cap) * 100)}%</span>
                <span className="text-muted-foreground"> · {horasHM(real)}/{horasHM(cap)} </span>
                <span className={delta >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-destructive font-medium'}>{horasHMComSinal(delta)}</span>
              </>
            ) : (
              <>
                <span className="font-mono font-semibold">{horasHM(real)}</span>
                {cross > 0 && <span className="text-amber-600 dark:text-amber-400"> · {Math.round((cross / real) * 100)}% cruzado</span>}
              </>
            )}
          </span>
        </div>
        {aberta && drillPessoas(home)}
      </div>
    );
  };

  /**
   * Linha consolidada do grupo. A barra é empilhada: cada trecho é uma fábrica,
   * no tom dela — dá para ver de onde vem o realizado sem abrir o grupo, que é
   * o que o telão precisa (lá o grupo não abre).
   */
  const linhaGrupo = (g: (typeof gruposResumo)[number]) => {
    const { grupo, fabs, real, cap, cross } = g;
    const aberto = podeAbrir && gruposAbertos.has(grupo.id);
    const comCap = temCapacidade && cap > 0;
    const delta = real - cap;
    const trechos = fabs
      .map((c) => ({ c, min: squadTotals[c] || 0 }))
      .filter((t) => t.min > 0);
    const pilha = trechos.map((t, i) => (
      <div
        key={t.c}
        className={i > 0 ? 'border-l border-background/80' : undefined}
        style={{ width: `${(t.min / real) * 100}%`, background: fabricaColor(t.c, GRUPOS_HORAS.indexOf(t.c)) }}
        title={`${rotuloFabrica(t.c)}: ${horasHM(t.min)}`}
      />
    ));
    return (
      <div key={grupo.id}>
        <div
          className={`grid ${colunas} items-center gap-3 rounded ${podeAbrir ? 'cursor-pointer hover:bg-muted/40' : ''}`}
          onClick={podeAbrir ? () => alternarGrupo(grupo.id) : undefined}
          title={podeAbrir ? `${grupo.descricao} ${aberto ? 'Clique para recolher.' : 'Clique para abrir as fábricas.'}` : undefined}
          aria-expanded={podeAbrir ? aberto : undefined}
        >
          <span className="flex min-w-0 items-center gap-1 text-sm font-semibold">
            {podeAbrir && <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${aberto ? 'rotate-90' : ''}`} />}
            <span className="inline-block w-2.5 h-2.5 shrink-0 rounded-sm" style={{ background: grupo.cor }} />
            <span className="truncate">{grupo.rotulo}</span>
            {!denso && (
              <span className="shrink-0 text-[10px] font-normal text-muted-foreground" title={fabs.map(rotuloFabrica).join(', ')}>
                {fabs.length} {grupo.id === 'APOIO'
                  ? (fabs.length === 1 ? 'área' : 'áreas')
                  : (fabs.length === 1 ? 'fábrica' : 'fábricas')}
              </span>
            )}
          </span>
          {comCap ? (
            <div
              className="relative"
              title={[
                `capacidade ${horasHM(cap)}`,
                `realizado ${horasHM(real)}`,
                cross > 0 ? `uso cruzado ${horasHM(cross)}` : '',
                g.ausente > 0 ? `já descontado ${horasHM(g.ausente)} de ausência no período` : '',
              ].filter(Boolean).join(' · ')}
            >
              <div className="relative h-5 rounded overflow-hidden bg-[hsl(var(--muted))]" style={{ width: `${(cap / maxCapGrupo) * 100}%` }}>
                <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(90deg, transparent, transparent 5px, hsl(var(--border)) 5px, hsl(var(--border)) 6px)' }} />
                <div className="absolute inset-y-0 left-0 flex" style={{ width: `${Math.min(real / cap, 1) * 100}%` }}>{pilha}</div>
                <div className="absolute inset-y-[-2px] right-0 w-0.5 bg-foreground/60" />
              </div>
            </div>
          ) : (
            <div className="h-5 w-full overflow-hidden rounded bg-muted">
              <div className="flex h-full" style={{ width: `${(real / maxRealGrupo) * 100}%` }}>{pilha}</div>
            </div>
          )}
          <span className="text-xs text-right tabular-nums">
            {comCap ? (
              <>
                <span className="font-mono font-semibold">{Math.round((real / cap) * 100)}%</span>
                <span className="text-muted-foreground"> · {horasHM(real)}/{horasHM(cap)} </span>
                <span className={delta >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-destructive font-medium'}>{horasHMComSinal(delta)}</span>
              </>
            ) : (
              <>
                <span className="font-mono font-semibold">{horasHM(real)}</span>
                {cross > 0 && <span className="text-amber-600 dark:text-amber-400"> · {Math.round((cross / real) * 100)}% cruzado</span>}
              </>
            )}
          </span>
        </div>
        {fabricasNoTelao && (
          <p className="mt-0.5 flex gap-x-2.5 overflow-hidden whitespace-nowrap pl-[160px] text-[11px] leading-4 text-muted-foreground">
            {fabs.map((c) => {
              const capF = capByHome[c] ?? 0;
              const realF = squadTotals[c] || 0;
              return (
                <span key={c} className="inline-flex shrink-0 items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-sm" style={{ background: fabricaColor(c, GRUPOS_HORAS.indexOf(c)) }} />
                  {rotuloFabrica(c)}
                  <span className="font-mono font-semibold text-foreground">
                    {temCapacidade && capF > 0 ? `${Math.round((realF / capF) * 100)}%` : horasHM(realF)}
                  </span>
                </span>
              );
            })}
          </p>
        )}
        {aberto && (
          <div className="mt-1.5 mb-1 space-y-1.5 border-l-2 pl-0" style={{ borderColor: grupo.cor }}>
            {fabs.map(linhaFabrica)}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className={fill ? 'h-full flex flex-col' : undefined}>
      <CardHeader className={denso ? 'px-4 pt-2 pb-1' : 'pb-2'}>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-primary" />
          Capacidade × Realizado por Fábrica
          {podeAbrir && hasData && gruposResumo.length > 0 && (
            <button
              type="button"
              className="ml-auto text-[11px] font-normal text-muted-foreground hover:text-foreground transition-colors"
              onClick={alternarTodos}
            >
              {todosAbertos ? 'Recolher grupos' : 'Abrir todas as fábricas'}
            </button>
          )}
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
          <p className="text-xs text-muted-foreground text-center py-8">Carregando roster das fábricas…</p>
        ) : rosterRows.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            Roster das fábricas não carregado (tabela <code>fabrica_squad_membership</code> vazia).
          </p>
        ) : !hasData ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            Sem apontamentos no período para cruzar com o roster das fábricas.
          </p>
        ) : (
          <>
            <div className={denso ? 'space-y-1.5' : 'space-y-2.5'}>
              {gruposExibidos.map(linhaGrupo)}

              {/*
                "Sem squad" também abre. Quem não está no roster só aparecia como
                linha da matriz: filtrar uma dessas pessoas no topo zerava as
                fábricas e o card dizia "sem apontamentos", sem PBI nem task
                (reportado em 11/08/2026).
              */}
              {semSquadMin > 0 && (() => {
                const aberta = squadAberta === SEM_SQUAD;
                return (
                  <div key={SEM_SQUAD}>
                    <div
                      className={`grid ${colunas} items-center gap-3 rounded ${podeAbrir ? 'cursor-pointer hover:bg-muted/40' : ''}`}
                      onClick={podeAbrir ? () => setSquadAberta(aberta ? null : SEM_SQUAD) : undefined}
                      title={podeAbrir ? 'Ver quem apontou fora do roster das fábricas' : undefined}
                    >
                      <span className="flex items-center gap-1 text-sm font-semibold text-muted-foreground">
                        {podeAbrir && <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${aberta ? 'rotate-90' : ''}`} />}
                        <span className="inline-block w-2.5 h-2.5 shrink-0 rounded-sm bg-muted-foreground/40" />
                        <span className="truncate" title={SEM_SQUAD}>{SEM_SQUAD}</span>
                      </span>
                      {/* Mesma régua de horas dos grupos: cheia, a barra parecia maior que uma fábrica inteira. */}
                      <div className="h-5 w-full overflow-hidden rounded bg-muted">
                        <div className="h-full" style={{ width: `${Math.min(semSquadMin / (temCapacidade ? maxCapGrupo : maxRealGrupo), 1) * 100}%`, minWidth: 4, background: 'hsl(var(--muted-foreground) / 0.35)' }} />
                      </div>
                      <span className="text-xs text-right tabular-nums">
                        <span className="font-mono font-semibold">{horasHM(semSquadMin)}</span>
                        <span className="text-muted-foreground"> · fora do roster</span>
                      </span>
                    </div>
                    {aberta && drillPessoas(SEM_SQUAD)}
                  </div>
                );
              })()}
            </div>

            {/*
              Telão não tem scroll: se algum grupo não coube, ele é DECLARADO
              aqui. Some em silêncio = quem olha a TV lê o card como completo.
            */}
            {gruposOcultos > 0 && (
              <p className="text-[10px] text-muted-foreground/80 pt-1">
                +{gruposOcultos} {gruposOcultos === 1 ? 'grupo não exibido' : 'grupos não exibidos'} — sem espaço no telão
              </p>
            )}

            {/*
              Matriz origem → destino. A origem é a fábrica de casa da pessoa
              (organograma); o destino é o Épico do item no DevOps, que ainda
              segue o formato anterior. Por isso as colunas não repetem as linhas.
            */}
            <div className={`mt-4 overflow-x-auto ${compact ? 'hidden' : ''}`}>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-medium py-1.5 pr-2">fábrica ↓ / Épico do item →</th>
                    {destinos.map((d) => (
                      <th key={d} className="text-center font-medium px-2" style={{ color: d === OUTRAS ? undefined : fabricaColor(d, destinos.indexOf(d)) }}>{d}</th>
                    ))}
                    <th className="text-right font-medium pl-2">total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...GRUPOS_HORAS, ...(semSquadMin > 0 ? [SEM_SQUAD] : [])]
                    .filter((home) => Object.values(matrix[home] ?? {}).some((v) => v > 0))
                    .map((home, hi, lista) => {
                    const byDest = matrix[home] ?? {};
                    const total = Object.values(byDest).reduce((s, v) => s + v, 0);
                    // Traço mais forte onde muda o grupo: separa os blocos sem repetir o nome dele.
                    const mudouGrupo = hi > 0 && grupoDaFabrica(home)?.id !== grupoDaFabrica(lista[hi - 1])?.id;
                    const epico = epicoDaFabrica(home);
                    return (
                      <tr key={home} className={mudouGrupo ? 'border-t-2 border-border' : 'border-t border-border/60'}>
                        <th className="text-left font-semibold py-1.5 pr-2">
                          <span className="inline-flex items-center gap-1.5">
                            {home !== SEM_SQUAD && <span className="inline-block w-2 h-2 shrink-0 rounded-sm" style={{ background: fabricaColor(home, hi) }} />}
                            {rotuloFabricaLongo(home)}
                          </span>
                        </th>
                        {destinos.map((dest) => {
                          const min = byDest[dest] ?? 0;
                          // Só é cruzado onde a fábrica tem Épico próprio para comparar.
                          const isCross = !!epico && epico !== dest && min > 0;
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
                  Capacidade = Σ h/dia dos membros × alocação × dias úteis do período; lead só gestor
                  não conta. A barra preenchida é o realizado; no grupo, cada trecho é uma fábrica.
                  {' '}Quem divide o tempo entre duas fábricas entra com a fatia da capacidade e das
                  horas em cada uma, pelo percentual de alocação do cadastro.
                  {' '}Uso cruzado só é medido onde a fábrica tem Épico próprio no DevOps (hoje STAGING
                  e APP): os Épicos ainda seguem o organograma anterior, e por isso as colunas da
                  matriz são os Épicos, não as fábricas.
                  {' '}Áreas de apoio e Infra mostram horas, mas não entram nos KPIs de entrega e de
                  qualidade nesta versão.
                  {podeAbrir && ' Clique no grupo para abrir as fábricas, na fábrica para ver as pessoas, na pessoa para ver os PBIs, no PBI para ver as tasks e na task para ver cada lançamento.'}
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
