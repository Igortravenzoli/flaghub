import { useState } from 'react';
import { AlertTriangle, ChevronDown, Pause, PlayCircle, Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { MotorTimer } from '@/hooks/useTimerRelogio';
import { foiAutomatico, horaCurta, horas, relogio, ROTULO_MOTIVO } from '@/lib/timerRelogio';
import { diaSP, lancadoHojeSeg } from '@/lib/timerLancamento';
import { BotaoIcone, Coluna, Pilula, SOMBRA_XS } from '@/components/timer/visual';
import { TrechosDoDia } from '@/components/timer/TrechosDoDia';
import { MiniTimer } from '@/components/timer/MiniTimer';

const DESCONTOS_MIN = [5, 10, 15, 30];

interface Props {
  motor: MotorTimer;
  podeLancar: boolean;
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

/** Em andamento: contadores do dia, o timer rodando (um por vez) e os lançamentos recolhidos. */
export function Cronometro({ motor, podeLancar, onLancar, onEncerrar, className }: Props) {
  const { estado, rodando, segundos, segundosTrecho, totalHoje, acoes, agoraServidor } = motor;
  const regras = estado?.regras;
  const ocupado = acoes.iniciar.isPending || acoes.pausar.isPending || acoes.partir.isPending;
  const [verLancamentos, setVerLancamentos] = useState(false);

  const pausarDescontando = (min: number) =>
    acoes.pausar.mutate({ motivo: 'manual', fim: new Date(agoraServidor - min * 60_000).toISOString() });

  const ultimo = estado?.trechos[0];
  const paradaAutomatica = !rodando && ultimo && foiAutomatico(ultimo.motivo_fim) ? ultimo : null;
  const pctDia = regras ? Math.min(100, (totalHoje / regras.dia_max_seg) * 100) : 0;
  const hoje = diaSP(estado?.agora ?? new Date().toISOString());
  const lancado = lancadoHojeSeg(estado?.trechos ?? [], hoje);
  const item = rodando ? { id: rodando.work_item_id, titulo: rodando.titulo } : null;

  return (
    <Coluna
      icone={PlayCircle}
      titulo="Em andamento"
      destaque={!!rodando}
      className={className}
      acoes={
        <>
          <MiniTimer motor={motor} />
          <Pilula tom={rodando ? 'sucesso' : 'neutro'}>{rodando ? '1 ativo' : 'parado'}</Pilula>
        </>
      }
      corpoClassName="space-y-3"
    >
      {/* contadores do dia: um timer por vez, então acumulado = tempo real trabalhado */}
      <div className="grid grid-cols-3 gap-1.5">
        <Contador rotulo="Hoje acumulado" valor={horas(totalHoje)} />
        <Contador rotulo="Lançado" valor={horas(lancado)} />
        <Contador rotulo="Rodando agora" valor={rodando ? relogio(segundos) : '0'} />
      </div>

      {rodando && item ? (
        <div className={cn('space-y-2 rounded-lg border border-flag-gold/50 bg-flag-gold/5 p-3', SOMBRA_XS)}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold" title={rodando.titulo}>
                {rodando.titulo}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">#{rodando.work_item_id}</span> · acumulado hoje
              </p>
            </div>
            <span className="shrink-0 font-mono text-xl font-semibold tabular-nums" aria-live="off">
              {relogio(segundos)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Pausar: um botão só; o menu oferece pausar agora ou descontar os últimos minutos */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  disabled={ocupado}
                  className={cn('h-8 w-8 bg-card', SOMBRA_XS)}
                  aria-label="Pausar"
                  title="Pausar"
                >
                  <Pause className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem onSelect={() => acoes.pausar.mutate({ motivo: 'manual' })}>
                  <Pause className="mr-2 h-4 w-4" /> Pausar agora
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Parei antes e esqueci de pausar
                </DropdownMenuLabel>
                {DESCONTOS_MIN.filter((m) => m * 60 < segundosTrecho).map((m) => (
                  <DropdownMenuItem key={m} onSelect={() => pausarDescontando(m)}>
                    Pausar há {m} min
                  </DropdownMenuItem>
                ))}
                {segundosTrecho <= DESCONTOS_MIN[0] * 60 && (
                  <DropdownMenuItem disabled>Trecho ainda curto</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <BotaoIcone
              icone={Send}
              rotulo="Lançar até agora (o timer continua)"
              disabled={ocupado || !podeLancar}
              onClick={() => onLancar(item)}
            />
            <BotaoIcone
              icone={Square}
              rotulo="Encerrar demanda"
              variante="destructive"
              disabled={ocupado}
              onClick={() => onEncerrar(item)}
              className={SOMBRA_XS}
            />
          </div>
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
