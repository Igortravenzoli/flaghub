import { useMemo, useState } from 'react';
import { ChevronRight, ExternalLink, History, Loader2, RotateCcw, Scissors, Send, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pilula, SOMBRA_XS, Vazio } from '@/components/timer/visual';
import { pedeAtencao, ROTULO_SITUACAO, rotuloDia, situacao } from '@/lib/timerLancamento';
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
import { LancamentosTimeLog } from '@/components/timer/LancamentosTimeLog';
import {
  diaCurto,
  duracaoSeg,
  foiAutomatico,
  horaCurta,
  horaNoDia,
  horas,
  ROTULO_MOTIVO,
  type Lancamento,
  type TrechoFechado,
} from '@/lib/timerRelogio';

type Periodo = 1 | 7;

/** Trechos fechados de hoje (ou dos últimos 7 dias), com encurtar, descartar e lançar. */
export function TrechosDoDia({
  motor,
  podeLancar,
  embutido = false,
}: {
  motor: MotorTimer;
  podeLancar: boolean;
  /** dentro do Em andamento (recolhível): sem moldura, com o título Lançamentos */
  embutido?: boolean;
}) {
  const Moldura = embutido ? 'div' : Card;
  const Cabeca = embutido ? 'div' : CardHeader;
  const Corpo = embutido ? 'div' : CardContent;
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
    <Moldura className={embutido ? 'space-y-3' : cn('rounded-xl', SOMBRA_XS)}>
      <Cabeca className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        {embutido ? (
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Por período</span>
        ) : (
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-primary" /> Lançamentos
          </CardTitle>
        )}
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
      </Cabeca>
      <Corpo className="space-y-4">
        {embutido ? (
          carregando ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando
            </div>
          ) : (
            <ListaPorTarefa
              trechos={fonte?.trechos ?? []}
              lancamentos={fonte?.lancamentos ?? []}
              mostrarDia={periodo === 7}
              onEncurtar={setEncurtando}
              onDescartar={setDescartando}
              onRelancar={(id) => motor.acoes.relancar.mutate(id)}
              relancando={motor.acoes.relancar.isPending}
            />
          )
        ) : null}
        {!embutido && !carregando && fonte && (
          <LancamentosTimeLog fonte={fonte} motor={motor} podeLancar={podeLancar} mostrarDia={periodo === 7} mostrarPendentes={false} />
        )}
        {embutido ? null : carregando ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando
          </div>
        ) : porDia.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum trecho {periodo === 1 ? 'hoje' : 'em 7 dias'}
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
      </Corpo>

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
    </Moldura>
  );
}

const URL_ITEM = (id: number) => `https://dev.azure.com/FlagIW/_workitems/edit/${id}`;

interface GrupoTarefa {
  id: number;
  titulo: string;
  trechos: TrechoFechado[];
  lancamentos: Lancamento[];
  total: number;
  pendente: number;
  ultimo: string;
}

/** Lançamentos por tarefa: uma linha por item (recolhida), com link para o DevOps; abre os trechos e os lançamentos. */
function ListaPorTarefa({
  trechos,
  lancamentos,
  mostrarDia,
  onEncurtar,
  onDescartar,
  onRelancar,
  relancando,
}: {
  trechos: TrechoFechado[];
  lancamentos: Lancamento[];
  mostrarDia: boolean;
  onEncurtar: (t: TrechoFechado) => void;
  onDescartar: (t: TrechoFechado) => void;
  onRelancar: (id: string) => void;
  relancando: boolean;
}) {
  const [abertos, setAbertos] = useState<Set<number>>(new Set());
  const grupos = useMemo(() => {
    const m = new Map<number, GrupoTarefa>();
    const pegar = (id: number, titulo: string | null) => {
      let g = m.get(id);
      if (!g) {
        g = { id, titulo: titulo ?? `#${id}`, trechos: [], lancamentos: [], total: 0, pendente: 0, ultimo: '' };
        m.set(id, g);
      }
      return g;
    };
    for (const t of trechos) {
      const g = pegar(t.work_item_id, t.titulo);
      g.trechos.push(t);
      if (!t.descartado) {
        g.total += duracaoSeg(t);
        if (!t.lancamento_id) g.pendente += duracaoSeg(t);
      }
      if (t.encerrado_em > g.ultimo) g.ultimo = t.encerrado_em;
    }
    for (const l of lancamentos) {
      const g = pegar(l.work_item_id, l.titulo);
      g.lancamentos.push(l);
      if (l.criado_em > g.ultimo) g.ultimo = l.criado_em;
    }
    return [...m.values()].sort((a, b) => (a.ultimo < b.ultimo ? 1 : -1));
  }, [trechos, lancamentos]);

  if (grupos.length === 0) return <Vazio>Nada no período</Vazio>;

  const alternar = (id: number) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {grupos.map((g) => {
        const aberto = abertos.has(g.id);
        return (
          <li key={g.id}>
            <div className="flex items-center gap-2 px-2.5 py-2">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                onClick={() => alternar(g.id)}
                aria-expanded={aberto}
              >
                <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-90')} />
                <span className="min-w-0 flex-1 truncate text-sm" title={g.titulo}>
                  <span className="mr-1 font-mono text-[11px] text-muted-foreground">#{g.id}</span>
                  {g.titulo}
                </span>
              </button>
              <span className="shrink-0 text-xs font-semibold tabular-nums">{horas(g.total)}</span>
              {g.pendente >= 60 ? (
                <Pilula tom="alerta" title="Ainda não lançado">
                  falta {horas(g.pendente)}
                </Pilula>
              ) : g.lancamentos.length > 0 ? (
                <Pilula tom="sucesso">lançado</Pilula>
              ) : null}
              <a
                href={URL_ITEM(g.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title={`Abrir #${g.id} no Azure DevOps`}
                aria-label={`Abrir #${g.id} no Azure DevOps`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            {aberto && (
              <div className="space-y-2 border-t border-border bg-muted/30 px-2.5 py-2">
                {g.trechos.length > 0 && (
                  <ul className="divide-y divide-border/60">
                    {g.trechos.map((t) => (
                      <LinhaTrecho
                        key={t.id}
                        t={t}
                        semItem
                        mostrarDia={mostrarDia}
                        onEncurtar={() => onEncurtar(t)}
                        onDescartar={() => onDescartar(t)}
                      />
                    ))}
                  </ul>
                )}
                {g.lancamentos.length > 0 && (
                  <ul className="space-y-1">
                    {g.lancamentos.map((l) => {
                      const s = situacao(l);
                      return (
                        <li key={l.id} className="flex flex-wrap items-center gap-2 text-xs">
                          <Send className="h-3 w-3 text-muted-foreground" />
                          {mostrarDia && <span className="text-muted-foreground">{rotuloDia(l.dia)}</span>}
                          <span className="font-medium tabular-nums">{horas(l.minutos * 60)}</span>
                          <Pilula tom={s === 'conferido' ? 'sucesso' : pedeAtencao(s) ? 'alerta' : 'neutro'}>{ROTULO_SITUACAO[s]}</Pilula>
                          {s === 'erro' && (
                            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" disabled={relancando} onClick={() => onRelancar(l.id)}>
                              <RotateCcw className="mr-1 h-3 w-3" /> Tentar de novo
                            </Button>
                          )}
                          {l.erro && (s === 'erro' || s === 'cancelado') && (
                            <span className="basis-full text-muted-foreground">{l.erro}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function LinhaTrecho({
  t,
  onEncurtar,
  onDescartar,
  semItem = false,
  mostrarDia = false,
}: {
  t: TrechoFechado;
  onEncurtar: () => void;
  onDescartar: () => void;
  /** dentro do grupo da tarefa: sem repetir #id e título */
  semItem?: boolean;
  mostrarDia?: boolean;
}) {
  const corrigido = t.encerrado_original_em && t.encerrado_original_em !== t.encerrado_em;
  const auto = foiAutomatico(t.motivo_fim);
  return (
    <li className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm', t.descartado && 'opacity-60')}>
      <span className={cn('shrink-0 font-mono text-xs tabular-nums', !semItem && 'w-24', t.descartado && 'line-through')}>
        {mostrarDia && semItem ? `${diaCurto(t.iniciado_em)} ` : ''}
        {horaCurta(t.iniciado_em)}–{horaCurta(t.encerrado_em)}
      </span>
      <span className={cn('shrink-0 text-right font-medium tabular-nums', !semItem && 'w-16', t.descartado && 'line-through')}>
        {horas(duracaoSeg(t))}
      </span>
      {semItem ? (
        <span className="flex-1" />
      ) : (
        <span className="min-w-0 flex-1 truncate">
          <span className="mr-1.5 font-mono text-xs text-muted-foreground">#{t.work_item_id}</span>
          {t.titulo}
        </span>
      )}
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
        {t.lancamento_id && (
          <Badge variant="outline" className="border-[hsl(var(--success)/0.4)] text-[hsl(var(--success))]">
            Lançado
          </Badge>
        )}
        {!t.descartado && !t.lancamento_id && (
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
