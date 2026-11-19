import { useMemo, useState } from 'react';
import { ClipboardList, List, Loader2, Trophy } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import {
  ErroTimer,
  useAcrescentarTags,
  useCamposTimer,
  useCriarItemTimer,
  useReuniaoTimer,
  type ItemTimer,
} from '@/hooks/useTimerTarefas';
import type { ItemDevops } from '@/lib/minhasAtividades';
import { SeletorTags } from '@/components/timer/SeletorTags';
import { classificacaoCompleta, classificacaoVazia, type Classificacao } from '@/lib/timerTags';

type Destino = 'feature' | 'pbi' | 'task';

/** Ordem pedida pelo Igor (18/11/2026): Feature, PBI, Task. */
const DESTINOS: { v: Destino; rotulo: string; Icone: typeof Trophy; cor: string; busca: string; nenhum: string }[] = [
  {
    v: 'feature',
    rotulo: 'Feature',
    Icone: Trophy,
    cor: 'text-[#773B93] dark:text-[#B57FD1]',
    busca: 'Pesquisar a Feature (nome ou #id)',
    nenhum: 'Nenhuma Feature na sua árvore.',
  },
  {
    v: 'pbi',
    rotulo: 'PBI',
    Icone: List,
    cor: 'text-[#009CCC] dark:text-[#3DBDE8]',
    busca: 'Pesquisar o PBI (nome ou #id)',
    nenhum: 'Nenhum PBI aberto na sua árvore.',
  },
  {
    v: 'task',
    rotulo: 'Task',
    Icone: ClipboardList,
    cor: 'text-[#C9A400] dark:text-[#F2CB1D]',
    busca: 'Pesquisar a Task (nome ou #id)',
    nenhum: 'Nenhuma Task aberta sua.',
  },
];

const AJUDA: Record<Destino, string> = {
  feature: 'Cria "Reunião - <tema>" na Feature. Se o DevOps não aceitar a Task direto na Feature, ela fica na raiz do projeto.',
  pbi: 'Cria "Reunião - <tema>" como Task dentro do PBI.',
  task: 'A hora vai para esta Task; nada novo é criado no DevOps.',
};

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * "Timer em Reunião" (pedido do Igor, 18/11/2026): a call que "simplesmente
 * ocorre". Três destinos, nesta ordem:
 *   • Feature — cria "Reunião - <tema>" na Feature (op `reuniao` da edge);
 *   • PBI — cria "Reunião - <tema>" como Task do PBI (op `criar`, a mesma do
 *     "+ Task");
 *   • Task que já existe — não cria nada: o timer liga nela.
 * Cliente e Produto obrigatórios quando o projeto tem os campos. Começa agora
 * (o servidor segue sendo o único relógio).
 */
export function DialogoReuniao({
  aberto,
  onFechar,
  features,
  pbis,
  tarefas,
  onCriada,
}: {
  aberto: boolean;
  onFechar: () => void;
  /** as Features já carregadas na árvore (buscar aqui não chama o DevOps) */
  features: ItemDevops[];
  /** os PBIs e Bugs abertos já carregados */
  pbis: ItemDevops[];
  /** as Tasks abertas da pessoa, já carregadas */
  tarefas: ItemDevops[];
  onCriada: (item: ItemTimer | ItemDevops) => void;
}) {
  const reuniao = useReuniaoTimer();
  const criarTask = useCriarItemTimer();
  const acrescentarTags = useAcrescentarTags();
  const [tema, setTema] = useState('');
  const [destino, setDestino] = useState<Destino>('feature');
  const [busca, setBusca] = useState('');
  const [escolhidos, setEscolhidos] = useState<Record<Destino, ItemDevops | null>>({ feature: null, pbi: null, task: null });
  const [cls, setCls] = useState<Classificacao>(() => classificacaoVazia());

  const d = DESTINOS.find((x) => x.v === destino)!;
  const escolhido = escolhidos[destino];
  const projeto = destino === 'task' ? null : (escolhido as Partial<ItemTimer> | null)?.team_project ?? null;
  const ocupado = reuniao.isPending || criarTask.isPending;

  const candidatos = useMemo(
    () => (destino === 'feature' ? features : destino === 'pbi' ? pbis : tarefas),
    [destino, features, pbis, tarefas],
  );
  const achados = useMemo(() => {
    const alvo = semAcento(busca.trim().replace(/^#/, ''));
    return candidatos.filter((f) => !alvo || semAcento(`${f.id} ${f.title ?? ''}`).includes(alvo)).slice(0, 6);
  }, [candidatos, busca]);

  const criaItem = destino !== 'task';
  const temaOk = !criaItem || (tema.trim().length >= 3 && tema.trim().length <= 230);
  const ondeOk = !!escolhido;
  const campos = useCamposTimer(projeto, 'Task');
  const camposOk = !criaItem || classificacaoCompleta(cls, campos.data);
  const pronto = temaOk && ondeOk && camposOk && !ocupado;

  const escolher = (item: ItemDevops) => {
    setEscolhidos((e) => ({ ...e, [destino]: item }));
    // no PBI, cliente e produto do campo dele já vêm escolhidos
    if (destino === 'pbi') setCls((c) => ({ ...c, ...classificacaoVazia(item as Partial<ItemTimer>), tags: c.tags }));
  };
  const limpar = () => {
    setTema('');
    setBusca('');
    setEscolhidos({ feature: null, pbi: null, task: null });
    setCls(classificacaoVazia());
    setDestino('feature');
  };
  const mudarDestino = (v: Destino) => {
    setDestino(v);
    setBusca('');
  };
  const fechar = (item: ItemTimer | ItemDevops, titulo: string, descricao: string) => {
    toast.success(titulo, { description: descricao, duration: 10_000 });
    onCriada(item);
    limpar();
    onFechar();
  };

  const gravar = async () => {
    if (!pronto || !escolhido) return;
    // Task que já existe: nada é criado, o timer liga nela.
    if (destino === 'task') {
      fechar(escolhido, `Reunião em #${escolhido.id}. O timer começou.`, 'Ao terminar, pause ou lance como qualquer timer.');
      return;
    }
    try {
      if (destino === 'pbi') {
        const r = await criarTask.mutateAsync({
          tipo: 'Task',
          titulo: `Reunião - ${tema.trim()}`,
          paiId: escolhido.id,
          tags: ['Reunião', ...cls.tags],
          cliente: cls.cliente,
          produto: cls.produto,
        });
        acrescentarTags(projeto, cls.tags);
        if (!r.item) throw new ErroTimer('sem_item', 'O DevOps não devolveu a Task criada.');
        fechar(r.item, `Reunião #${r.item.id} criada em #${escolhido.id}. O timer começou.`, 'Ao terminar, pause ou lance como qualquer timer.');
        return;
      }
      const r = await reuniao.mutateAsync({
        tema: tema.trim(),
        featureId: escolhido.id,
        projeto,
        tags: cls.tags,
        cliente: cls.cliente,
        produto: cls.produto,
      });
      acrescentarTags(projeto, cls.tags);
      fechar(
        r.item,
        r.pai ? `Reunião #${r.item.id} criada em #${r.pai.id}. O timer começou.` : `Reunião #${r.item.id} criada em ${projeto}. O timer começou.`,
        r.recusouFeature
          ? 'O DevOps não aceitou a Task direto na Feature: ela ficou na raiz do projeto.'
          : 'Ao terminar, pause ou lance como qualquer timer.',
      );
    } catch (e) {
      toast.error(e instanceof ErroTimer ? e.message : 'Não foi possível gravar a reunião.');
    }
  };

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) onFechar();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto overflow-x-hidden sm:max-w-md [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden /> Timer em Reunião
          </DialogTitle>
          <DialogDescription>A call vira hora lançável e o timer começa agora.</DialogDescription>
        </DialogHeader>

        <form
          id="form-reuniao"
          className="min-w-0 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void gravar();
          }}
        >
          <div className="space-y-1.5">
            <p className="text-xs font-medium">Onde entra</p>
            <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Onde a reunião entra">
              {DESTINOS.map((o) => (
                <button
                  key={o.v}
                  type="button"
                  role="tab"
                  aria-selected={destino === o.v}
                  onClick={() => mudarDestino(o.v)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium',
                    destino === o.v ? 'bg-background shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  <o.Icone className={cn('h-3.5 w-3.5', o.cor)} />
                  {o.rotulo}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={d.busca}
                aria-label={d.busca}
                className="h-8 text-xs"
              />
              {candidatos.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">{d.nenhum}</p>
              ) : (
                <div className="overflow-hidden rounded-md border border-border">
                  {achados.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => escolher(f)}
                      aria-pressed={escolhido?.id === f.id}
                      className={cn(
                        'flex w-full items-center gap-2 border-b border-border/60 px-2 py-1.5 text-left text-xs last:border-b-0',
                        escolhido?.id === f.id ? 'bg-flag-gold/15' : 'hover:bg-muted',
                      )}
                    >
                      <d.Icone className={cn('h-3.5 w-3.5 shrink-0', d.cor)} />
                      <span className="min-w-0 flex-1 truncate" title={f.title ?? ""}>{f.title}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">#{f.id}</span>
                    </button>
                  ))}
                  {achados.length === 0 && <p className="px-2 py-1.5 text-[11px] text-muted-foreground">Nada encontrado.</p>}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">{AJUDA[destino]}</p>
            </div>
          </div>

          {criaItem && (
            <>
              <div className="space-y-1">
                <label htmlFor="reuniao-tema" className="text-xs font-medium">
                  Tema
                </label>
                <div className="flex items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                  <span className="shrink-0 pl-3 text-sm text-muted-foreground">Reunião -</span>
                  <Input
                    id="reuniao-tema"
                    value={tema}
                    maxLength={230}
                    onChange={(e) => setTema(e.target.value)}
                    placeholder="Digite aqui o tema"
                    className="h-9 border-0 pl-1.5 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
              </div>
              {/* Cliente e Produto dependem do projeto de destino: sem ele, não há lista */}
              {projeto ? (
                <SeletorTags projeto={projeto} tipo="Task" valor={cls} onChange={setCls} />
              ) : (
                <p className="rounded-md border border-dashed border-border px-2 py-2 text-[11px] text-muted-foreground">
                  Escolha {destino === 'feature' ? 'a Feature' : 'o PBI'} acima para carregar Cliente, Produto e Categoria.
                </p>
              )}
            </>
          )}
        </form>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="form-reuniao"
            disabled={!pronto}
            className="bg-flag-gold text-flag-navy hover:bg-flag-gold/90"
            title={
              !ondeOk
                ? `Escolha ${destino === 'feature' ? 'a Feature' : destino === 'pbi' ? 'o PBI' : 'a Task'}`
                : !temaOk
                  ? 'Escreva o tema'
                  : !camposOk
                    ? 'Escolha o cliente e o produto'
                    : undefined
            }
          >
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cronometrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
