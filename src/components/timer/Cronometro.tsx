import { useState } from 'react';
import { AlertTriangle, ChevronDown, Pause, PlayCircle, Send, Square } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { MotorTimer } from '@/hooks/useTimerRelogio';
import { duracaoSeg, foiAutomatico, horaCurta, horas, relogio, ROTULO_MOTIVO, type TrechoRodando } from '@/lib/timerRelogio';
import { diaSP, lancadoHojeSeg } from '@/lib/timerLancamento';
import { BotaoIcone, Coluna, Pilula, SOMBRA_XS } from '@/components/timer/visual';
import { TrechosDoDia } from '@/components/timer/TrechosDoDia';
import { MiniTimer } from '@/components/timer/MiniTimer';

interface Props {
  motor: MotorTimer;
  podeLancar: boolean;
  /** TM9: ligado, iniciar outra demanda não pausa as que rodam */
  paralelo: boolean;
  onParalelo: (v: boolean) => void;
  /** Lançar: corta o trecho agora e lança o que falta, sem encerrar */
  onLancar: (item: { id: number; titulo: string }) => void;
  /** Encerrar: pausa, lança o que falta e encerra a demanda */
  onEncerrar: (item: { id: number; titulo: string }) => void;
  className?: string;
}

function Contador({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background px-2.5 py-1.5">
      <p className="truncate text-[11px] text-muted-foreground">{rotulo}</p>
      <p className={cn('truncate font-mono text-sm font-semibold tabular-nums', !destaque && 'text-foreground')}>{valor}</p>
    </div>
  );
}

/**
 * Em andamento: contadores do dia, os timers rodando (um cartão por tarefa;
 * com o Paralelo ligado podem ser vários) e os lançamentos recolhidos.
 */
export function Cronometro({ motor, podeLancar, paralelo, onParalelo, onLancar, onEncerrar, className }: Props) {
  const { estado, rodandoTodos, segundosDe, totalHoje, acoes } = motor;
  const regras = estado?.regras;
  const ocupado = acoes.iniciar.isPending || acoes.pausar.isPending || acoes.partir.isPending;
  const [verLancamentos, setVerLancamentos] = useState(false);
  const n = rodandoTodos.length;

  const ultimo = estado?.trechos[0];
  const paradaAutomatica =
    ultimo && foiAutomatico(ultimo.motivo_fim) && !rodandoTodos.some((r) => r.work_item_id === ultimo.work_item_id)
      ? ultimo
      : null;
  const pctDia = regras ? Math.min(100, (totalHoje / regras.dia_max_seg) * 100) : 0;
  const hoje = diaSP(estado?.agora ?? new Date().toISOString());
  const lancado = lancadoHojeSeg(estado?.trechos ?? [], hoje);
  // tudo o que ainda não foi para o TimeLog hoje (todas as tarefas + o trecho rodando)
  const aLancar =
    (estado?.trechos ?? [])
      .filter((t) => diaSP(t.iniciado_em) === hoje && !t.descartado && !t.lancamento_id)
      .reduce((s, t) => s + duracaoSeg(t), 0) + motor.segundosRodandoTodos;

  return (
    <Coluna
      icone={PlayCircle}
      titulo="Em andamento"
      destaque={n > 0}
      className={className}
      acoes={
        <>
          <MiniTimer motor={motor} />
          <Pilula tom={n > 0 ? 'sucesso' : 'neutro'}>{n === 0 ? 'parado' : n === 1 ? '1 ativo' : `${n} ativos`}</Pilula>
        </>
      }
      corpoClassName="space-y-3"
    >
      {/* contadores do dia: um timer por vez, então acumulado = tempo real trabalhado */}
      <div className="grid grid-cols-3 gap-1.5">
        <Contador rotulo="Hoje acumulado" valor={horas(totalHoje)} />
        <Contador rotulo="Lançado" valor={horas(lancado)} />
        <Contador rotulo="A lançar" valor={horas(aLancar)} />
      </div>

      {n > 0 ? (
        <div className="space-y-2">
          {rodandoTodos.map((r) => (
            <CartaoRodando
              key={r.id}
              rodando={r}
              segundos={segundosDe(r)}
              compacto={n > 1}
              ocupado={ocupado}
              podeLancar={podeLancar}
              onPausar={() => acoes.pausar.mutate({ motivo: 'manual', workItemId: r.work_item_id })}
              onLancar={() => onLancar({ id: r.work_item_id, titulo: r.titulo })}
              onEncerrar={() => onEncerrar({ id: r.work_item_id, titulo: r.titulo })}
            />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-dashed border-border px-3 py-2.5">
          <span className="text-sm text-muted-foreground">Nada rodando</span>
          <span className="font-mono text-xl font-semibold tabular-nums text-muted-foreground/50">00:00:00</span>
        </div>
      )}

      {/* Paralelo (decisão do Igor, 17/11/2026): a hora sobreposta conta inteira
          em cada tarefa; o teto de 12 h do dia soma todas. */}
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2">
        <Switch checked={paralelo} onCheckedChange={onParalelo} className="mt-0.5" aria-label="Rodar em paralelo" />
        <span className="min-w-0 text-xs leading-snug">
          <span className="font-medium">Paralelo</span>
          <span className="block text-muted-foreground">
            {paralelo
              ? `Iniciar outra demanda mantém as que rodam (até ${regras?.paralelo_max ?? 3}). Cada uma conta a hora inteira.`
              : 'Desligado: iniciar outra demanda pausa a que está rodando.'}
          </span>
        </span>
      </label>

      {paradaAutomatica && (
        <div className="flex items-start gap-2 rounded-lg border border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.1)] p-2.5 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--warning))]" />
          <span>
            Parou sozinho às {horaCurta(paradaAutomatica.encerrado_em)} (#{paradaAutomatica.work_item_id}):{' '}
            {ROTULO_MOTIVO[paradaAutomatica.motivo_fim].toLowerCase()}
          </span>
        </div>
      )}

      {regras && (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">Teto do dia</span>
            <span className="tabular-nums">
              {horas(totalHoje)} <span className="text-muted-foreground">/ {horas(regras.dia_max_seg)}</span>
            </span>
          </div>
          <Progress value={pctDia} className="h-1.5" />
        </div>
      )}

      <div className="border-t border-border pt-2">
        <button
          type="button"
          className="flex w-full items-center justify-between py-1 text-sm font-semibold"
          onClick={() => setVerLancamentos((v) => !v)}
          aria-expanded={verLancamentos}
        >
          Lançamentos
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', verLancamentos && 'rotate-180')} />
        </button>
        {verLancamentos && (
          <div className="pt-2">
            <TrechosDoDia motor={motor} podeLancar={podeLancar} embutido />
          </div>
        )}
      </div>
    </Coluna>
  );
}

/** Um timer rodando: título, relógio da tarefa (a lançar hoje) e as ações dela. */
function CartaoRodando({
  rodando,
  segundos,
  compacto,
  ocupado,
  podeLancar,
  onPausar,
  onLancar,
  onEncerrar,
}: {
  rodando: TrechoRodando;
  segundos: number;
  compacto: boolean;
  ocupado: boolean;
  podeLancar: boolean;
  onPausar: () => void;
  onLancar: () => void;
  onEncerrar: () => void;
}) {
  return (
    <div className={cn('space-y-2 rounded-lg border border-flag-gold/50 bg-flag-gold/5', compacto ? 'p-2.5' : 'p-3', SOMBRA_XS)}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={rodando.titulo}>
            {rodando.titulo}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-mono">#{rodando.work_item_id}</span> · a lançar
          </p>
        </div>
        <span className={cn('shrink-0 font-mono font-semibold tabular-nums', compacto ? 'text-base' : 'text-xl')} aria-live="off">
          {relogio(segundos)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {/* Pausar: um clique, pausa na hora (decisão do Igor, 17/11/2026: sem menu).
            Trecho esquecido rodando se acerta depois em Lançamentos (encurtar). */}
        <BotaoIcone icone={Pause} rotulo="Pausar" disabled={ocupado} onClick={onPausar} />
        <BotaoIcone icone={Send} rotulo="Lançar até agora (o timer continua)" disabled={ocupado || !podeLancar} onClick={onLancar} />
        <BotaoIcone
          icone={Square}
          rotulo="Encerrar demanda"
          variante="destructive"
          disabled={ocupado}
          onClick={onEncerrar}
          className={SOMBRA_XS}
        />
      </div>
    </div>
  );
}
