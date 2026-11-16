import { useMemo, useState } from 'react';
import { History, Loader2, Scissors, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import type { MotorTimer } from '@/hooks/useTimerRelogio';
import { useTimerEstado } from '@/hooks/useTimerRelogio';
import {
  diaCurto,
  duracaoSeg,
  foiAutomatico,
  horaCurta,
  horaNoDia,
  horas,
  ROTULO_MOTIVO,
  type TrechoFechado,
} from '@/lib/timerRelogio';

type Periodo = 1 | 7;

/** Trechos fechados de hoje (ou dos últimos 7 dias), com encurtar e descartar. */
export function TrechosDoDia({ motor }: { motor: MotorTimer }) {
  const [periodo, setPeriodo] = useState<Periodo>(1);
  const usarSemana = periodo === 7;
  // a de 7 dias só busca quando pedida
  const semana = useTimerEstado(7, usarSemana);
  const fonte = usarSemana ? semana.data : motor.estado;
  const carregando = usarSemana ? semana.isFetching && !semana.data : motor.carregando;

  const [encurtando, setEncurtando] = useState<TrechoFechado | null>(null);
  const [descartando, setDescartando] = useState<TrechoFechado | null>(null);

  const porDia = useMemo(() => {
    const grupos = new Map<string, TrechoFechado[]>();
    for (const t of fonte?.trechos ?? []) {
      const k = diaCurto(t.iniciado_em);
      const g = grupos.get(k) ?? [];
      g.push(t);
      grupos.set(k, g);
    }
    return [...grupos.entries()];
  }, [fonte]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" /> Trechos
          </CardTitle>
          <CardDescription>Dá para encurtar ou descartar um trecho dos últimos 7 dias. Aumentar, não.</CardDescription>
        </div>
        <div className="flex rounded-md border p-0.5 text-xs">
          {([1, 7] as Periodo[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriodo(p)}
              className={cn(
                'rounded px-2.5 py-1 font-medium',
                periodo === p ? 'bg-flag-navy text-white' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {p === 1 ? 'Hoje' : '7 dias'}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {carregando ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : porDia.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum trecho fechado {periodo === 1 ? 'hoje' : 'nos últimos 7 dias'}.
          </p>
        ) : (
          <div className="space-y-4">
            {porDia.map(([dia, trechos]) => {
              const total = trechos.filter((t) => !t.descartado).reduce((s, t) => s + duracaoSeg(t), 0);
              return (
                <div key={dia} className="space-y-1.5">
                  {periodo === 7 && (
                    <div className="flex items-baseline justify-between border-b pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <span>{dia}</span>
                      <span className="tabular-nums">{horas(total)}</span>
                    </div>
                  )}
                  <ul className="divide-y">
                    {trechos.map((t) => (
                      <LinhaTrecho
                        key={t.id}
                        t={t}
                        onEncurtar={() => setEncurtando(t)}
                        onDescartar={() => setDescartando(t)}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <DialogoEncurtar
        trecho={encurtando}
        ocupado={motor.acoes.corrigir.isPending}
        onFechar={() => setEncurtando(null)}
        onConfirmar={(fim) =>
          encurtando &&
          motor.acoes.corrigir.mutate(
            { id: encurtando.id, fim, dias: periodo },
            { onSuccess: () => setEncurtando(null) },
          )
        }
      />

      <AlertDialog open={!!descartando} onOpenChange={(o) => !o && setDescartando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar este trecho?</AlertDialogTitle>
            <AlertDialogDescription>
              {descartando &&
                `#${descartando.work_item_id} · ${horaCurta(descartando.iniciado_em)}–${horaCurta(descartando.encerrado_em)} (${horas(duracaoSeg(descartando))}). `}
              Ele deixa de contar e não será lançado. Fica registrado no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => descartando && motor.acoes.descartar.mutate({ id: descartando.id, dias: periodo })}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function LinhaTrecho({ t, onEncurtar, onDescartar }: { t: TrechoFechado; onEncurtar: () => void; onDescartar: () => void }) {
  const corrigido = t.encerrado_original_em && t.encerrado_original_em !== t.encerrado_em;
  const auto = foiAutomatico(t.motivo_fim);
  return (
    <li className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm', t.descartado && 'opacity-60')}>
      <span className={cn('w-24 shrink-0 font-mono text-xs tabular-nums', t.descartado && 'line-through')}>
        {horaCurta(t.iniciado_em)}–{horaCurta(t.encerrado_em)}
      </span>
      <span className={cn('w-16 shrink-0 text-right font-medium tabular-nums', t.descartado && 'line-through')}>
        {horas(duracaoSeg(t))}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="mr-1.5 font-mono text-xs text-muted-foreground">#{t.work_item_id}</span>
        {t.titulo}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {t.descartado ? (
          <Badge variant="outline">Descartado</Badge>
        ) : (
          <Badge
            variant="outline"
            className={cn(auto && 'border-[hsl(var(--warning)/0.5)] bg-[hsl(var(--warning)/0.1)] text-foreground')}
          >
            {ROTULO_MOTIVO[t.motivo_fim]}
          </Badge>
        )}
        {corrigido && !t.descartado && (
          <Badge variant="outline" title={`Fim original: ${horaCurta(t.encerrado_original_em!)}`}>
            Encurtado
          </Badge>
        )}
        {!t.descartado && (
          <>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onEncurtar} title="Encurtar">
              <Scissors className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onDescartar} title="Descartar">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </span>
    </li>
  );
}

function DialogoEncurtar({
  trecho,
  ocupado,
  onFechar,
  onConfirmar,
}: {
  trecho: TrechoFechado | null;
  ocupado: boolean;
  onFechar: () => void;
  onConfirmar: (fimIso: string) => void;
}) {
  const [valor, setValor] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  if (trecho && aberto !== trecho.id) {
    setAberto(trecho.id);
    setValor(horaCurta(trecho.encerrado_em));
  }

  const fim = trecho ? horaNoDia(trecho.iniciado_em, valor) : null;
  const valido =
    !!trecho && !!fim && Date.parse(fim) >= Date.parse(trecho.iniciado_em) && Date.parse(fim) <= Date.parse(trecho.encerrado_em);

  return (
    <Dialog
      open={!!trecho}
      onOpenChange={(o) => {
        if (!o) {
          setAberto(null);
          onFechar();
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Encurtar trecho</DialogTitle>
          <DialogDescription>
            {trecho &&
              `#${trecho.work_item_id} · começou às ${horaCurta(trecho.iniciado_em)} e terminou às ${horaCurta(trecho.encerrado_em)}.`}{' '}
            Informe a hora em que você de fato parou.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label htmlFor="timer-novo-fim" className="text-sm font-medium">
            Parei às
          </label>
          <Input id="timer-novo-fim" type="time" value={valor} onChange={(e) => setValor(e.target.value)} />
          {!valido && valor && (
            <p className="text-xs text-destructive">A hora tem de ficar entre o início e o fim atual do trecho.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button disabled={!valido || ocupado} onClick={() => fim && onConfirmar(fim)}>
            Encurtar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
