import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, ListTree, Loader2, Play, Plus, RefreshCw, Search } from 'lucide-react';
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
import { ordenarPorAbertura, soAbertos, type OrdemTasks } from '@/lib/ordemAbertura';
import { BotaoOrdemAbertura } from '@/components/atividades/BotaoOrdemAbertura';
import { SeletorTags } from '@/components/timer/SeletorTags';
import { PlacarDemandas } from '@/components/timer/PlacarDemandas';
import { bateFiltro, type FiltroPlacar } from '@/lib/timerPlacar';
import { avisoTagsDescartadas, classificacaoCompleta, classificacaoVazia, type Classificacao } from '@/lib/timerTags';
import { agruparPorHierarquia, chavesRecolhiveis, filtrarAtividades, type ItemDevops } from '@/lib/minhasAtividades';
import { hojeISO, prazoSprint } from '@/lib/prazoSprint';
import { getCurrentOfficialSprintCode } from '@/lib/sprintCalendar';
import { caminhoDe, TIPOS_SELECIONAVEIS, type TarefaSelecionada } from '@/lib/timerSelecao';
import {
  ErroTimer,
  useBuscaTimer,
  useCriarItemTimer,
  useAcrescentarTags,
  useCamposTimer,
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
 * o timer nele. Arrastar uma anotação até um PBI/Bug chama `onAnotacaoSolta`
 * (a tela abre o pop-up "Virar Task" com o PBI escolhido; 25/11/2026).
 */
export function PainelTarefas({
  selecionada,
  rodandoIds,
  onSelecionar,
  anotacaoArrastada = null,
  onAnotacaoSolta,
  embutido = false,
  iniciarRecolhido = false,
  podeIniciar = true,
}: {
  selecionada: TarefaSelecionada | null;
  /** com timers em paralelo, todos os que rodam (TM9) */
  rodandoIds?: number[];
  onSelecionar: (t: TarefaSelecionada) => void;
  /** anotação sendo arrastada da outra coluna: os PBIs/Bugs se mostram como alvo */
  anotacaoArrastada?: AnotacaoArrastada | null;
  /** a anotação foi solta num PBI/Bug */
  onAnotacaoSolta?: (pai: ItemDevops, a: AnotacaoArrastada) => void;
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

  useEffect(() => {
    const t = window.setTimeout(() => setBuscaAtrasada(busca), 450);
    return () => window.clearTimeout(t);
  }, [busca]);

  const remota = useBuscaTimer(buscaAtrasada);
  const hoje = hojeISO();
  const itens = useMemo(() => minhas.data?.itens ?? [], [minhas.data]);
  const ancestrais = useMemo(() => minhas.data?.ancestrais ?? [], [minhas.data]);
  // placar (25/11/2026): um chip ativo filtra a árvore por tipo ou tag
  const [filtroPlacar, setFiltroPlacar] = useState<FiltroPlacar | null>(null);
  const doPlacar = useMemo(
    () => (filtroPlacar ? itens.filter((i) => bateFiltro(i, filtroPlacar)) : itens),
    [itens, filtroPlacar],
  );
  const filtrados = useMemo(() => filtrarAtividades(doPlacar, ancestrais, busca), [doPlacar, ancestrais, busca]);
  const grupos = useMemo(() => agruparPorHierarquia(filtrados, ancestrais, hoje), [filtrados, ancestrais, hoje]);

  // Quadro minimizado: na primeira carga, só as épicas à vista.
  if (!recolheuInicio && grupos.length > 0) {
    setRecolheuInicio(true);
    setRecolhidos(new Set(chavesRecolhiveis(grupos)));
  }

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

  // Anotação solta num PBI: a tela abre o pop-up "Virar Task" com ele já
  // escolhido (sem iniciar o timer, decisão de 19/11). O ▶ da anotação abre o
  // mesmo pop-up sem PBI: não há mais o modo "clique no PBI" aqui (25/11/2026).
  const alvo: AlvoAnotacao = {
    escolhendo: false,
    arrastando: !!anotacaoArrastada,
    ocupado: null,
    onEscolher: () => {},
    onSoltar: (pai, dt) => {
      const a = lerArrasto(dt) ?? anotacaoArrastada;
      if (a) onAnotacaoSolta?.(pai, a);
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
        onCancelar={() => setCriando(null)}
        onCriado={(novo) => {
          setCriando(null);
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
        {!embutido && campoBusca}
        {!minhas.isLoading && (
          <PlacarDemandas
            itens={itens}
            filtro={filtroPlacar}
            onFiltro={(f) => {
              setFiltroPlacar(f);
              // filtrando, a árvore abre para mostrar o que bateu; limpando, volta às épicas
              setRecolhidos(
                f ? new Set() : new Set(chavesRecolhiveis(agruparPorHierarquia(filtrarAtividades(itens, ancestrais, busca), ancestrais, hoje))),
              );
            }}
          />
        )}

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
              ordenarTasks: true,
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
  const acrescentarTags = useAcrescentarTags();
  const [titulo, setTitulo] = useState(tituloInicial);
  // cliente, produto e categoria começam sem seleção (pedido do Igor, 25/11/2026)
  const [cls, setCls] = useState<Classificacao>(() => classificacaoVazia());
  const projeto = (pai as Partial<ItemTimer>).team_project ?? null;
  const tipoDevops = tipo === 'Task' ? 'Task' : 'Product Backlog Item';
  const campos = useCamposTimer(projeto, tipoDevops);
  const completa = classificacaoCompleta(cls, campos.data);
  const valido = titulo.trim().length >= 3 && titulo.trim().length <= 255 && completa;

  const enviar = async () => {
    if (!valido || criar.isPending) return;
    try {
      const r = await criar.mutateAsync({
        tipo,
        titulo: titulo.trim(),
        paiId: pai.id,
        tags: cls.tags,
        cliente: cls.cliente,
        produto: cls.produto,
      });
      acrescentarTags(projeto, cls.tags);
      const url = r.item?.web_url;
      toast.success(`${tipo} #${r.item?.id ?? ''} criada e atribuída a você.`, {
        description: `Descrição, prints e anexos: complete direto no Azure DevOps.${avisoTagsDescartadas(r.tagsDescartadas)}`,
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
      <SeletorTags projeto={projeto} tipo={tipoDevops} valor={cls} onChange={setCls} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {titulo.trim().length}/255{!completa && campos.data ? ' · falta cliente ou produto' : ''}
        </span>
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
  // filhos pela abertura: o mais novo em cima (a Task recém-criada aparece)
  const [ordem, setOrdem] = useState<OrdemTasks>('recentes');
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
          {desce && aberto && <BotaoOrdemAbertura ordem={ordem} onMudar={setOrdem} comPadrao={false} />}
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
          ordem={ordem}
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
  ordem: OrdemTasks;
  conhecidos: Map<number, ItemDevops>;
  nivel: number;
  selecionadaId: number | null;
  onSelecionar: (i: ItemDevops) => void;
  criando: Criando;
  setCriando: (c: Criando) => void;
  formPara: (item: ItemDevops, tipo: 'Task' | 'PBI') => React.ReactNode;
  alvo?: AlvoAnotacao;
}) {
  const { id, ordem, ...linha } = props;
  const { data, isLoading, error } = useFilhosTimer(id);
  // só To Do e In Progress: Done, Closed e Removed não listam (pedido do Igor, 19/11/2026)
  const abertos = useMemo(() => ordenarPorAbertura(soAbertos(data?.itens ?? []), ordem), [data, ordem]);
  if (isLoading) return <p className="ml-6 py-1 text-xs text-muted-foreground">Carregando…</p>;
  if (error) return <p className="ml-6 py-1 text-xs text-destructive">{(error as Error).message}</p>;
  if (!abertos.length) return <p className="ml-6 py-1 text-xs text-muted-foreground">Sem filhos abertos.</p>;
  return (
    <div className="space-y-0.5">
      {abertos.map((f) => (
        <LinhaRemota key={f.id} {...linha} item={f} />
      ))}
    </div>
  );
}
