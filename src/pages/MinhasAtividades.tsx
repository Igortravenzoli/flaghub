import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
  ListTree,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useMinhasAtividades } from '@/hooks/useMinhasAtividades';
import {
  agruparPorHierarquia,
  chavesRecolhiveis,
  filtrarAtividades,
  resumoRisco,
  type GrupoEpic,
  type GrupoFeature,
  type GrupoPbi,
  type ItemDevops,
} from '@/lib/minhasAtividades';
import { hojeISO, prazoSprint, textoPrazo, type NivelPrazo, type PrazoSprint } from '@/lib/prazoSprint';

/**
 * Minhas atividades — o que está atribuído a você no Azure DevOps, na
 * hierarquia do DevOps: Epic > Feature > PBI > Task (regra em
 * lib/minhasAtividades). Quem flutua entre projetos se acha pela Epic; a
 * sprint aparece em cada linha, colorida pelo prazo (lib/prazoSprint), e põe
 * no topo de cada nível o que está mais perto de vencer.
 *
 * Somente leitura, sobre o espelho devops_work_items. O link de cada linha
 * abre o item no Azure DevOps.
 */
export default function MinhasAtividades() {
  const { user } = useAuth();
  const email = user?.email ?? null;
  const { data, isLoading, isFetching, error, refetch } = useMinhasAtividades(email);
  const [busca, setBusca] = useState('');
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());

  const hoje = hojeISO();
  const itens = useMemo(() => data?.itens ?? [], [data]);
  const ancestrais = useMemo(() => data?.ancestrais ?? [], [data]);
  const filtrados = useMemo(
    () => filtrarAtividades(itens, ancestrais, busca),
    [itens, ancestrais, busca],
  );
  const grupos = useMemo(
    () => agruparPorHierarquia(filtrados, ancestrais, hoje),
    [filtrados, ancestrais, hoje],
  );
  const risco = useMemo(() => resumoRisco(itens, hoje), [itens, hoje]);

  const alternar = (key: string) =>
    setRecolhidos((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <div className="space-y-6 p-6">
      {/* Header — padrão das telas de setor */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-1.5">
              <ListTree className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Minhas atividades</h1>
          </div>
          <p className="ml-9 text-sm text-muted-foreground">
            O que está atribuído a você no Azure DevOps, por Epic e Feature.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setRecolhidos(new Set())}>
            <ChevronsUpDown className="mr-1.5 h-3.5 w-3.5" />
            Expandir tudo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRecolhidos(new Set(chavesRecolhiveis(grupos)))}
          >
            <ChevronsDownUp className="mr-1.5 h-3.5 w-3.5" />
            Recolher tudo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            title="Recarregar do espelho"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          {/* Busca + resumo discreto */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[16rem] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-8 text-sm"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Epic, Feature, PBI, Task ou #16603"
              />
            </div>
            {data && (
              <div className="flex items-center gap-4 text-xs tabular-nums text-muted-foreground">
                <span>
                  {filtrados.length === itens.length
                    ? `${itens.length} itens`
                    : `${filtrados.length} de ${itens.length}`}
                </span>
                {risco.vencidas > 0 && (
                  <Contagem n={risco.vencidas} cor="bg-red-500" texto="sprint vencida" />
                )}
                {risco.fimDeSprint > 0 && (
                  <Contagem n={risco.fimDeSprint} cor="bg-amber-500" texto="fim de sprint" />
                )}
              </div>
            )}
          </div>

          {!email ? (
            <Aviso>Seu login não tem e-mail para cruzar com o Azure DevOps.</Aviso>
          ) : isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : error ? (
            <Aviso>
              Não foi possível ler o espelho do DevOps: {(error as Error).message}
            </Aviso>
          ) : itens.length === 0 ? (
            <Aviso>
              Nada aberto atribuído a {email} no espelho do DevOps. O espelho cobre as queries
              sincronizadas e as Tasks e Bugs filhos delas.
            </Aviso>
          ) : grupos.length === 0 ? (
            <Aviso>Nada bateu com a busca.</Aviso>
          ) : (
            <div className="space-y-5">
              {grupos.map((g) => (
                <SecaoEpic
                  key={g.key}
                  grupo={g}
                  hoje={hoje}
                  recolhidos={recolhidos}
                  alternar={alternar}
                />
              ))}
            </div>
          )}

          {data?.sincronizadoEm && (
            <p className="text-right text-[11px] text-muted-foreground">
              Espelho do DevOps atualizado{' '}
              {formatDistanceToNow(new Date(data.sincronizadoEm), { addSuffix: true, locale: ptBR })}
              {isFetching && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Epic / Feature ───────────────────────────────────────────────────────────

const PONTO_URGENCIA: Record<number, string> = {
  0: 'bg-red-500',
  1: 'bg-orange-500',
  2: 'bg-amber-500',
};

function CabecalhoGrupo({
  tipo,
  item,
  vazio,
  total,
  urgencia,
  recolhido,
  onClick,
  forte,
}: {
  tipo: string;
  item: ItemDevops | null;
  vazio: string;
  total: number;
  urgencia: number;
  recolhido: boolean;
  onClick: () => void;
  forte?: boolean;
}) {
  const ponto = PONTO_URGENCIA[urgencia];
  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
            recolhido ? '' : 'rotate-90'
          }`}
        />
        <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {tipo}
        </span>
        <span
          className={`min-w-0 truncate text-sm ${
            item ? (forte ? 'font-semibold' : 'font-medium') : 'italic text-muted-foreground'
          }`}
          title={item ? `#${item.id} ${item.title ?? ''}` : vazio}
        >
          {item ? item.title : vazio}
        </span>
        {ponto && <span className={`h-2 w-2 shrink-0 rounded-full ${ponto}`} />}
      </button>
      {item && <LinkDevops item={item} />}
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {total}
      </span>
    </div>
  );
}

function SecaoEpic({
  grupo,
  hoje,
  recolhidos,
  alternar,
}: {
  grupo: GrupoEpic;
  hoje: string;
  recolhidos: Set<string>;
  alternar: (k: string) => void;
}) {
  const fechado = recolhidos.has(grupo.key);
  return (
    <section>
      <div className="border-b border-border pb-1">
        <CabecalhoGrupo
          tipo="Epic"
          item={grupo.epic}
          vazio="Sem Epic"
          total={grupo.total}
          urgencia={grupo.urgencia}
          recolhido={fechado}
          onClick={() => alternar(grupo.key)}
          forte
        />
      </div>
      {!fechado && (
        <div className="mt-2 space-y-3">
          {grupo.features.map((f) => (
            <SecaoFeature
              key={f.key}
              grupo={f}
              hoje={hoje}
              recolhidos={recolhidos}
              alternar={alternar}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SecaoFeature({
  grupo,
  hoje,
  recolhidos,
  alternar,
}: {
  grupo: GrupoFeature;
  hoje: string;
  recolhidos: Set<string>;
  alternar: (k: string) => void;
}) {
  const fechado = recolhidos.has(grupo.key);
  return (
    <div className="ml-2 border-l border-border pl-3">
      <CabecalhoGrupo
        tipo="Feature"
        item={grupo.feature}
        vazio="Sem Feature"
        total={grupo.total}
        urgencia={grupo.urgencia}
        recolhido={fechado}
        onClick={() => alternar(grupo.key)}
      />
      {!fechado && (
        <div className="mt-1.5 grid gap-2 xl:grid-cols-2">
          {grupo.pbis.map((p) => (
            <BlocoPbi key={p.key} grupo={p} hoje={hoje} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PBI + Tasks ──────────────────────────────────────────────────────────────

function BlocoPbi({ grupo, hoje }: { grupo: GrupoPbi; hoje: string }) {
  const { pbi } = grupo;
  const contexto = pbi != null && !grupo.pbiAtribuido;
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center gap-2 bg-muted/40 px-3 py-2">
        {pbi ? (
          <>
            <span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {pbi.work_item_type === 'Bug' ? 'Bug' : 'PBI'}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">#{pbi.id}</span>
            <span
              className={`min-w-0 flex-1 truncate text-sm ${contexto ? 'text-muted-foreground' : 'font-medium'}`}
              title={[pbi.title, pbi.state, contexto ? 'Não atribuído a você' : '']
                .filter(Boolean)
                .join('\n')}
            >
              {pbi.title}
            </span>
            <Estado state={pbi.state} />
            {grupo.prazo && <RotuloSprint prazo={grupo.prazo} tags={pbi.tags} />}
            <LinkDevops item={pbi} />
          </>
        ) : (
          <span className="text-sm italic text-muted-foreground">Tasks sem PBI</span>
        )}
      </div>
      {grupo.tasks.map((t) => {
        const p = prazoSprint(t, hoje);
        // a sprint da Task só aparece quando foge da do PBI ou pede atenção
        const mostrarSprint =
          !grupo.prazo ||
          t.iteration_path !== pbi?.iteration_path ||
          p.nivel === 'vencida' ||
          p.nivel === 'ultimo_dia' ||
          p.nivel === 'reta_final';
        return (
          <div
            key={t.id}
            className="flex items-center gap-2 border-t border-border/70 py-1.5 pl-5 pr-3"
          >
            <PontoEstado state={t.state} />
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">#{t.id}</span>
            <span className="min-w-0 flex-1 truncate text-sm" title={t.title ?? ''}>
              {t.title}
            </span>
            <Estado state={t.state} />
            {mostrarSprint && <RotuloSprint prazo={p} tags={t.tags} />}
            <LinkDevops item={t} />
          </div>
        );
      })}
    </div>
  );
}

// ─── peças pequenas ───────────────────────────────────────────────────────────

const COR_SPRINT: Partial<Record<NivelPrazo, string>> = {
  vencida: 'text-red-600 dark:text-red-400',
  ultimo_dia: 'text-orange-600 dark:text-orange-400',
  reta_final: 'text-amber-600 dark:text-amber-400',
};

function RotuloSprint({ prazo, tags }: { prazo: PrazoSprint; tags: string | null }) {
  if (prazo.nivel === 'concluido') return null;
  const { rotulo, dica } = textoPrazo(prazo, tags);
  if (!rotulo) return null;
  return (
    <span
      title={dica}
      className={`max-w-[10rem] shrink-0 truncate text-[11px] ${
        COR_SPRINT[prazo.nivel] ?? 'text-muted-foreground'
      }`}
    >
      {rotulo}
    </span>
  );
}

function Estado({ state }: { state: string | null }) {
  if (!state) return null;
  return (
    <span className="hidden w-20 shrink-0 truncate text-[11px] text-muted-foreground md:inline">
      {state}
    </span>
  );
}

function PontoEstado({ state }: { state: string | null }) {
  const cor =
    state === 'In Progress' || state === 'Committed' || state === 'Active'
      ? 'bg-primary'
      : state === 'To Do' || state === 'New' || state === 'Approved'
        ? 'bg-muted-foreground/40'
        : 'bg-border';
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cor}`} title={state ?? ''} />;
}

function LinkDevops({ item }: { item: ItemDevops }) {
  if (!item.web_url) return null;
  return (
    <a
      href={item.web_url}
      target="_blank"
      rel="noreferrer"
      title={`Abrir #${item.id} no Azure DevOps`}
      className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function Contagem({ n, cor, texto }: { n: number; cor: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${cor}`} />
      {n} {texto}
    </span>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
