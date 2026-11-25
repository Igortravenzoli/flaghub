import { PauseCircle, Play, Send, Square } from 'lucide-react';
import { horas } from '@/lib/timerRelogio';
import type { DemandaEmEspera } from '@/lib/timerLancamento';
import { urlWorkItem } from '@/lib/timerSelecao';
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
            // Cartão em duas faixas (pedido do Igor, 25/11/2026): o título com a
            // largura toda e, embaixo, número + selo à esquerda e os botões à
            // direita. A fileira só de botões saiu: cabe mais demanda na coluna.
            <li key={d.work_item_id} className={cn('space-y-1.5 rounded-lg border border-border bg-card px-3 py-2.5', SOMBRA_XS)}>
              <p className="truncate text-sm font-semibold" title={d.titulo}>
                {d.titulo}
              </p>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-xs text-muted-foreground">
                    <a
                      href={urlWorkItem(d.work_item_id, d.projeto)}
                      target="_blank"
                      rel="noreferrer"
                      title={`Abrir #${d.work_item_id} no Azure DevOps`}
                      className="font-mono underline-offset-2 hover:text-foreground hover:underline focus-visible:underline"
                    >
                      #{d.work_item_id}
                    </a>{' '}
                    · hoje {horas(d.hojeSeg)}
                  </p>
                  {d.minutos > 0 ? (
                    <Pilula tom="alerta" title="Tempo marcado e ainda não lançado no TimeLog">
                      falta lançar {horas(d.minutos * 60)}
                    </Pilula>
                  ) : (
                    <Pilula tom="sucesso">tudo lançado</Pilula>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
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
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Coluna>
  );
}
