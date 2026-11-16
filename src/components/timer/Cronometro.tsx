import { AlertTriangle, ChevronDown, Clock, ExternalLink, Pause, Play, Repeat, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { TarefaSelecionada } from '@/lib/timerSelecao';
import type { MotorTimer } from '@/hooks/useTimerRelogio';
import { foiAutomatico, horaCurta, horas, relogio, ROTULO_MOTIVO } from '@/lib/timerRelogio';

const DESCONTOS_MIN = [5, 10, 15, 30];

interface Props {
  motor: MotorTimer;
  selecionada: TarefaSelecionada | null;
  onLimparSelecao: () => void;
}

export function Cronometro({ motor, selecionada, onLimparSelecao }: Props) {
  const { estado, rodando, segundos, totalHoje, acoes, carregando, agoraServidor } = motor;
  const regras = estado?.regras;
  const ocupado = acoes.iniciar.isPending || acoes.pausar.isPending;

  const iniciar = (t: TarefaSelecionada) =>
    acoes.iniciar.mutate({
      id: t.id,
      titulo: t.title ?? `#${t.id}`,
      tipo: t.work_item_type ?? 'Task',
      projeto: t.projeto,
    });

  const pausarDescontando = (min: number) =>
    acoes.pausar.mutate({ motivo: 'manual', fim: new Date(agoraServidor - min * 60_000).toISOString() });

  const outraSelecionada = !!rodando && !!selecionada && selecionada.id !== rodando.work_item_id;
  const ultimo = estado?.trechos[0];
  const paradaAutomatica = !rodando && ultimo && foiAutomatico(ultimo.motivo_fim) ? ultimo : null;
  const pctDia = regras ? Math.min(100, (totalHoje / regras.dia_max_seg) * 100) : 0;

  return (
    <Card className={cn(rodando && 'border-flag-gold/60')}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-primary" /> Cronômetro
        </CardTitle>
        <CardDescription>
          {rodando
            ? `Rodando desde ${horaCurta(rodando.iniciado_em)}.`
            : selecionada
              ? 'Pronto para iniciar.'
              : 'Escolha uma tarefa em “Minhas tarefas”.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rodando ? (
          <div className="flex items-start gap-3 rounded-lg border border-flag-gold/50 bg-flag-gold/10 p-3">
            <span className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 animate-pulse rounded-full bg-flag-gold" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-muted-foreground">{rodando.projeto ?? rodando.tipo}</p>
              <p className="truncate font-medium">
                <span className="mr-1.5 font-mono text-xs text-muted-foreground">#{rodando.work_item_id}</span>
                {rodando.titulo}
              </p>
            </div>
          </div>
        ) : selecionada ? (
          <div className="flex items-start gap-3 rounded-lg border border-flag-gold/50 bg-flag-gold/5 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-muted-foreground">{selecionada.caminho ?? selecionada.work_item_type}</p>
              <p className="truncate font-medium">
                <span className="mr-1.5 font-mono text-xs text-muted-foreground">#{selecionada.id}</span>
                {selecionada.title}
              </p>
            </div>
            {selecionada.web_url && (
              <a
                href={selecionada.web_url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title={`Abrir #${selecionada.id} no Azure DevOps`}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onLimparSelecao} title="Limpar a escolha">
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : null}

        <div
          className={cn(
            'flex flex-col items-center justify-center gap-4 rounded-lg border py-6',
            rodando ? 'border-flag-gold/40 bg-flag-gold/5' : 'border-dashed',
          )}
        >
          <span
            className={cn(
              'font-mono text-5xl font-semibold tabular-nums',
              rodando ? 'text-foreground' : 'text-muted-foreground/60',
            )}
            aria-live="off"
          >
            {relogio(segundos)}
          </span>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {rodando ? (
              <>
                <div className="flex">
                  <Button
                    onClick={() => acoes.pausar.mutate({ motivo: 'manual' })}
                    disabled={ocupado}
                    className="rounded-r-none bg-flag-navy text-white hover:bg-flag-navy/90"
                  >
                    <Pause className="mr-1.5 h-4 w-4" /> Pausar
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        disabled={ocupado}
                        className="rounded-l-none border-l border-white/20 bg-flag-navy px-2 text-white hover:bg-flag-navy/90"
                        aria-label="Pausar descontando os últimos minutos"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Parei há um tempo</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {DESCONTOS_MIN.filter((m) => m * 60 < segundos).map((m) => (
                        <DropdownMenuItem key={m} onSelect={() => pausarDescontando(m)}>
                          Pausar e descontar {m} min
                        </DropdownMenuItem>
                      ))}
                      {segundos <= DESCONTOS_MIN[0] * 60 && (
                        <DropdownMenuItem disabled>O trecho ainda é curto</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {outraSelecionada && selecionada && (
                  <Button variant="outline" onClick={() => iniciar(selecionada)} disabled={ocupado}>
                    <Repeat className="mr-1.5 h-4 w-4" /> Trocar para #{selecionada.id}
                  </Button>
                )}
              </>
            ) : (
              <Button
                onClick={() => selecionada && iniciar(selecionada)}
                disabled={!selecionada || ocupado || carregando}
                className="bg-flag-gold text-flag-navy hover:bg-flag-gold/90"
              >
                <Play className="mr-1.5 h-4 w-4" /> Iniciar
              </Button>
            )}
          </div>
        </div>

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
              Com o timer rodando, a cada {Math.round(regras.presenca_seg / 60)} min perguntamos se você segue na tarefa.
              Sem resposta em {Math.round(regras.presenca_tolerancia_seg / 60)} min, o tempo para no momento da pergunta.
              Fechar a aba ou suspender o computador também pausa.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
