import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, ListTree, Loader2, NotebookPen, Play, Plus, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  AlvoPbi,
  ArvoreAtividades,
  IconeTipo,
  Aviso,
  LinkDevops,
  RotuloSprint,
  SinalAlvo,
  type AlvoAnotacao,
} from '@/components/atividades/ArvoreAtividades';
import { lerArrasto, type AnotacaoArrastada } from '@/lib/timerArrastar';
import { agruparPorHierarquia, chavesRecolhiveis, filtrarAtividades, type ItemDevops } from '@/lib/minhasAtividades';
import { hojeISO, prazoSprint } from '@/lib/prazoSprint';
import { getCurrentOfficialSprintCode } from '@/lib/sprintCalendar';
import { caminhoDe, pbisDaSprint, TIPOS_SELECIONAVEIS, type TarefaSelecionada } from '@/lib/timerSelecao';
import {
  ErroTimer,
  useBuscaTimer,
  useCriarItemTimer,
  useFilhosTimer,
  useMinhasTarefasTimer,
  type ItemTimer,
} from '@/hooks/useTimerTarefas';

type Criando = { tipo: 'Task' | 'PBI'; pai: ItemDevops } | null;

/**
 * Painel "Tasks atribuídas" do Timer: a árvore do que está atribuído à pessoa
 * (a mesma de /minhas-atividades, lida ao vivo do DevOps), a busca no DevOps
 * inteiro e a criação de Task (sob PBI/Bug) e PBI (sob Feature).
 *
 * `selecionada` = o item que está rodando (destaque); `onSelecionar` inicia
 * o timer nele. Com `anotacao` (▶ na anotação), o painel está no modo
 * "escolha o PBI": um clique num PBI/Bug cria a Task com o texto da anotação e
 * inicia o timer. Arrastar a anotação para um PBI/Bug faz o mesmo.
 */
export function PainelTarefas({
  selecionada,
  rodandoIds,
  onSelecionar,
  anotacao = null,
  anotacaoArrastada = null,
  onCancelarAnotacao,
  onItemCriado,
  embutido = false,
  iniciarRecolhido = false,
  podeIniciar = true,
}: {
  selecionada: TarefaSelecionada | null;
  /** com timers em paralelo, todos os que rodam (TM9) */
  rodandoIds?: number[];
  onSelecionar: (t: TarefaSelecionada) => void;
  anotacao?: { id: string; texto: string } | null;
  /** anotação sendo arrastada da outra coluna: os PBIs/Bugs se mostram como alvo */
  anotacaoArrastada?: AnotacaoArrastada | null;
  onCancelarAnotacao?: () => void;
  /** item criado; `anotacaoId` = a anotação que virou esta Task (▶ ou arrastada) */
  onItemCriado?: (item: ItemTimer, anotacaoId?: string) => void;
  /** dentro de outra coluna: sem a moldura de Card e sem título */
  embutido?: boolean;
  /** abre com as épicas recolhidas (o quadro minimizado) */
  iniciarRecolhido?: boolean;
  /** false no celular: o Timer é só consulta, sem o botão Iniciar */
  podeIniciar?: boolean;
}) {
  const minhas = useMinhasTarefasTimer();
  const [busca, setBusca] = useState('');
  const [buscaAtrasada, setBuscaAtrasada] = useState('');
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const [criando, setCriando] = useState<Criando>(null);
  const [recolheuInicio, setRecolheuInicio] = useState(!iniciarRecolhido);
  const criarTask = useCriarItemTimer();
  const [criandoEm, setCriandoEm] = useState<number | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setBuscaAtrasada(busca), 450);
    return () => window.clearTimeout(t);
  }, [busca]);

  const remota = useBuscaTimer(buscaAtrasada);
  const hoje = hojeISO();
  const itens = useMemo(() => minhas.data?.itens ?? [], [minhas.data]);
  const ancestrais = useMemo(() => minhas.data?.ancestrais ?? [], [minhas.data]);
  const filtrados = useMemo(() => filtrarAtividades(itens, ancestrais, busca), [itens, ancestrais, busca]);
  const grupos = useMemo(() => agruparPorHierarquia(filtrados, ancestrais, hoje), [filtrados, ancestrais, hoje]);

  // Quadro minimizado: na primeira carga, só as épicas à vista.
  if (!recolheuInicio && grupos.length > 0) {
    setRecolheuInicio(true);
    setRecolhidos(new Set(chavesRecolhiveis(grupos)));
  }

  // Transformando anotação: primeiro os PBIs da sprint corrente (um clique);
  // a árvore só abre inteira quando não há nenhum para oferecer.
  const sprintAtual = getCurrentOfficialSprintCode();
  const daSprint = useMemo(() => pbisDaSprint(itens, ancestrais, sprintAtual), [itens, ancestrais, sprintAtual]);
  const anotacaoId = anotacao?.id ?? null;
  const semAtalho = daSprint.length === 0;
  useEffect(() => {
    if (anotacaoId && semAtalho) setRecolhidos(new Set());
  }, [anotacaoId, semAtalho]);

  const conhecidos = useMemo(() => {
    const m = new Map<number, ItemDevops>();
    for (const i of [...ancestrais, ...itens, ...(remota.data?.ancestrais ?? []), ...(remota.data?.itens ?? [])]) m.set(i.id, i);
    return m;
  }, [ancestrais, itens, remota.data]);

  const selecionar = (item: ItemDevops) =>
    onSelecionar({
      id: item.id,
      title: item.title,
      work_item_type: item.work_item_type,
      caminho: caminhoDe(item, conhecidos),
      web_url: item.web_url,
      projeto: (item as Partial<ItemTimer>).team_project ?? null,
    });

  const alternar = (key: string) =>
    setRecolhidos((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  // Anotação → Task num clique (ou ao soltar): o título é o texto da anotação.
  const criarDaAnotacao = async (pai: ItemDevops, a: AnotacaoArrastada) => {
    const titulo = a.texto.trim();
    if (criarTask.isPending) return;
    if (titulo.length < 3) {
      setCriando({ tipo: 'Task', pai }); // curto demais: abre o formulário para completar
      return;
    }
    setCriandoEm(pai.id);
    try {
      const r = await criarTask.mutateAsync({ tipo: 'Task', titulo, paiId: pai.id });
      const novo = r.item ?? null;
      const url = novo?.web_url;
      toast.success(`Task #${novo?.id ?? ''} criada em #${pai.id} e atribuída a você.`, {
        description: 'Descrição, prints e anexos: complete direto no Azure DevOps.',
        duration: 10_000,
        ...(url ? { action: { label: 'Abrir no DevOps', onClick: () => window.open(url, '_blank', 'noopener') } } : {}),
      });
      if (novo) {
        onItemCriado?.(novo, a.id);
        if (TIPOS_SELECIONAVEIS.has(novo.work_item_type ?? '')) selecionar(novo);
      }
    } catch (e) {
      toast.error(e instanceof ErroTimer ? e.message : 'Não foi possível criar a Task.');
    } finally {
      setCriandoEm(null);
    }
  };

  const alvo: AlvoAnotacao = {
    escolhendo: !!anotacao,
    arrastando: !!anotacaoArrastada,
    ocupado: criandoEm,
    onEscolher: (pai) => {
      if (anotacao) void criarDaAnotacao(pai, anotacao);
    },
    onSoltar: (pai, dt) => {
      const a = lerArrasto(dt) ?? anotacaoArrastada;
      if (a) void criarDaAnotacao(pai, a);
    },
  };

  const acoesItem = (item: ItemDevops) => (
    <AcoesItem
      item={item}
      selecionada={rodandoIds ? rodandoIds.includes(item.id) : selecionada?.id === item.id}
      onSelecionar={() => selecionar(item)}
      onNovo={(tipo) => setCriando({ tipo, pai: item })}
    />
  );

  const formPara = (item: ItemDevops, tipo: 'Task' | 'PBI') =>
    criando && criando.pai.id === item.id && criando.tipo === tipo ? (
      <FormNovoItem
        tipo={tipo}
        pai={item}
        tituloInicial={tipo === 'Task' && anotacao ? anotacao.texto : ''}
        onCancelar={() => setCriando(null)}
        onCriado={(novo) => {
          setCriando(null);
          if (novo) onItemCriado?.(novo, tipo === 'Task' ? anotacao?.id : undefined);
          if (novo && TIPOS_SELECIONAVEIS.has(novo.work_item_type ?? '')) selecionar(novo);
        }}
      />
    ) : null;

  const termo = buscaAtrasada.trim();
  const buscaRemotaAtiva = /^#?\d+$/.test(termo) || termo.replace(/^#/, '').length >= 3;
  const idsMeus = useMemo(() => new Set(itens.map((i) => i.id)), [itens]);
  const resultadosDeFora = (remota.data?.itens ?? []).filter((i) => !idsMeus.has(i.id));

  const Moldura = embutido ? 'div' : Card;
  const Cabeca = embutido ? 'div' : CardHeader;
  const Corpo = embutido ? 'div' : CardContent;

  // Um botão só: com tudo recolhido, expande; com algo aberto, recolhe.
  const chaves = chavesRecolhiveis(grupos);
  const tudoRecolhido = chaves.length > 0 && chaves.every((k) => recolhidos.has(k));
  const ferramentas = (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => setRecolhidos(tudoRecolhido ? new Set() : new Set(chaves))}
        title={tudoRecolhido ? 'Expandir tudo' : 'Recolher tudo'}
        aria-label={tudoRecolhido ? 'Expandir tudo' : 'Recolher tudo'}
        disabled={chaves.length === 0}
      >
        {tudoRecolhido ? <ChevronsUpDown className="h-3.5 w-3.5" /> : <ChevronsDownUp className="h-3.5 w-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => void minhas.recarregar()}
        disabled={minhas.isFetching}
        title="Recarregar do Azure DevOps"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', minhas.isFetching && 'animate-spin')} />
      </Button>
    </div>
  );

  const campoBusca = (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="h-9 pl-8 text-sm shadow-[0_1px_2px_0_rgb(16_24_40/0.05)]"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Filtrar ou buscar no DevOps (#id)"
        aria-label="Filtrar tarefas ou buscar no Azure DevOps"
      />
    </div>
  );

  return (
    <PodeIniciar.Provider value={podeIniciar}>
    <Moldura className={embutido ? 'space-y-3' : undefined}>
      <Cabeca className={embutido ? undefined : 'pb-3'}>
        {embutido ? (
          <div className="flex items-center gap-2">
            {campoBusca}
            {ferramentas}
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ListTree className="h-4 w-4 text-muted-foreground" /> Tasks atribuídas
            </CardTitle>
            {ferramentas}
          </div>
        )}
      </Cabeca>
      <Corpo className="space-y-4">
        {anotacao && (
          <div className="flex items-center gap-2 rounded-lg border border-flag-gold/60 bg-flag-gold/10 px-3 py-2 text-sm">
            <NotebookPen className="h-4 w-4 shrink-0 text-flag-gold" />
            <p className="min-w-0 flex-1">
              <span className="block truncate font-medium" title={anotacao.texto}>
                {anotacao.texto}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                Clique no PBI em que esta Task vai entrar (ou arraste a anotação até ele).
              </span>
            </p>
            {onCancelarAnotacao && (
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onCancelarAnotacao}>
                Cancelar
              </Button>
            )}
          </div>
        )}
        {anotacao && !minhas.isLoading && (
          <section className="space-y-1.5" aria-label={`PBIs da sprint ${sprintAtual}`}>
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Na sprint {sprintAtual}
            </h3>
            {daSprint.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum PBI seu aberto nesta sprint.</p>
            ) : (
              <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
                {daSprint.map((p) => {
                  const onde = caminhoDe(p, conhecidos);
                  return (
                    <div key={p.id}>
                      <AlvoPbi item={p} alvo={alvo}>
                        <div className="flex min-w-0 items-center gap-2">
                          <IconeTipo tipo={p.work_item_type} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm" title={p.title ?? ''}>
                              {p.title}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              <span className="font-mono">#{p.id}</span>
                              {onde ? ` · ${onde}` : ''}
                            </span>
                          </span>
                          <SinalAlvo item={p} alvo={alvo} />
                        </div>
                      </AlvoPbi>
                      {formPara(p, 'Task')}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="pt-0.5 text-[11px] text-muted-foreground">Outro PBI: na árvore abaixo ou busque por #id.</p>
          </section>
        )}
        {!embutido && campoBusca}

        {minhas.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : minhas.error ? (
          <Aviso>{(minhas.error as Error).message}</Aviso>
        ) : itens.length === 0 ? (
          <Aviso>Nada atribuído a você</Aviso>
        ) : grupos.length === 0 ? (
          <Aviso>Nada encontrado nas suas</Aviso>
        ) : (
          <ArvoreAtividades
            grupos={grupos}
            hoje={hoje}
            recolhidos={recolhidos}
            alternar={alternar}
            compacto={embutido}
            acoes={{
              alvo,
              selecionado: selecionada?.id ?? null,
              task: acoesItem,
              pbi: acoesItem,
              feature: acoesItem,
              depoisDoPbi: (p) => formPara(p, 'Task'),
              depoisDaFeature: (f) => formPara(f, 'PBI'),
            }}
          />
        )}

        {minhas.data?.truncado && (
          <p className="text-[11px] text-muted-foreground">200 mais recentes</p>
        )}

        {buscaRemotaAtiva && (
          <section className="space-y-2 border-t pt-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              No Azure DevOps
              {remota.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </h3>
            {remota.error ? (
              <Aviso>{(remota.error as Error).message}</Aviso>
            ) : remota.data && resultadosDeFora.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nada além das suas</p>
            ) : (
              <div className="space-y-1">
                {resultadosDeFora.map((i) => (
                  <LinhaRemota
                    key={i.id}
                    item={i}
                    conhecidos={conhecidos}
                    nivel={0}
                    selecionadaId={selecionada?.id ?? null}
                    onSelecionar={selecionar}
                    criando={criando}
                    setCriando={setCriando}
                    formPara={formPara}
                    alvo={alvo}
                  />
                ))}
                {remota.data?.truncado && (
                  <p className="text-[11px] text-muted-foreground">30 mais recentes</p>
                )}
              </div>
            )}
          </section>
        )}
      </Corpo>
    </Moldura>
    </PodeIniciar.Provider>
  );
}

// ─── ações de cada linha ─────────────────────────────────────────────────────

/** false no celular (só consulta): some o botão Iniciar de todas as linhas. */
const PodeIniciar = createContext(true);

function AcoesItem({
  item,
  selecionada,
  onSelecionar,
  onNovo,
}: {
  item: ItemDevops;
  selecionada: boolean;
  onSelecionar: () => void;
  onNovo: (tipo: 'Task' | 'PBI') => void;
}) {
  const tipo = item.work_item_type ?? '';
  const fechado = ['Done', 'Closed', 'Removed'].includes(item.state ?? '');
  const podeIniciar = useContext(PodeIniciar);
  return (
    <span className="flex shrink-0 items-center gap-1">
      {(tipo === 'Product Backlog Item' || tipo === 'Bug') && !fechado && (
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px]" onClick={() => onNovo('Task')} title="Nova Task neste item">
          <Plus className="h-3 w-3" /> Task
        </Button>
      )}
      {tipo === 'Feature' && !fechado && (
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px]" onClick={() => onNovo('PBI')} title="Novo PBI nesta Feature">
          <Plus className="h-3 w-3" /> PBI
        </Button>
      )}
      {podeIniciar && TIPOS_SELECIONAVEIS.has(tipo) && (
        <Button
          variant={selecionada ? 'default' : 'outline'}
          size="sm"
          className={cn('h-6 gap-1 px-2 text-[11px]', selecionada && 'bg-flag-gold text-flag-navy hover:bg-flag-gold')}
          onClick={onSelecionar}
          disabled={selecionada}
          title={selecionada ? 'O timer está rodando nesta tarefa' : 'Iniciar o timer nesta tarefa'}
        >
          <Play className="h-3 w-3" />
          {selecionada ? 'Rodando' : 'Iniciar'}
        </Button>
      )}
    </span>
  );
}

function FormNovoItem({
  tipo,
  pai,
  tituloInicial = '',
  onCancelar,
  onCriado,
}: {
  tipo: 'Task' | 'PBI';
  pai: ItemDevops;
  tituloInicial?: string;
  onCancelar: () => void;
  onCriado: (item: ItemTimer | null) => void;
}) {
  const criar = useCriarItemTimer();
  const [titulo, setTitulo] = useState(tituloInicial);
  const valido = titulo.trim().length >= 3 && titulo.trim().length <= 255;

  const enviar = async () => {
    if (!valido || criar.isPending) return;
    try {
      const r = await criar.mutateAsync({ tipo, titulo: titulo.trim(), paiId: pai.id });
      const url = r.item?.web_url;
      toast.success(`${tipo} #${r.item?.id ?? ''} criada e atribuída a você.`, {
        description: 'Descrição, prints e anexos: complete direto no Azure DevOps.',
        duration: 10_000,
        ...(url ? { action: { label: 'Abrir no DevOps', onClick: () => window.open(url, '_blank', 'noopener') } } : {}),
      });
      onCriado(r.item ?? null);
    } catch (e) {
      toast.error(e instanceof ErroTimer ? e.message : 'Não foi possível criar o item.');
    }
  };

  return (
    <form
      className="space-y-2 border-t border-dashed bg-muted/20 px-3 py-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      <p className="text-[11px] text-muted-foreground">
        {tipo === 'Task' ? `Task em #${pai.id}` : `PBI em #${pai.id} · ${getCurrentOfficialSprintCode()}`} · atribuída a
        você · descrição e anexos no DevOps ↗
      </p>
      {/* título com a largura toda e quebra de linha, para ler o que vai ser criado
          (pedido do Igor, 17/11/2026). Enter cria; no DevOps o título é uma linha só. */}
      <Textarea
        autoFocus
        rows={3}
        className="min-h-0 resize-none text-sm leading-snug"
        value={titulo}
        maxLength={255}
        onChange={(e) => setTitulo(e.target.value.replace(/[\r\n]+/g, ' '))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void enviar();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancelar();
          }
        }}
        onFocus={(e) => {
          const fimTexto = e.currentTarget.value.length;
          e.currentTarget.setSelectionRange(fimTexto, fimTexto);
        }}
        placeholder={tipo === 'Task' ? 'Título da Task' : 'Título do PBI'}
        aria-label={tipo === 'Task' ? 'Título da Task' : 'Título do PBI'}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] tabular-nums text-muted-foreground">{titulo.trim().length}/255</span>
        <div className="flex gap-1.5">
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" className="h-8 min-w-[5.5rem]" disabled={!valido || criar.isPending}>
            {criar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Criar ${tipo}`}
          </Button>
        </div>
      </div>
    </form>
  );
}

// ─── resultado da busca no DevOps, com descida na hierarquia ─────────────────

function LinhaRemota({
  item,
  conhecidos,
  nivel,
  selecionadaId,
  onSelecionar,
  criando,
  setCriando,
  formPara,
  alvo,
}: {
  item: ItemDevops;
  alvo?: AlvoAnotacao;
  conhecidos: Map<number, ItemDevops>;
  nivel: number;
  selecionadaId: number | null;
  onSelecionar: (i: ItemDevops) => void;
  criando: Criando;
  setCriando: (c: Criando) => void;
  formPara: (item: ItemDevops, tipo: 'Task' | 'PBI') => React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const tipo = item.work_item_type ?? '';
  const desce = tipo !== 'Task' && nivel < 3;
  const caminho = nivel === 0 ? caminhoDe(item, conhecidos) : null;
  const prazo = prazoSprint(item, hojeISO());

  return (
    <div className={cn(nivel > 0 && 'ml-4 border-l pl-2')}>
      {/* duas linhas: na coluna estreita o título não some atrás das ações */}
      <AlvoPbi item={item} alvo={alvo} className={cn('rounded-md', selecionadaId === item.id ? 'bg-flag-gold/15' : 'hover:bg-muted/40')}>
        <div className="flex items-center gap-2">
          {desce ? (
            <button type="button" onClick={() => setAberto((a) => !a)} className="shrink-0" title={aberto ? 'Recolher' : 'Ver os filhos'}>
              <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', aberto && 'rotate-90')} />
            </button>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <IconeTipo tipo={tipo} />
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">#{item.id}</span>
          <span className="block min-w-0 flex-1 truncate text-sm" title={item.title ?? ''}>
            {item.title}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2 pl-5">
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            {[item.state, caminho].filter(Boolean).join(' · ')}
          </span>
          <RotuloSprint prazo={prazo} tags={item.tags} />
          <SinalAlvo item={item} alvo={alvo} />
          {!alvo?.escolhendo && !alvo?.arrastando && (
            <AcoesItem
              item={item}
              selecionada={selecionadaId === item.id}
              onSelecionar={() => onSelecionar(item)}
              onNovo={(t) => setCriando({ tipo: t, pai: item })}
            />
          )}
          <LinkDevops item={item} />
        </div>
      </AlvoPbi>
      {formPara(item, tipo === 'Feature' ? 'PBI' : 'Task')}
      {aberto && (
        <Filhos
          id={item.id}
          conhecidos={conhecidos}
          nivel={nivel + 1}
          selecionadaId={selecionadaId}
          onSelecionar={onSelecionar}
          criando={criando}
          setCriando={setCriando}
          formPara={formPara}
          alvo={alvo}
        />
      )}
    </div>
  );
}

function Filhos(props: {
  id: number;
  conhecidos: Map<number, ItemDevops>;
  nivel: number;
  selecionadaId: number | null;
  onSelecionar: (i: ItemDevops) => void;
  criando: Criando;
  setCriando: (c: Criando) => void;
  formPara: (item: ItemDevops, tipo: 'Task' | 'PBI') => React.ReactNode;
  alvo?: AlvoAnotacao;
}) {
  const { id, ...linha } = props;
  const { data, isLoading, error } = useFilhosTimer(id);
  if (isLoading) return <p className="ml-6 py-1 text-xs text-muted-foreground">Carregando…</p>;
  if (error) return <p className="ml-6 py-1 text-xs text-destructive">{(error as Error).message}</p>;
  if (!data?.itens.length) return <p className="ml-6 py-1 text-xs text-muted-foreground">Sem filhos abertos.</p>;
  return (
    <div className="space-y-0.5">
      {data.itens.map((f) => (
        <LinhaRemota key={f.id} {...linha} item={f} />
      ))}
    </div>
  );
}
