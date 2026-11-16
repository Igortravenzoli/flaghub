import { AlertTriangle, ChevronDown, Pause, PlayCircle, Square } from 'lucide-react';
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
import { Coluna, Pilula, SOMBRA_XS } from '@/components/timer/visual';

const DESCONTOS_MIN = [5, 10, 15, 30];

interface Props {
  motor: MotorTimer;
  /** Encerrar: pausa e abre o lançamento no TimeLog do item */
  onEncerrar: (item: { id: number; titulo: string }) => void;
  className?: string;
}

/** Em andamento: o timer rodando (um por vez), com Pausar e Encerrar. */
export function Cronometro({ motor, onEncerrar, className }: Props) {
  const { estado, rodando, segundos, totalHoje, acoes, agoraServidor } = motor;
  const regras = estado?.regras;
  const ocupado = acoes.iniciar.isPending || acoes.pausar.isPending;

  const pausarDescontando = (min: number) =>
    acoes.pausar.mutate({ motivo: 'manual', fim: new Date(agoraServidor - min * 60_000).toISOString() });

  const ultimo = estado?.trechos[0];
  const paradaAutomatica = !rodando && ultimo && foiAutomatico(ultimo.motivo_fim) ? ultimo : null;
  const pctDia = regras ? Math.min(100, (totalHoje / regras.dia_max_seg) * 100) : 0;

  return (
    <Coluna
      icone={PlayCircle}
      titulo="Em andamento"
      destaque={!!rodando}
      className={className}
      acoes={<Pilula tom={rodando ? 'sucesso' : 'neutro'}>{rodando ? '1 ativo' : 'parado'}</Pilula>}
      corpoClassName="space-y-4"
    >
      {rodando ? (
        <div className={cn('space-y-4 rounded-lg border border-flag-gold/50 bg-flag-gold/5 p-4', SOMBRA_XS)}>
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-semibold" title={rodando.titulo}>
              {rodando.titulo}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              <span className="font-mono">#{rodando.work_item_id}</span> · desde {horaCurta(rodando.iniciado_em)}
            </p>
          </div>
          <p className="font-mono text-4xl font-semibold tracking-tight tabular-nums" aria-live="off">
            {relogio(segundos)}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex">
              <Button
                variant="outline"
                onClick={() => acoes.pausar.mutate({ motivo: 'manual' })}
                disabled={ocupado}
                className={cn('flex-1 rounded-r-none bg-card', SOMBRA_XS)}
              >
                <Pause className="mr-1.5 h-4 w-4" /> Pausar
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={ocupado}
                    className={cn('rounded-l-none border-l-0 bg-card px-2', SOMBRA_XS)}
                    aria-label="Pausar descontando os últimos minutos"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Parei há</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {DESCONTOS_MIN.filter((m) => m * 60 < segundos).map((m) => (
                    <DropdownMenuItem key={m} onSelect={() => pausarDescontando(m)}>
                      {m} min
                    </DropdownMenuItem>
                  ))}
                  {segundos <= DESCONTOS_MIN[0] * 60 && <DropdownMenuItem disabled>Trecho curto</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Button
              variant="destructive"
              onClick={() => onEncerrar({ id: rodando.work_item_id, titulo: rodando.titulo })}
              disabled={ocupado}
              className={SOMBRA_XS}
            >
              <Square className="mr-1.5 h-4 w-4" /> Encerrar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border py-8">
          <span className="font-mono text-4xl font-semibold tracking-tight tabular-nums text-muted-foreground/50">
            00:00:00
          </span>
          <span className="text-sm text-muted-foreground">Nada rodando</span>
        </div>
      )}

      {paradaAutomatica && (
        <div className="flex items-start gap-2 rounded-lg border border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.1)] p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
          <span>
            Parou sozinho às {horaCurta(paradaAutomatica.encerrado_em)} (#{paradaAutomatica.work_item_id}):{' '}
            {ROTULO_MOTIVO[paradaAutomatica.motivo_fim].toLowerCase()}
          </span>
        </div>
      )}

      {regras && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Hoje</span>
            <span className="font-semibold tabular-nums">
              {horas(totalHoje)} <span className="font-normal text-muted-foreground">/ {horas(regras.dia_max_seg)}</span>
            </span>
          </div>
          <Progress value={pctDia} className="h-1.5" />
        </div>
      )}
    </Coluna>
  );
}
