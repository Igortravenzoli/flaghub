import { useState } from 'react';
import { Loader2, Send, Square } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MotorTimer } from '@/hooks/useTimerRelogio';
import { horas } from '@/lib/timerRelogio';
import { rotuloDia, type GrupoPendente } from '@/lib/timerLancamento';

export interface AlvoLancamento {
  id: number;
  titulo: string;
  /** true = Encerrar (lança e fecha a demanda); false = Lançar (a demanda segue aberta) */
  encerrar: boolean;
}

interface Props {
  alvo: AlvoLancamento | null;
  /** grupos pendentes do item (por dia); null = ainda carregando */
  grupos: GrupoPendente[] | null;
  motor: MotorTimer;
  podeLancar: boolean;
  onFechar: () => void;
}

/**
 * Lançar no TimeLog o tempo ainda não lançado do item (um lançamento por dia,
 * como a extensão guarda). Com `encerrar`, depois de lançar tudo a demanda é
 * encerrada e sai do Em espera. A soma é do servidor.
 */
export function DialogoEncerrar({ alvo, grupos, motor, podeLancar, onFechar }: Props) {
  const [notas, setNotas] = useState('');
  const { lancar, encerrarDemanda } = motor.acoes;
  const total = (grupos ?? []).reduce((s, g) => s + g.minutos, 0);
  const ocupado = lancar.isPending || encerrarDemanda.isPending;
  const temPendente = !!grupos && grupos.length > 0;

  const fechar = () => {
    setNotas('');
    onFechar();
  };

  const confirmar = () => {
    if (!alvo || !grupos) return;
    if (!temPendente) {
      if (alvo.encerrar) encerrarDemanda.mutate(alvo.id, { onSuccess: fechar });
      return;
    }
    lancar.mutate(
      grupos.map((g) => ({ dia: g.dia, work_item_id: g.work_item_id, notas: notas.trim() || null })),
      {
        onSuccess: (r) => {
          const tudoLancado = r.resultados.length > 0 && r.resultados.every((x) => x.status === 'lancado');
          if (alvo.encerrar && tudoLancado) encerrarDemanda.mutate(alvo.id, { onSuccess: fechar });
          else if (tudoLancado) fechar();
        },
      },
    );
  };

  const rotuloBotao = !temPendente
    ? 'Encerrar'
    : alvo?.encerrar
      ? `Lançar ${horas(total * 60)} e encerrar`
      : `Lançar ${horas(total * 60)}`;

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{alvo?.encerrar ? 'Encerrar demanda' : 'Lançar no TimeLog'}</DialogTitle>
          <DialogDescription>
            {alvo && (
              <>
                <span className="font-mono text-xs">#{alvo.id}</span> {alvo.titulo}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {grupos === null ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Somando o que falta lançar
          </div>
        ) : !temPendente ? (
          <p className="py-2 text-sm text-muted-foreground">
            {alvo?.encerrar ? 'Nada pendente de lançamento.' : 'Nada pendente de lançamento neste item.'}
          </p>
        ) : (
          <div className="space-y-3">
            <ul className="divide-y rounded-lg border text-sm">
              {grupos.map((g) => (
                <li key={g.chave} className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-muted-foreground">{rotuloDia(g.dia)}</span>
                  <span className="font-medium tabular-nums">{horas(g.minutos * 60)}</span>
                </li>
              ))}
            </ul>
            <div className="space-y-1.5">
              <label htmlFor="timer-notas-lancar" className="text-sm font-medium">
                No que trabalhou <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <Input
                id="timer-notas-lancar"
                value={notas}
                maxLength={500}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Vai nas notas do TimeLog"
              />
            </div>
            {!podeLancar && (
              <p className="text-xs text-[hsl(var(--warning))]">Conta do Azure DevOps não encontrada.</p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={fechar}>
            Agora não
          </Button>
          <Button
            onClick={confirmar}
            disabled={!grupos || ocupado || (temPendente && !podeLancar) || (!temPendente && !alvo?.encerrar)}
            className={alvo?.encerrar ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
          >
            {ocupado ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : alvo?.encerrar ? (
              <Square className="mr-1.5 h-4 w-4" />
            ) : (
              <Send className="mr-1.5 h-4 w-4" />
            )}
            {rotuloBotao}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
