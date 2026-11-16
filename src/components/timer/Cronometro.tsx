import { AlertTriangle, ChevronDown, PlayCircle, Pause, Square } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

const DESCONTOS_MIN = [5, 10, 15, 30];

interface Props {
  motor: MotorTimer;
  /** Encerrar: pausa e abre o lançamento no TimeLog do item */
  onEncerrar: (item: { id: number; titulo: string }) => void;
}

/** Em andamento: o timer rodando (um por vez), com Pausar e Encerrar. */
export function Cronometro({ motor, onEncerrar }: Props) {
  const { estado, rodando, segundos, totalHoje, acoes, agoraServidor } = motor;
  const regras = estado?.regras;
  const ocupado = acoes.iniciar.isPending || acoes.pausar.isPending;

  const pausarDescontando = (min: number) =>
    acoes.pausar.mutate({ motivo: 'manual', fim: new Date(agoraServidor - min * 60_000).toISOString() });

  const ultimo = estado?.trechos[0];
  const paradaAutomatica = !rodando && ultimo && foiAutomatico(ultimo.motivo_fim) ? ultimo : null;
  const pctDia = regras ? Math.min(100, (totalHoje / regras.dia_max_seg) * 100) : 0;

  return (
    <Card className={cn('h-full', rodando && 'border-flag-gold/60')}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PlayCircle className="h-4 w-4 text-primary" /> Em andamento
          <Badge
            className={cn(
              'ml-auto',
              rodando ? 'bg-[hsl(var(--success))] text-white hover:bg-[hsl(var(--success))]' : 'bg-muted text-muted-foreground hover:bg-muted',
            )}
          >
            {rodando ? '1 ativo' : 'parado'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rodando ? (
          <div className="space-y-3 rounded-lg border border-flag-gold/50 bg-flag-gold/5 p-3">
            <div className="min-w-0">
              <p className="truncate font-semibold" title={rodando.titulo}>
                {rodando.titulo}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">#{rodando.work_item_id}</span>
                {rodando.projeto ? ` · ${rodando.projeto}` : ''} · desde {horaCurta(rodando.iniciado_em)}
              </p>
            </div>
            <p className="font-mono text-4xl font-semibold tabular-nums" aria-live="off">
              {relogio(segundos)}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex">
                <Button
                  variant="outline"
                  onClick={() => acoes.pausar.mutate({ motivo: 'manual' })}
                  disabled={ocupado}
                  className="flex-1 rounded-r-none"
                >
                  <Pause className="mr-1.5 h-4 w-4" /> Pausar
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={ocupado}
                      className="rounded-l-none border-l-0 px-2"
                      aria-label="Pausar descontando os últimos minutos"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Parei há um tempo</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {DESCONTOS_MIN.filter((m) => m * 60 < segundos).map((m) => (
                      <DropdownMenuItem key={m} onSelect={() => pausarDescontando(m)}>
                        Pausar e descontar {m} min
                      </DropdownMenuItem>
                    ))}
                    {segundos <= DESCONTOS_MIN[0] * 60 && <DropdownMenuItem disabled>O trecho ainda é curto</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Button
                onClick={() => onEncerrar({ id: rodando.work_item_id, titulo: rodando.titulo })}
                disabled={ocupado}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <Square className="mr-1.5 h-4 w-4" /> Encerrar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-6 text-center">
            <span className="font-mono text-4xl font-semibold tabular-nums text-muted-foreground/50">00:00:00</span>
            <p className="px-4 text-xs text-muted-foreground">
              Dê play numa task atribuída, numa anotação ou retome uma em espera.
            </p>
          </div>
        )}

        {paradaAutomatica && (
          <div className="flex items-start gap-2 rounded-lg border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.1)] p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--warning))]" />
            <span>
              O timer parou sozinho às {horaCurta(paradaAutomatica.encerrado_em)} em #{paradaAutomatica.work_item_id}:{' '}
              {ROTULO_MOTIVO[paradaAutomatica.motivo_fim].toLowerCase()}. O tempo depois disso não foi contado.
            </span>
          </div>
        )}

        {regras && (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Hoje</span>
              <span className="font-medium tabular-nums">
                {horas(totalHoje)} <span className="text-muted-foreground">de {horas(regras.dia_max_seg)}</span>
              </span>
            </div>
            <Progress value={pctDia} className="h-2" />
            <p className="text-xs text-muted-foreground">
              Rodando, a cada {Math.round(regras.presenca_seg / 60)} min o Timer pergunta se você segue na tarefa. Sem
              resposta em {Math.round(regras.presenca_tolerancia_seg / 60)} min, o tempo para no momento da pergunta. Fechar
              a aba ou suspender o computador também pausa.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
