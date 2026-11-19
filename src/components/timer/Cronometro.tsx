import { useState } from 'react';
import { AlertTriangle, ChevronDown, Pause, PlayCircle, Send, Split, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { MotorTimer } from '@/hooks/useTimerRelogio';
import {
  CAPACIDADE_DIA_SEG,
  capacidadeDia,
  duracaoSeg,
  foiAutomatico,
  horaCurta,
  horas,
  relogio,
  ROTULO_MOTIVO,
  type TrechoRodando,
} from '@/lib/timerRelogio';
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
  /** "Timer em Reunião": a call sem PBI/Task vira Task e o timer começa */
  onReuniao?: () => void;
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
export function Cronometro({ motor, podeLancar, paralelo, onParalelo, onReuniao, onLancar, onEncerrar, className }: Props) {
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
  const capacidade = capacidadeDia(totalHoje);
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
          {/* Timer em Reunião em miniatura, ao lado do mini timer (pedido do Igor, 18/11/2026).
              Os três ícones um pouco mais justos para o título caber. */}
          <span className="flex items-center [&>button]:h-7 [&>button]:w-7">
            {onReuniao && !motor.somenteConsulta && <BotaoRec onClick={onReuniao} />}
            <MiniTimer motor={motor} />
            <ChaveParalelo ligado={paralelo} maximo={regras?.paralelo_max ?? 3} onMudar={onParalelo} />
          </span>
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

      {paradaAutomatica && (
        <div className="flex items-start gap-2 rounded-lg border border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.1)] p-2.5 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--warning))]" />
          <span>
            Parou sozinho às {horaCurta(paradaAutomatica.encerrado_em)} (#{paradaAutomatica.work_item_id}):{' '}
            {ROTULO_MOTIVO[paradaAutomatica.motivo_fim].toLowerCase()}
          </span>
        </div>
      )}

      {/* Capacidade do dia (decisão do Igor, 17/11/2026): só indicação, 7 h.
          Verde até 7 h; passando, amarela até ficar vermelha. O teto de 12 h
          segue valendo no servidor, mas saiu da tela. */}
      <div className="space-y-1">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">Capacidade do dia</span>
          <span className="tabular-nums">
            {horas(totalHoje)} <span className="text-muted-foreground">/ {horas(CAPACIDADE_DIA_SEG)}</span>
          </span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-label="Capacidade do dia (7 h)"
          aria-valuemin={0}
          aria-valuemax={CAPACIDADE_DIA_SEG}
          aria-valuenow={Math.round(totalHoje)}
        >
          <div className="h-full rounded-full transition-all" style={{ width: `${capacidade.pct}%`, backgroundColor: capacidade.cor }} />
        </div>
      </div>

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

/**
 * Liga/desliga do Paralelo, ao lado do mini timer (decisão do Igor,
 * 17/11/2026): só o ícone, ligado por padrão; a explicação vem na dica. A hora
 * sobreposta conta inteira em cada tarefa; a capacidade do dia soma todas.
 */
/** "Timer em Reunião" só com o ícone de gravar (bolinha vermelha), do tamanho do botão do mini timer. */
function BotaoRec({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" size="icon" variant="ghost" aria-label="Timer em Reunião" onClick={onClick} className="h-8 w-8">
          <span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-red-500/70" aria-hidden>
            <span className="h-2 w-2 rounded-full bg-red-500" />
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[16rem]">
        <span className="font-semibold">Timer em Reunião:</span> a call sem PBI nem Task vira hora lançável e o timer começa agora.
      </TooltipContent>
    </Tooltip>
  );
}

function ChaveParalelo({ ligado, maximo, onMudar }: { ligado: boolean; maximo: number; onMudar: (v: boolean) => void }) {
  const dica = ligado
    ? `Paralelo ligado: iniciar outra demanda mantém as que rodam (até ${maximo}). Cada uma conta a hora inteira.`
    : 'Paralelo desligado: iniciar outra demanda pausa a que está rodando.';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Atividades em paralelo"
          aria-pressed={ligado}
          onClick={() => onMudar(!ligado)}
          className={cn(
            'h-8 w-8',
            // mesmo tamanho e estilo do botão do mini timer: sem fundo; ligado = ícone dourado
            ligado ? 'text-flag-gold hover:text-flag-gold' : 'text-muted-foreground/60',
          )}
        >
          <Split className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[16rem]">{dica}</TooltipContent>
    </Tooltip>
  );
}
