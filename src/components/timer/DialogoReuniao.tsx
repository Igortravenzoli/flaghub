import { useMemo, useState } from 'react';
import { Loader2, Trophy } from 'lucide-react';
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
import { ErroTimer, useAcrescentarTags, useReuniaoTimer, type ItemTimer } from '@/hooks/useTimerTarefas';
import type { ItemDevops } from '@/lib/minhasAtividades';
import { getCurrentOfficialSprintCode } from '@/lib/sprintCalendar';
import { temProduto } from '@/lib/timerTags';
import { SeletorTags } from '@/components/timer/SeletorTags';

/** Projeto do guarda-chuva de reuniões (o mesmo da edge). */
const PROJETO_REUNIOES = 'Flag.Planejamento';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * "Rec reunião" (pedido do Igor, 18/11/2026): a call que "simplesmente
 * ocorre", sem PBI nem Task. Vira a Task "Reunião - <tema>" na Feature
 * escolhida ou, sem Feature, no PBI guarda-chuva "[REUNIÕES] S{n}-{ano}" da
 * sprint. Começa agora (o servidor segue sendo o único relógio).
 */
export function DialogoReuniao({
  aberto,
  onFechar,
  features,
  onCriada,
}: {
  aberto: boolean;
  onFechar: () => void;
  /** as Features já carregadas na árvore (buscar aqui não chama o DevOps) */
  features: ItemDevops[];
  onCriada: (item: ItemTimer) => void;
}) {
  const criar = useReuniaoTimer();
  const acrescentarTags = useAcrescentarTags();
  const [tema, setTema] = useState('');
  const [comFeature, setComFeature] = useState(true);
  const [busca, setBusca] = useState('');
  const [feature, setFeature] = useState<ItemDevops | null>(null);
  const [tags, setTags] = useState<string[]>([]);

  const projeto = comFeature && feature ? (feature as Partial<ItemTimer>).team_project ?? PROJETO_REUNIOES : PROJETO_REUNIOES;
  const achadas = useMemo(() => {
    const alvo = semAcento(busca.trim().replace(/^#/, ''));
    const lista = features.filter((f) => !alvo || semAcento(`${f.id} ${f.title ?? ''}`).includes(alvo));
    return lista.slice(0, 6);
  }, [features, busca]);

  const temaOk = tema.trim().length >= 3;
  const ondeOk = !comFeature || !!feature;
  const produtoOk = temProduto(tags);
  const pronto = temaOk && ondeOk && produtoOk && !criar.isPending;

  const limpar = () => {
    setTema('');
    setBusca('');
    setFeature(null);
    setTags([]);
    setComFeature(true);
  };

  const gravar = async () => {
    if (!pronto) return;
    try {
      const r = await criar.mutateAsync({ tema: tema.trim(), featureId: comFeature ? feature?.id ?? null : null, tags });
      acrescentarTags(projeto, tags);
      const onde = r.pai ? `#${r.pai.id} ${r.pai.title ?? ''}` : 'o guarda-chuva da sprint';
      toast.success(`Reunião #${r.item.id} criada em ${onde}. O timer começou.`, {
        description: r.recusouFeature
          ? 'O DevOps não aceitou a Task direto na Feature: ela foi para o guarda-chuva da sprint.'
          : 'Ao terminar, pause ou lance como qualquer timer.',
        duration: 10_000,
      });
      onCriada(r.item);
      limpar();
      onFechar();
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden /> Rec reunião
          </DialogTitle>
          <DialogDescription>A call vira uma Task e o timer começa agora.</DialogDescription>
        </DialogHeader>

        <form
          id="form-reuniao"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void gravar();
          }}
        >
          <div className="space-y-1">
            <label htmlFor="reuniao-tema" className="text-xs font-medium">
              Tema
            </label>
            <div className="flex items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
              <span className="shrink-0 pl-3 text-sm text-muted-foreground">Reunião -</span>
              <Input
                id="reuniao-tema"
                autoFocus
                value={tema}
                maxLength={230}
                onChange={(e) => setTema(e.target.value)}
                placeholder="Segurança do SuiteFlexx"
                className="h-9 border-0 pl-1.5 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium">Onde entra</p>
            <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Onde a reunião entra">
              {[
                { v: true, rotulo: 'Numa Feature' },
                { v: false, rotulo: 'Sem Feature' },
              ].map((o) => (
                <button
                  key={o.rotulo}
                  type="button"
                  role="tab"
                  aria-selected={comFeature === o.v}
                  onClick={() => setComFeature(o.v)}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1 text-xs font-medium',
                    comFeature === o.v ? 'bg-background shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  {o.rotulo}
                </button>
              ))}
            </div>
            {comFeature ? (
              <div className="space-y-1">
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar a Feature (nome ou #id)"
                  aria-label="Buscar a Feature"
                  className="h-8 text-xs"
                />
                {features.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">Nenhuma Feature na sua árvore. Use "Sem Feature".</p>
                ) : (
                  <div className="overflow-hidden rounded-md border border-border">
                    {achadas.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFeature(f)}
                        aria-pressed={feature?.id === f.id}
                        className={cn(
                          'flex w-full items-center gap-2 border-b border-border/60 px-2 py-1.5 text-left text-xs last:border-b-0',
                          feature?.id === f.id ? 'bg-flag-gold/15' : 'hover:bg-muted',
                        )}
                      >
                        <Trophy className="h-3.5 w-3.5 shrink-0 text-[#773B93] dark:text-[#B57FD1]" />
                        <span className="min-w-0 flex-1 truncate">{f.title}</span>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">#{f.id}</span>
                      </button>
                    ))}
                    {achadas.length === 0 && <p className="px-2 py-1.5 text-[11px] text-muted-foreground">Nada encontrado.</p>}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Se o DevOps não aceitar a Task direto na Feature, ela vai para o guarda-chuva da sprint.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Vai para o guarda-chuva da sprint:{' '}
                <span className="font-mono text-foreground">[REUNIÕES] {getCurrentOfficialSprintCode()}</span> ·{' '}
                {PROJETO_REUNIOES}
              </p>
            )}
          </div>

          <SeletorTags projeto={projeto} valor={tags} onChange={setTags} produtoObrigatorio />
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
            title={!temaOk ? 'Escreva o tema' : !ondeOk ? 'Escolha a Feature' : !produtoOk ? 'Escolha o produto' : undefined}
          >
            {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Gravar reunião'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
