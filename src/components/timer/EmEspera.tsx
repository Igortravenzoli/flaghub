import { PauseCircle, Play, Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { horas } from '@/lib/timerRelogio';
import type { DemandaEmEspera } from '@/lib/timerLancamento';
import { Coluna, Pilula, SOMBRA_XS, Vazio } from '@/components/timer/visual';
import { cn } from '@/lib/utils';

interface Props {
  demandas: DemandaEmEspera[];
  ocupado: boolean;
  onRetomar: (d: DemandaEmEspera) => void;
  /** lança o que falta sem encerrar */
  onLancar: (d: DemandaEmEspera) => void;
  /** lança o que falta e encerra a demanda */
  onEncerrar: (d: DemandaEmEspera) => void;
  className?: string;
  /** false no celular: só consulta, sem Retomar */
  podeRetomar?: boolean;
}

/** Em espera: demandas iniciadas e não encerradas, que não estão rodando agora. */
export function EmEspera({ demandas, ocupado, onRetomar, onLancar, onEncerrar, className, podeRetomar = true }: Props) {
  return (
    <Coluna icone={PauseCircle} titulo="Em espera" contagem={demandas.length} className={className}>
      {demandas.length === 0 ? (
        <Vazio>Nada em espera</Vazio>
      ) : (
        <ul className="space-y-2">
          {demandas.map((d) => (
            <li key={d.work_item_id} className={cn('space-y-2 rounded-lg border border-border bg-card p-3', SOMBRA_XS)}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold" title={d.titulo}>
                  {d.titulo}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-mono">#{d.work_item_id}</span> · hoje {horas(d.hojeSeg)}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {d.minutos > 0 ? (
                  <Pilula tom="alerta" title="Tempo marcado e ainda não lançado no TimeLog">
                    falta lançar {horas(d.minutos * 60)}
                  </Pilula>
                ) : (
                  <Pilula tom="sucesso">tudo lançado</Pilula>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {podeRetomar && (
                  <Button size="sm" className="h-7 px-2.5" disabled={ocupado} onClick={() => onRetomar(d)}>
                    <Play className="mr-1 h-3.5 w-3.5" /> Retomar
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className={cn('h-7 px-2.5', SOMBRA_XS)}
                  disabled={ocupado || d.minutos === 0}
                  onClick={() => onLancar(d)}
                  title="Lança o que falta sem encerrar a demanda"
                >
                  <Send className="mr-1 h-3.5 w-3.5" /> Lançar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={ocupado}
                  onClick={() => onEncerrar(d)}
                  title="Lança o que falta e encerra a demanda"
                >
                  <Square className="mr-1 h-3.5 w-3.5" /> Encerrar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Coluna>
  );
}
