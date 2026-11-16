import { PauseCircle, Play, Send, Square } from 'lucide-react';
import { horas } from '@/lib/timerRelogio';
import type { DemandaEmEspera } from '@/lib/timerLancamento';
import { BotaoIcone, Coluna, Pilula, SOMBRA_XS, Vazio } from '@/components/timer/visual';
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
              <div className="flex items-center gap-1.5">
                {podeRetomar && (
                  <BotaoIcone icone={Play} rotulo="Retomar" variante="default" disabled={ocupado} onClick={() => onRetomar(d)} />
                )}
                <BotaoIcone
                  icone={Send}
                  rotulo="Lançar o que falta (a demanda continua)"
                  disabled={ocupado || d.minutos === 0}
                  onClick={() => onLancar(d)}
                />
                <BotaoIcone
                  icone={Square}
                  rotulo="Encerrar demanda"
                  variante="ghost"
                  disabled={ocupado}
                  onClick={() => onEncerrar(d)}
                  className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Coluna>
  );
}
