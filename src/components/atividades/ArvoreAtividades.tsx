import type { ReactNode } from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import type { GrupoEpic, GrupoFeature, GrupoPbi, ItemDevops } from '@/lib/minhasAtividades';
import { prazoSprint, textoPrazo, type NivelPrazo, type PrazoSprint } from '@/lib/prazoSprint';

/**
 * A árvore Epic > Feature > PBI > Task de "Minhas atividades", extraída para o
 * Timer Flag reaproveitar. Sem `acoes`, é exatamente a tela somente leitura de
 * /minhas-atividades; com `acoes`, cada nível ganha os botões de quem chama
 * (o Timer põe "selecionar", "+ Task" e "+ PBI").
 */
export interface AcoesArvore {
  feature?: (feature: ItemDevops) => ReactNode;
  pbi?: (pbi: ItemDevops) => ReactNode;
  task?: (task: ItemDevops) => ReactNode;
  /** Conteúdo extra logo abaixo do cabeçalho do PBI (ex.: formulário de + Task). */
  depoisDoPbi?: (pbi: ItemDevops) => ReactNode;
  /** Conteúdo extra logo abaixo do cabeçalho da Feature (ex.: formulário de + PBI). */
  depoisDaFeature?: (feature: ItemDevops) => ReactNode;
  /** Linha destacada (a tarefa selecionada no Timer). */
  selecionado?: number | null;
}

export function ArvoreAtividades({
  grupos,
  hoje,
  recolhidos,
  alternar,
  acoes,
}: {
  grupos: GrupoEpic[];
  hoje: string;
  recolhidos: Set<string>;
  alternar: (k: string) => void;
  acoes?: AcoesArvore;
}) {
  return (
    <div className="space-y-5">
      {grupos.map((g) => (
        <SecaoEpic key={g.key} grupo={g} hoje={hoje} recolhidos={recolhidos} alternar={alternar} acoes={acoes} />
      ))}
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
  extra,
}: {
  tipo: string;
  item: ItemDevops | null;
  vazio: string;
  total: number;
  urgencia: number;
  recolhido: boolean;
  onClick: () => void;
  forte?: boolean;
  extra?: ReactNode;
}) {
  const ponto = PONTO_URGENCIA[urgencia];
  return (
    <div className="flex min-w-0 items-center gap-2">
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left">
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${recolhido ? '' : 'rotate-90'}`}
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
      {extra}
      {item && <LinkDevops item={item} />}
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{total}</span>
    </div>
  );
}

function SecaoEpic({
  grupo,
  hoje,
  recolhidos,
  alternar,
  acoes,
}: {
  grupo: GrupoEpic;
  hoje: string;
  recolhidos: Set<string>;
  alternar: (k: string) => void;
  acoes?: AcoesArvore;
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
            <SecaoFeature key={f.key} grupo={f} hoje={hoje} recolhidos={recolhidos} alternar={alternar} acoes={acoes} />
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
  acoes,
}: {
  grupo: GrupoFeature;
  hoje: string;
  recolhidos: Set<string>;
  alternar: (k: string) => void;
  acoes?: AcoesArvore;
}) {
  const fechado = recolhidos.has(grupo.key);
  const { feature } = grupo;
  return (
    <div className="ml-2 border-l border-border pl-3">
      <CabecalhoGrupo
        tipo="Feature"
        item={feature}
        vazio="Sem Feature"
        total={grupo.total}
        urgencia={grupo.urgencia}
        recolhido={fechado}
        onClick={() => alternar(grupo.key)}
        extra={feature && acoes?.feature?.(feature)}
      />
      {feature && acoes?.depoisDaFeature?.(feature)}
      {!fechado && (
        <div className="mt-1.5 grid gap-2 xl:grid-cols-2">
          {grupo.pbis.map((p) => (
            <BlocoPbi key={p.key} grupo={p} hoje={hoje} acoes={acoes} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PBI + Tasks ──────────────────────────────────────────────────────────────

function BlocoPbi({ grupo, hoje, acoes }: { grupo: GrupoPbi; hoje: string; acoes?: AcoesArvore }) {
  const { pbi } = grupo;
  const contexto = pbi != null && !grupo.pbiAtribuido;
  const pbiSelecionado = pbi != null && acoes?.selecionado === pbi.id;
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className={`flex items-center gap-2 px-3 py-2 ${pbiSelecionado ? 'bg-flag-gold/15' : 'bg-muted/40'}`}>
        {pbi ? (
          <>
            <span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {pbi.work_item_type === 'Bug' ? 'Bug' : 'PBI'}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">#{pbi.id}</span>
            <span
              className={`min-w-0 flex-1 truncate text-sm ${contexto ? 'text-muted-foreground' : 'font-medium'}`}
              title={[pbi.title, pbi.state, contexto ? 'Não atribuído a você' : ''].filter(Boolean).join('\n')}
            >
              {pbi.title}
            </span>
            <Estado state={pbi.state} />
            {grupo.prazo && <RotuloSprint prazo={grupo.prazo} tags={pbi.tags} />}
            {acoes?.pbi?.(pbi)}
            <LinkDevops item={pbi} />
          </>
        ) : (
          <span className="text-sm italic text-muted-foreground">Tasks sem PBI</span>
        )}
      </div>
      {pbi && acoes?.depoisDoPbi?.(pbi)}
      {grupo.tasks.map((t) => {
        const p = prazoSprint(t, hoje);
        // a sprint da Task só aparece quando foge da do PBI ou pede atenção
        const mostrarSprint =
          !grupo.prazo ||
          t.iteration_path !== pbi?.iteration_path ||
          p.nivel === 'vencida' ||
          p.nivel === 'ultimo_dia' ||
          p.nivel === 'reta_final';
        const selecionada = acoes?.selecionado === t.id;
        return (
          <div
            key={t.id}
            className={`flex items-center gap-2 border-t border-border/70 py-1.5 pl-5 pr-3 ${
              selecionada ? 'bg-flag-gold/15' : ''
            }`}
          >
            <PontoEstado state={t.state} />
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">#{t.id}</span>
            <span className="min-w-0 flex-1 truncate text-sm" title={t.title ?? ''}>
              {t.title}
            </span>
            <Estado state={t.state} />
            {mostrarSprint && <RotuloSprint prazo={p} tags={t.tags} />}
            {acoes?.task?.(t)}
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

export function RotuloSprint({ prazo, tags }: { prazo: PrazoSprint; tags: string | null }) {
  if (prazo.nivel === 'concluido') return null;
  const { rotulo, dica } = textoPrazo(prazo, tags);
  if (!rotulo) return null;
  return (
    <span
      title={dica}
      className={`max-w-[10rem] shrink-0 truncate text-[11px] ${COR_SPRINT[prazo.nivel] ?? 'text-muted-foreground'}`}
    >
      {rotulo}
    </span>
  );
}

export function Estado({ state }: { state: string | null }) {
  if (!state) return null;
  return (
    <span className="hidden w-20 shrink-0 truncate text-[11px] text-muted-foreground md:inline">{state}</span>
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

export function LinkDevops({ item }: { item: ItemDevops }) {
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

export function Contagem({ n, cor, texto }: { n: number; cor: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${cor}`} />
      {n} {texto}
    </span>
  );
}

export function Aviso({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
