import { PauseCircle, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { horas } from '@/lib/timerRelogio';
import { rotuloDia, type DemandaEmEspera } from '@/lib/timerLancamento';
import { Coluna, SOMBRA_XS, Vazio } from '@/components/timer/visual';
import { cn } from '@/lib/utils';

interface Props {
  demandas: DemandaEmEspera[];
  ocupado: boolean;
  onRetomar: (d: DemandaEmEspera) => void;
  onEncerrar: (d: DemandaEmEspera) => void;
  className?: string;
}

/** Em espera: tempo marcado e ainda não lançado, por item. Retomar ou Encerrar (lançar). */
export function EmEspera({ demandas, ocupado, onRetomar, onEncerrar, className }: Props) {
  return (
    <Coluna icone={PauseCircle} titulo="Em espera" contagem={demandas.length} className={className}>
      {demandas.length === 0 ? (
        <Vazio>Nada em espera</Vazio>
      ) : (
        <ul className="space-y-2">
          {demandas.map((d) => {
            const dias = d.grupos.map((g) => g.dia);
            return (
              <li key={d.work_item_id} className={cn('space-y-3 rounded-lg border border-border bg-card p-3', SOMBRA_XS)}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" title={d.titulo}>
                    {d.titulo}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">#{d.work_item_id}</span>
                    {dias.length > 1 ? ` · ${dias.length} dias` : ` · ${rotuloDia(dias[0])}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-semibold tabular-nums">{horas(d.minutos * 60)}</span>
                  <Button size="sm" className="ml-auto h-8" disabled={ocupado} onClick={() => onRetomar(d)}>
                    <Play className="mr-1 h-3.5 w-3.5" /> Retomar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn('h-8', SOMBRA_XS)}
                    disabled={ocupado}
                    onClick={() => onEncerrar(d)}
                  >
                    Encerrar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Coluna>
  );
}
