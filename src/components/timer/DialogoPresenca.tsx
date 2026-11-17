import { UserCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { MotorTimer } from '@/hooks/useTimerRelogio';
import { horaCurta, presencaPerguntarEm, relogio } from '@/lib/timerRelogio';

/**
 * "Ainda está nesta tarefa?" — aparece a cada presenca_seg com o timer
 * rodando. Não fecha por fora (Esc/clique fora): ou confirma, ou pausa. Sem
 * resposta até o prazo, o motor pausa no momento da pergunta (e o servidor
 * faria o mesmo sozinho).
 */
export function DialogoPresenca({ motor }: { motor: MotorTimer }) {
  const { rodandoTodos, referencia, estado, perguntarPresenca, prazoPresencaMs, agoraServidor, acoes } = motor;
  if (!referencia || !estado) return null;

  const restante = prazoPresencaMs != null ? Math.max(0, Math.floor((prazoPresencaMs - agoraServidor) / 1000)) : 0;
  const perguntouEm = presencaPerguntarEm(referencia, estado.regras);
  const varios = rodandoTodos.length > 1;
  const ocupado = acoes.sinal.isPending || acoes.pausar.isPending;

  return (
    <Dialog open={perguntarPresenca} onOpenChange={() => undefined}>
      <DialogContent
        className="sm:max-w-md [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-flag-gold" /> {varios ? 'Ainda está nestas tarefas?' : 'Ainda está nesta tarefa?'}
          </DialogTitle>
          <DialogDescription>
            {varios ? 'Os timers estão rodando em' : 'O timer está rodando em'}{' '}
            {rodandoTodos.map((r, i) => (
              <span key={r.id}>
                {i > 0 && (i === rodandoTodos.length - 1 ? ' e ' : ', ')}
                <span className="font-medium text-foreground">
                  #{r.work_item_id} {r.titulo}
                </span>
              </span>
            ))}
            .
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/40 p-3 text-center">
          <p className="text-xs text-muted-foreground">Tempo para responder</p>
          <p className="font-mono text-2xl font-semibold tabular-nums">{relogio(restante).slice(3)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sem resposta, {varios ? 'todos pausam e contam' : 'o timer pausa e conta'} só até {horaCurta(new Date(perguntouEm).toISOString())}, a hora da pergunta.
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            disabled={ocupado}
            onClick={() =>
              acoes.pausar.mutate({ motivo: 'sem_confirmacao', fim: new Date(perguntouEm).toISOString() })
            }
          >
            Não, parei
          </Button>
          <Button
            disabled={ocupado}
            className="bg-flag-gold text-flag-navy hover:bg-flag-gold/90"
            onClick={() => acoes.sinal.mutate(true)}
          >
            Sim, continuo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
