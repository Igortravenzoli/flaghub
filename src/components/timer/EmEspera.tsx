import { PauseCircle, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { horas } from '@/lib/timerRelogio';
import { rotuloDia, type DemandaEmEspera } from '@/lib/timerLancamento';

interface Props {
  demandas: DemandaEmEspera[];
  ocupado: boolean;
  onRetomar: (d: DemandaEmEspera) => void;
  onEncerrar: (d: DemandaEmEspera) => void;
}

/** Em espera: tempo marcado e ainda não lançado, por item. Retomar ou Encerrar (lançar). */
export function EmEspera({ demandas, ocupado, onRetomar, onEncerrar }: Props) {
  return (
    <section className="space-y-2" aria-labelledby="timer-em-espera">
      <h3 id="timer-em-espera" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
        <PauseCircle className="h-4 w-4 text-[hsl(var(--warning))]" /> Em espera
        <Badge variant="outline" className="h-5 border-[hsl(var(--warning)/0.5)] px-1.5 text-[11px]">
          {demandas.length}
        </Badge>
      </h3>
      {demandas.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          Nada em espera. O que você pausar e ainda não lançou aparece aqui.
        </p>
      ) : (
        <ul className="space-y-2">
          {demandas.map((d) => {
            const dias = d.grupos.map((g) => g.dia);
            return (
              <li key={d.work_item_id} className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium" title={d.titulo}>
                    {d.titulo}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">#{d.work_item_id}</span>
                    {d.projeto ? ` · ${d.projeto}` : ''}
                    {dias.length > 1 ? ` · ${dias.length} dias` : ` · ${rotuloDia(dias[0])}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold tabular-nums">{horas(d.minutos * 60)}</span>
                  <Button
                    size="sm"
                    className="ml-auto h-8 bg-[hsl(var(--success))] text-white hover:bg-[hsl(var(--success)/0.9)]"
                    disabled={ocupado}
                    onClick={() => onRetomar(d)}
                  >
                    <Play className="mr-1 h-3.5 w-3.5" /> Retomar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" disabled={ocupado} onClick={() => onEncerrar(d)}>
                    Encerrar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
