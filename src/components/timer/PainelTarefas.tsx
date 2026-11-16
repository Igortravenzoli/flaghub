import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, ListTree, Loader2, Plus, RefreshCw, Search, Target } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ArvoreAtividades, Aviso, Estado, LinkDevops, RotuloSprint } from '@/components/atividades/ArvoreAtividades';
import { agruparPorHierarquia, chavesRecolhiveis, filtrarAtividades, type ItemDevops } from '@/lib/minhasAtividades';
import { hojeISO, prazoSprint } from '@/lib/prazoSprint';
import { getCurrentOfficialSprintCode } from '@/lib/sprintCalendar';
import { caminhoDe, TIPOS_SELECIONAVEIS, type TarefaSelecionada } from '@/lib/timerSelecao';
import {
  ErroTimer,
  useBuscaTimer,
  useCriarItemTimer,
  useFilhosTimer,
  useMinhasTarefasTimer,
  type ItemTimer,
} from '@/hooks/useTimerTarefas';

type Criando = { tipo: 'Task' | 'PBI'; pai: ItemDevops } | null;

const ROTULO_TIPO: Record<string, string> = {
  Epic: 'Epic',
  Feature: 'Feature',
  'Product Backlog Item': 'PBI',
  Bug: 'Bug',
  Task: 'Task',
};

/**
 * Painel "Minhas tarefas" do Timer: a árvore do que está atribuído à pessoa
 * (a mesma de /minhas-atividades, lida ao vivo do DevOps), a busca no DevOps
 * inteiro e a criação de Task (sob PBI/Bug) e PBI (sob Feature).
 */
export function PainelTarefas({
  selecionada,
  onSelecionar,
}: {
  selecionada: TarefaSelecionada | null;
  onSelecionar: (t: TarefaSelecionada) => void;
}) {
  const minhas = useMinhasTarefasTimer();
  const [busca, setBusca] = useState('');
  const [buscaAtrasada, setBuscaAtrasada] = useState('');
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const [criando, setCriando] = useState<Criando>(null);

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

  const acoesItem = (item: ItemDevops) => (
    <AcoesItem
      item={item}
      selecionada={selecionada?.id === item.id}
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListTree className="h-4 w-4 text-primary" /> Minhas tarefas
            </CardTitle>
            <CardDescription>O que está atribuído a você no Azure DevOps. Escolha onde marcar o tempo.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setRecolhidos(new Set())} title="Expandir tudo">
              <ChevronsUpDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRecolhidos(new Set(chavesRecolhiveis(grupos)))}
              title="Recolher tudo"
            >
              <ChevronsDownUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void minhas.refetch()}
              disabled={minhas.isFetching}
              title="Recarregar do Azure DevOps"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', minhas.isFetching && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8 text-sm"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar as suas, ou buscar no DevOps: título (3+ letras) ou #16603"
          />
        </div>

        {minhas.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : minhas.error ? (
          <Aviso>{(minhas.error as Error).message}</Aviso>
        ) : itens.length === 0 ? (
          <Aviso>Nada aberto atribuído a você no Azure DevOps. Busque acima para achar ou criar um item.</Aviso>
        ) : grupos.length === 0 ? (
          <Aviso>Nenhuma das suas tarefas bate com a busca.</Aviso>
        ) : (
          <ArvoreAtividades
            grupos={grupos}
            hoje={hoje}
            recolhidos={recolhidos}
            alternar={alternar}
            acoes={{
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
          <p className="text-[11px] text-muted-foreground">Mostrando os 200 itens mexidos mais recentemente.</p>
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
              <p className="text-xs text-muted-foreground">Nada além das suas tarefas bate com “{termo}”.</p>
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
                  />
                ))}
                {remota.data?.truncado && (
                  <p className="text-[11px] text-muted-foreground">Mostrando os 30 mais recentes; refine a busca.</p>
                )}
              </div>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  );
}

// ─── ações de cada linha ─────────────────────────────────────────────────────

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
      {TIPOS_SELECIONAVEIS.has(tipo) && (
        <Button
          variant={selecionada ? 'default' : 'outline'}
          size="sm"
          className={cn('h-6 gap-1 px-2 text-[11px]', selecionada && 'bg-flag-gold text-flag-navy hover:bg-flag-gold')}
          onClick={onSelecionar}
          title="Marcar o tempo nesta tarefa"
        >
          <Target className="h-3 w-3" />
          {selecionada ? 'Selecionada' : 'Selecionar'}
        </Button>
      )}
    </span>
  );
}

function FormNovoItem({
  tipo,
  pai,
  onCancelar,
  onCriado,
}: {
  tipo: 'Task' | 'PBI';
  pai: ItemDevops;
  onCancelar: () => void;
  onCriado: (item: ItemTimer | null) => void;
}) {
  const criar = useCriarItemTimer();
  const [titulo, setTitulo] = useState('');
  const valido = titulo.trim().length >= 3 && titulo.trim().length <= 255;

  const enviar = async () => {
    if (!valido || criar.isPending) return;
    try {
      const r = await criar.mutateAsync({ tipo, titulo: titulo.trim(), paiId: pai.id });
      toast.success(`${tipo} #${r.item?.id ?? ''} criada e atribuída a você.`);
      onCriado(r.item ?? null);
    } catch (e) {
      toast.error(e instanceof ErroTimer ? e.message : 'Não foi possível criar o item.');
    }
  };

  return (
    <form
      className="space-y-2 border-t border-dashed bg-muted/20 px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      <p className="text-[11px] text-muted-foreground">
        {tipo === 'Task'
          ? `Nova Task em #${pai.id}, na mesma sprint dele, atribuída a você.`
          : `Novo PBI em #${pai.id}, na sprint atual (${getCurrentOfficialSprintCode()}), atribuído a você.`}
      </p>
      <div className="flex gap-2">
        <Input
          autoFocus
          className="h-8 text-sm"
          value={titulo}
          maxLength={255}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder={tipo === 'Task' ? 'Título da Task' : 'Título do PBI'}
        />
        <Button type="submit" size="sm" className="h-8" disabled={!valido || criar.isPending}>
          {criar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Criar'}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8" onClick={onCancelar}>
          Cancelar
        </Button>
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
}: {
  item: ItemDevops;
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
      <div
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1.5',
          selecionadaId === item.id ? 'bg-flag-gold/15' : 'hover:bg-muted/40',
        )}
      >
        {desce ? (
          <button type="button" onClick={() => setAberto((a) => !a)} className="shrink-0" title={aberto ? 'Recolher' : 'Ver os filhos'}>
            <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', aberto && 'rotate-90')} />
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {ROTULO_TIPO[tipo] ?? tipo}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">#{item.id}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm" title={item.title ?? ''}>
            {item.title}
          </span>
          {caminho && <span className="block truncate text-[11px] text-muted-foreground">{caminho}</span>}
        </span>
        <Estado state={item.state} />
        <RotuloSprint prazo={prazo} tags={item.tags} />
        <AcoesItem
          item={item}
          selecionada={selecionadaId === item.id}
          onSelecionar={() => onSelecionar(item)}
          onNovo={(t) => setCriando({ tipo: t, pai: item })}
        />
        <LinkDevops item={item} />
      </div>
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
