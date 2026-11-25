import { useEffect, useMemo, useState } from 'react';
import { List, Loader2, NotebookPen } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  ErroTimer,
  useAcrescentarTags,
  useBuscaTimer,
  useCamposTimer,
  useCriarItemTimer,
  useMinhasTarefasTimer,
  type ItemTimer,
} from '@/hooks/useTimerTarefas';
import type { ItemDevops } from '@/lib/minhasAtividades';
import { getCurrentOfficialSprintCode } from '@/lib/sprintCalendar';
import { pbisDaSprint } from '@/lib/timerSelecao';
import { SeletorTags } from '@/components/timer/SeletorTags';
import { avisoTagsDescartadas, classificacaoCompleta, classificacaoVazia, type Classificacao } from '@/lib/timerTags';

const FECHADOS = ['Done', 'Closed', 'Removed'];
const TIPOS_PAI = ['Product Backlog Item', 'Bug'];
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Anotação → Task (pedido do Igor, 25/11/2026): o ▶ da anotação abre este
 * pop-up para escolher o PBI em que a Task entra, no lugar do modo "clique no
 * PBI" da coluna do meio. Arrastar a anotação até um PBI abre o mesmo pop-up
 * com o PBI já escolhido (e sem iniciar o timer, decisão de 19/11).
 * Cliente, Produto e Categoria começam SEM seleção: a pessoa escolhe sempre.
 */
export function DialogoAnotacao({
  anotacao,
  pbiInicial = null,
  iniciar,
  onFechar,
  onCriada,
}: {
  anotacao: { id: string; texto: string };
  /** veio de arrastar até um PBI: ele já vem escolhido */
  pbiInicial?: ItemDevops | null;
  /** true no ▶ (cria e inicia o timer); false ao arrastar (só cria) */
  iniciar: boolean;
  onFechar: () => void;
  onCriada: (item: ItemTimer) => void;
}) {
  const minhas = useMinhasTarefasTimer();
  const criar = useCriarItemTimer();
  const acrescentarTags = useAcrescentarTags();
  const [titulo, setTitulo] = useState(anotacao.texto.replace(/[\r\n]+/g, ' ').trim().slice(0, 255));
  const [busca, setBusca] = useState('');
  const [escolhido, setEscolhido] = useState<ItemDevops | null>(pbiInicial);
  const [cls, setCls] = useState<Classificacao>(() => classificacaoVazia());

  const sprint = getCurrentOfficialSprintCode();
  const { daSprint, daArvore } = useMemo(() => {
    const itens = minhas.data?.itens ?? [];
    const ancestrais = minhas.data?.ancestrais ?? [];
    const sp = pbisDaSprint(itens, ancestrais, sprint);
    const ids = new Set(sp.map((p) => p.id));
    const vistos = new Set<number>();
    const resto = [...ancestrais, ...itens].filter((i) => {
      if (ids.has(i.id) || vistos.has(i.id)) return false;
      vistos.add(i.id);
      return TIPOS_PAI.includes(i.work_item_type ?? '') && !FECHADOS.includes(i.state ?? '');
    });
    return { daSprint: sp, daArvore: resto };
  }, [minhas.data, sprint]);
  const idsSprint = useMemo(() => new Set(daSprint.map((p) => p.id)), [daSprint]);

  // Busca no DevOps inteiro com 3 letras ou #id, como no Timer em Reunião.
  const [buscaAtrasada, setBuscaAtrasada] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setBuscaAtrasada(busca), 400);
    return () => window.clearTimeout(t);
  }, [busca]);
  const remota = useBuscaTimer(buscaAtrasada);
  const termo = buscaAtrasada.trim();
  const buscaRemota = /^#?\d+$/.test(termo) || termo.replace(/^#/, '').length >= 3;

  const achados = useMemo(() => {
    const alvo = semAcento(busca.trim().replace(/^#/, ''));
    const locais = [...daSprint, ...daArvore].filter((p) => !alvo || semAcento(`${p.id} ${p.title ?? ''}`).includes(alvo));
    const doDevops = buscaRemota
      ? [...(remota.data?.itens ?? []), ...(remota.data?.ancestrais ?? [])].filter(
          (i) => TIPOS_PAI.includes(i.work_item_type ?? '') && !FECHADOS.includes(i.state ?? ''),
        )
      : [];
    const vistos = new Set<number>();
    const todos = [...(pbiInicial ? [pbiInicial] : []), ...locais, ...doDevops];
    return todos.filter((i) => (vistos.has(i.id) ? false : (vistos.add(i.id), true))).slice(0, 30);
  }, [busca, daSprint, daArvore, buscaRemota, remota.data, pbiInicial]);

  const projeto = (escolhido as Partial<ItemTimer> | null)?.team_project ?? null;
  const campos = useCamposTimer(projeto, 'Task');
  const tituloOk = titulo.trim().length >= 3 && titulo.trim().length <= 255;
  const camposOk = classificacaoCompleta(cls, campos.data);
  const pronto = tituloOk && !!escolhido && camposOk && !criar.isPending;

  const gravar = async () => {
    if (!pronto || !escolhido) return;
    try {
      const r = await criar.mutateAsync({
        tipo: 'Task',
        titulo: titulo.trim(),
        paiId: escolhido.id,
        tags: cls.tags,
        cliente: cls.cliente,
        produto: cls.produto,
      });
      acrescentarTags(projeto, cls.tags);
      if (!r.item) throw new ErroTimer('sem_item', 'O DevOps não devolveu a Task criada.');
      const url = r.item.web_url;
      toast.success(
        `Task #${r.item.id} criada em #${escolhido.id} e atribuída a você${iniciar ? '. O timer começou.' : ' (timer parado).'}`,
        {
          description: `Descrição, prints e anexos: complete direto no Azure DevOps.${avisoTagsDescartadas(r.tagsDescartadas)}`,
          duration: 10_000,
          ...(url ? { action: { label: 'Abrir no DevOps', onClick: () => window.open(url, '_blank', 'noopener') } } : {}),
        },
      );
      onCriada(r.item);
      onFechar();
    } catch (e) {
      toast.error(e instanceof ErroTimer ? e.message : 'Não foi possível criar a Task.');
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onFechar();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto overflow-x-hidden sm:max-w-md [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <NotebookPen className="h-4 w-4 text-flag-gold" /> Virar Task
          </DialogTitle>
          <DialogDescription>
            {iniciar ? 'Escolha o PBI em que a Task entra. O timer começa nela.' : 'A Task entra no PBI escolhido. O timer não começa.'}
          </DialogDescription>
        </DialogHeader>

        <form
          id="form-anotacao"
          className="min-w-0 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void gravar();
          }}
        >
          <div className="space-y-1">
            <label htmlFor="anotacao-titulo" className="text-xs font-medium">
              Título da Task
            </label>
            <Textarea
              id="anotacao-titulo"
              rows={2}
              className="min-h-0 resize-none text-sm leading-snug"
              value={titulo}
              maxLength={255}
              onChange={(e) => setTitulo(e.target.value.replace(/[\r\n]+/g, ' '))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void gravar();
                }
              }}
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium">Onde entra</p>
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar o PBI (nome ou #id)"
              aria-label="Pesquisar o PBI (nome ou #id)"
              className="h-8 text-xs"
            />
            <div className="max-h-56 overflow-y-auto rounded-md border border-border">
              {minhas.isLoading && <p className="px-2 py-1.5 text-[11px] text-muted-foreground">Carregando seus PBIs…</p>}
              {achados.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setEscolhido(p)}
                  aria-pressed={escolhido?.id === p.id}
                  className={cn(
                    'flex w-full items-center gap-2 border-b border-border/60 px-2 py-1.5 text-left text-xs last:border-b-0',
                    escolhido?.id === p.id ? 'bg-flag-gold/15' : 'hover:bg-muted',
                  )}
                >
                  <List className="h-3.5 w-3.5 shrink-0 text-[#009CCC] dark:text-[#3DBDE8]" />
                  <span className="min-w-0 flex-1 truncate" title={p.title ?? ''}>
                    {p.title}
                  </span>
                  {idsSprint.has(p.id) && (
                    <span className="shrink-0 rounded bg-flag-gold/20 px-1 text-[10px] font-medium text-flag-navy dark:text-flag-gold">
                      {sprint}
                    </span>
                  )}
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">#{p.id}</span>
                </button>
              ))}
              {!minhas.isLoading && achados.length === 0 && (
                <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                  {remota.isFetching ? 'Buscando no DevOps…' : busca.trim() ? 'Nada encontrado.' : 'Nenhum PBI aberto na sua árvore.'}
                </p>
              )}
            </div>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {remota.isFetching && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
              {buscaRemota
                ? 'Inclui o que achou no DevOps inteiro.'
                : `Os da sprint ${sprint} vêm primeiro. Não achou? Digite 3 letras ou o #id.`}
            </p>
          </div>

          {/* Cliente e Produto dependem do projeto do PBI: sem ele, não há lista */}
          {projeto ? (
            <SeletorTags projeto={projeto} tipo="Task" valor={cls} onChange={setCls} />
          ) : (
            <p className="rounded-md border border-dashed border-border px-2 py-2 text-[11px] text-muted-foreground">
              Escolha o PBI acima para carregar Cliente, Produto e Categoria.
            </p>
          )}
        </form>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="form-anotacao"
            disabled={!pronto}
            className="bg-flag-gold text-flag-navy hover:bg-flag-gold/90"
            title={!escolhido ? 'Escolha o PBI' : !tituloOk ? 'Escreva o título (3 letras ou mais)' : !camposOk ? 'Escolha o cliente e o produto' : undefined}
          >
            {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : iniciar ? 'Criar e iniciar' : 'Criar Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
