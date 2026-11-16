import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
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

interface Props {
  alvo: { id: number; titulo: string } | null;
  /** grupos pendentes do item (por dia); null = ainda carregando */
  grupos: GrupoPendente[] | null;
  motor: MotorTimer;
  podeLancar: boolean;
  onFechar: () => void;
}

/**
 * Encerrar = lançar no TimeLog o tempo ainda não lançado do item (um
 * lançamento por dia, como a extensão guarda). A soma é do servidor.
 */
export function DialogoEncerrar({ alvo, grupos, motor, podeLancar, onFechar }: Props) {
  const [notas, setNotas] = useState('');
  const { lancar } = motor.acoes;
  const total = (grupos ?? []).reduce((s, g) => s + g.minutos, 0);

  const enviar = () =>
    grupos &&
    lancar.mutate(
      grupos.map((g) => ({ dia: g.dia, work_item_id: g.work_item_id, notas: notas.trim() || null })),
      {
        onSuccess: () => {
          setNotas('');
          onFechar();
        },
      },
    );

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Encerrar e lançar no TimeLog</DialogTitle>
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
            <Loader2 className="h-4 w-4 animate-spin" /> Somando o que falta lançar…
          </div>
        ) : grupos.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Nada a lançar neste item: o tempo já foi lançado, foi descartado ou ficou abaixo de 1 minuto.
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
              <label htmlFor="timer-notas-encerrar" className="text-sm font-medium">
                No que trabalhou <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <Input
                id="timer-notas-encerrar"
                value={notas}
                maxLength={500}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Vai nas notas do TimeLog"
              />
            </div>
            {!podeLancar && (
              <p className="text-xs text-[hsl(var(--warning))]">
                Sua conta não foi encontrada no Azure DevOps: não dá para lançar no seu nome.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onFechar}>
            Agora não
          </Button>
          <Button
            onClick={enviar}
            disabled={!podeLancar || !grupos || grupos.length === 0 || lancar.isPending}
            className="bg-flag-gold text-flag-navy hover:bg-flag-gold/90"
          >
            {lancar.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            Lançar {total > 0 ? horas(total * 60) : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
