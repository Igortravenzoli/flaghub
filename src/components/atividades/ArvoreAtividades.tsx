import { createContext, useContext, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { Bug, ChevronRight, ClipboardList, Crown, ExternalLink, List, Loader2, Plus, Trophy } from 'lucide-react';
import { ehArrastoDeAnotacao, recebeTask } from '@/lib/timerArrastar';
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
  /** PBI/Bug como alvo de uma anotação (Timer): clicar ou soltar cria a Task. */
  alvo?: AlvoAnotacao;
}

export interface AlvoAnotacao {
  /** ▶ na anotação: um clique no PBI/Bug cria a Task */
  escolhendo: boolean;
  /** uma anotação está sendo arrastada: os PBIs/Bugs se mostram como alvo */
  arrastando: boolean;
  /** PBI em que a Task está sendo criada (spinner) */
  ocupado: number | null;
  onEscolher: (pbi: ItemDevops) => void;
  onSoltar: (pbi: ItemDevops, dt: DataTransfer) => void;
}

/** Coluna estreita (cockpit do Timer): um PBI por linha e linhas que quebram. */
const Compacto = createContext(false);

export function ArvoreAtividades({
  grupos,
  hoje,
  recolhidos,
  alternar,
  acoes,
  compacto = false,
}: {
  grupos: GrupoEpic[];
  hoje: string;
  recolhidos: Set<string>;
  alternar: (k: string) => void;
  acoes?: AcoesArvore;
  compacto?: boolean;
}) {
  return (
    <Compacto.Provider value={compacto}>
    <div className="space-y-5">
      {grupos.map((g) => (
        <SecaoEpic key={g.key} grupo={g} hoje={hoje} recolhidos={recolhidos} alternar={alternar} acoes={acoes} />
      ))}
    </div>
    </Compacto.Provider>
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
  const compacto = useContext(Compacto);
  if (compacto) {
    // Coluna estreita (Timer): o ícone do tipo (o do DevOps) no lugar da palavra, o título
    // com a largura toda e as ações (+ PBI, link) só no hover ou no foco.
    return (
      <div className="group/cab flex min-w-0 items-center gap-1.5">
        <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left">
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${recolhido ? '' : 'rotate-90'}`}
          />
          <IconeTipo tipo={tipo} />
          <span
            className={`min-w-0 flex-1 truncate text-sm ${
              item ? (forte ? 'font-semibold' : 'font-medium') : 'italic text-muted-foreground'
            }`}
            title={item ? `${tipo} #${item.id} ${item.title ?? ''}` : vazio}
          >
            {item ? item.title : vazio}
          </span>
          {ponto && <span className={`h-2 w-2 shrink-0 rounded-full ${ponto}`} />}
        </button>
        <span className="hidden shrink-0 items-center gap-0.5 group-focus-within/cab:flex group-hover/cab:flex">
          {extra}
          {item && <LinkDevops item={item} />}
        </span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">{total}</span>
      </div>
    );
  }
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
  const compacto = useContext(Compacto);
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
        <div className={compacto ? 'mt-1 space-y-1.5' : 'mt-2 space-y-3'}>
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
  const compacto = useContext(Compacto);
  const { feature } = grupo;
  return (
    <div className={compacto ? 'ml-1.5 border-l border-border pl-2' : 'ml-2 border-l border-border pl-3'}>
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
        <div className={compacto ? 'mt-1 space-y-1.5' : 'mt-1.5 grid gap-2 xl:grid-cols-2'}>
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
  const compacto = useContext(Compacto);
  if (compacto) return <BlocoPbiCompacto grupo={grupo} hoje={hoje} acoes={acoes} />;
  const { pbi } = grupo;
  const contexto = pbi != null && !grupo.pbiAtribuido;
  const pbiSelecionado = pbi != null && acoes?.selecionado === pbi.id;
  const quebra = compacto ? 'flex-wrap' : '';
  const titulo = compacto ? 'min-w-[9rem]' : 'min-w-0';
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className={`flex items-center gap-2 px-3 py-2 ${quebra} ${pbiSelecionado ? 'bg-flag-gold/15' : 'bg-muted/40'}`}>
        {pbi ? (
          <>
            <span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {pbi.work_item_type === 'Bug' ? 'Bug' : 'PBI'}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">#{pbi.id}</span>
            <span
              className={`${titulo} flex-1 truncate text-sm ${contexto ? 'text-muted-foreground' : 'font-medium'}`}
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
            className={`flex items-center gap-2 border-t border-border/70 py-1.5 pl-5 pr-3 ${quebra} ${
              selecionada ? 'bg-flag-gold/15' : ''
            }`}
          >
            <PontoEstado state={t.state} />
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">#{t.id}</span>
            <span className={`${titulo} flex-1 truncate text-sm`} title={t.title ?? ''}>
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

/** A sprint da Task só aparece quando foge da do PBI ou pede atenção. */
function mostrarSprintDaTask(t: ItemDevops, grupo: GrupoPbi, p: PrazoSprint) {
  return (
    !grupo.prazo ||
    t.iteration_path !== grupo.pbi?.iteration_path ||
    p.nivel === 'vencida' ||
    p.nivel === 'ultimo_dia' ||
    p.nivel === 'reta_final'
  );
}

/**
 * PBI na coluna estreita (Timer, pedido do Igor 17/11/2026: nada encavalado):
 * título na linha de cima com a largura toda; número, estado, sprint e ações
 * na de baixo. O mesmo para cada Task.
 */
function BlocoPbiCompacto({ grupo, hoje, acoes }: { grupo: GrupoPbi; hoje: string; acoes?: AcoesArvore }) {
  const { pbi } = grupo;
  const contexto = pbi != null && !grupo.pbiAtribuido;
  const pbiSelecionado = pbi != null && acoes?.selecionado === pbi.id;
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      {pbi ? (
        <AlvoPbi item={pbi} alvo={acoes?.alvo} className={pbiSelecionado ? 'bg-flag-gold/15' : 'bg-muted/40'}>
          <div className="flex min-w-0 items-center gap-1.5">
            <IconeTipo tipo={pbi.work_item_type ?? 'Product Backlog Item'} />
            <span
              className={`min-w-0 flex-1 truncate text-sm ${contexto ? 'text-muted-foreground' : 'font-medium'}`}
              title={[pbi.title, pbi.state, contexto ? 'Não atribuído a você' : ''].filter(Boolean).join('\n')}
            >
              {pbi.title}
            </span>
          </div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pl-[1.375rem] text-[11px] text-muted-foreground">
            <span className="shrink-0 font-mono">#{pbi.id}</span>
            {pbi.state && <span className="min-w-0 truncate">{pbi.state}</span>}
            {grupo.prazo && <RotuloSprint prazo={grupo.prazo} tags={pbi.tags} />}
            <span className="ml-auto flex shrink-0 items-center gap-0.5">
              <SinalAlvo item={pbi} alvo={acoes?.alvo} />
              {!acoes?.alvo?.escolhendo && !acoes?.alvo?.arrastando && acoes?.pbi?.(pbi)}
              <LinkDevops item={pbi} />
            </span>
          </div>
        </AlvoPbi>
      ) : (
        <div className="bg-muted/40 px-2.5 py-1.5 text-sm italic text-muted-foreground">Tasks sem PBI</div>
      )}
      {pbi && acoes?.depoisDoPbi?.(pbi)}
      {grupo.tasks.map((t) => {
        const p = prazoSprint(t, hoje);
        const selecionada = acoes?.selecionado === t.id;
        return (
          <div key={t.id} className={`border-t border-border/70 py-1.5 pl-3 pr-2.5 ${selecionada ? 'bg-flag-gold/15' : ''}`}>
            <div className="flex min-w-0 items-center gap-1.5">
              <PontoEstado state={t.state} />
              <span className="min-w-0 flex-1 truncate text-sm" title={t.title ?? ''}>
                {t.title}
              </span>
            </div>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pl-3 text-[11px] text-muted-foreground">
              <span className="shrink-0 font-mono">#{t.id}</span>
              {t.state && <span className="min-w-0 truncate">{t.state}</span>}
              {mostrarSprintDaTask(t, grupo, p) && <RotuloSprint prazo={p} tags={t.tags} />}
              <span className="ml-auto flex shrink-0 items-center gap-0.5">
                {acoes?.task?.(t)}
                <LinkDevops item={t} />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── anotação → Task: o PBI como alvo (clique ou soltar) ─────────────────────

/**
 * Envolve o cabeçalho de um PBI/Bug: aceita soltar uma anotação arrastada e,
 * no modo "escolher o PBI" (▶ na anotação), cria a Task no clique. Cliques
 * em botões e links de dentro seguem com a função deles.
 */
export function AlvoPbi({
  item,
  alvo,
  className = '',
  children,
}: {
  item: ItemDevops;
  alvo?: AlvoAnotacao;
  className?: string;
  children: ReactNode;
}) {
  const [sobre, setSobre] = useState(false);
  const aceita = !!alvo && recebeTask(item.work_item_type) && !['Done', 'Closed', 'Removed'].includes(item.state ?? '');
  const escolhendo = aceita && alvo.escolhendo;

  const aoArrastarSobre = (e: DragEvent<HTMLDivElement>) => {
    if (!aceita || !ehArrastoDeAnotacao(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!sobre) setSobre(true);
  };
  const aoSoltar = (e: DragEvent<HTMLDivElement>) => {
    if (!aceita || !ehArrastoDeAnotacao(e.dataTransfer)) return;
    e.preventDefault();
    setSobre(false);
    alvo.onSoltar(item, e.dataTransfer);
  };
  const aoClicar = (e: MouseEvent<HTMLDivElement>) => {
    if (!escolhendo || (e.target as HTMLElement).closest('a,button,input,textarea')) return;
    alvo.onEscolher(item);
  };

  return (
    <div
      className={`px-2.5 py-1.5 transition-colors ${className} ${
        sobre
          ? '!bg-flag-gold/25 outline outline-2 -outline-offset-2 outline-flag-gold'
          : aceita && alvo.arrastando
            ? 'outline-dashed outline-1 -outline-offset-2 outline-flag-gold/70'
            : ''
      } ${escolhendo ? 'cursor-pointer hover:!bg-flag-gold/15' : ''}`}
      onDragOver={aoArrastarSobre}
      onDragEnter={aoArrastarSobre}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(false);
      }}
      onDrop={aoSoltar}
      onClick={aoClicar}
      role={escolhendo ? 'button' : undefined}
      tabIndex={escolhendo ? 0 : undefined}
      onKeyDown={(e) => {
        if (escolhendo && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          alvo.onEscolher(item);
        }
      }}
      title={escolhendo ? `Criar a Task em #${item.id}` : undefined}
    >
      {children}
    </div>
  );
}

/** No modo de escolha (ou arrastando), o selo "+ Task aqui"; criando, o spinner. */
export function SinalAlvo({ item, alvo }: { item: ItemDevops; alvo?: AlvoAnotacao }) {
  if (!alvo || !recebeTask(item.work_item_type) || ['Done', 'Closed', 'Removed'].includes(item.state ?? '')) return null;
  if (alvo.ocupado === item.id) return <Loader2 className="h-3.5 w-3.5 animate-spin text-flag-gold" />;
  if (!alvo.escolhendo && !alvo.arrastando) return null;
  return (
    <span className="flex items-center gap-0.5 rounded-full bg-flag-gold/15 px-1.5 py-0.5 text-[10px] font-semibold text-flag-gold">
      <Plus className="h-3 w-3" /> Task aqui
    </span>
  );
}

// ─── peças pequenas ───────────────────────────────────────────────────────────

/**
 * Ícone do tipo, igual ao do Azure DevOps (pedido do Igor, 17/11/2026): coroa
 * laranja = Epic, troféu roxo = Feature, lista azul = PBI, inseto vermelho =
 * Bug, prancheta amarela = Task. As cores são as do DevOps; no tema escuro, um
 * tom mais claro do mesmo matiz para ler bem no fundo.
 */
const ICONE_TIPO: Record<string, { Icone: typeof Crown; cor: string; nome: string }> = {
  Epic: { Icone: Crown, cor: 'text-[#FF7B00]', nome: 'Epic' },
  Feature: { Icone: Trophy, cor: 'text-[#773B93] dark:text-[#B57FD1]', nome: 'Feature' },
  'Product Backlog Item': { Icone: List, cor: 'text-[#009CCC] dark:text-[#3DBDE8]', nome: 'Product Backlog Item' },
  Bug: { Icone: Bug, cor: 'text-[#CC293D] dark:text-[#F0566A]', nome: 'Bug' },
  Task: { Icone: ClipboardList, cor: 'text-[#C9A400] dark:text-[#F2CB1D]', nome: 'Task' },
};
const APELIDO: Record<string, string> = { PBI: 'Product Backlog Item' };

/** Ícone do tipo do work item (o mesmo do Azure DevOps), na coluna estreita. */
export function IconeTipo({ tipo, className = 'h-3.5 w-3.5' }: { tipo: string | null | undefined; className?: string }) {
  const t = ICONE_TIPO[APELIDO[tipo ?? ''] ?? tipo ?? ''];
  if (!t) return <span className={`shrink-0 ${className}`} aria-hidden />;
  const { Icone, cor, nome } = t;
  return (
    <span className="flex shrink-0 items-center" title={nome}>
      <Icone className={`${className} ${cor}`} aria-label={nome} strokeWidth={2.25} />
    </span>
  );
}

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
