import { useState } from 'react';
import { BellRing, UserCheck } from 'lucide-react';
import { pedirPermissaoDoAviso, permissaoDoAviso } from '@/lib/timerAtencao';
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
 * As duas perguntas que seguram o timer, na janela completa (com a janela
 * minimizada, o app desktop a traz para a frente — no mini não dá para ler):
 *
 * - "Você está aí?": 10 min sem uso do computador. Espera 5 min pelo clique;
 *   sem resposta, pausa e conta só até o início da inatividade (decisão do
 *   Igor, 18/11/2026).
 * - "Ainda está nesta tarefa?": a cada presenca_seg com o timer rodando. Sem
 *   resposta até o prazo, pausa no momento da pergunta (o servidor faria o
 *   mesmo sozinho).
 *
 * Não fecha por fora (Esc/clique fora): ou confirma, ou pausa.
 */
export function DialogoPresenca({ motor }: { motor: MotorTimer }) {
  const { rodandoTodos, referencia, estado, perguntarPresenca, prazoPresencaMs, agoraServidor, acoes, ausencia } = motor;
  const [permissao, setPermissao] = useState(permissaoDoAviso);
  if (!referencia || !estado) return null;

  const varios = rodandoTodos.length > 1;
  const ocupado = acoes.sinal.isPending || acoes.pausar.isPending;

  // A ausência vem primeiro: ela é a mais urgente (o prazo é curto).
  const porAusencia = !!ausencia;
  const perguntouEm = presencaPerguntarEm(referencia, estado.regras);
  const agoraLocal = agoraServidor - estado.desvioMs;
  const restante = porAusencia
    ? Math.max(0, Math.floor((ausencia.prazoMs - agoraLocal) / 1000))
    : prazoPresencaMs != null
      ? Math.max(0, Math.floor((prazoPresencaMs - agoraServidor) / 1000))
      : 0;
  const contaAte = porAusencia
    ? new Date(ausencia.desdeMs + estado.desvioMs).toISOString()
    : new Date(perguntouEm).toISOString();
  const aberto = porAusencia || perguntarPresenca;

  const tarefas = (
    <>
      {rodandoTodos.map((r, i) => (
        <span key={r.id}>
          {i > 0 && (i === rodandoTodos.length - 1 ? ' e ' : ', ')}
          <span className="font-medium text-foreground">
            #{r.work_item_id} {r.titulo}
          </span>
        </span>
      ))}
    </>
  );

  return (
    <Dialog open={aberto} onOpenChange={() => undefined}>
      <DialogContent
        className="sm:max-w-md [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-flag-gold" />
            {porAusencia ? 'Você está aí?' : varios ? 'Ainda está nestas tarefas?' : 'Ainda está nesta tarefa?'}
          </DialogTitle>
          <DialogDescription>
            {porAusencia ? (
              <>
                O computador está sem uso desde {horaCurta(contaAte)}. {varios ? 'Os timers seguem' : 'O timer segue'}{' '}
                rodando em {tarefas}.
              </>
            ) : (
              <>
                {varios ? 'Os timers estão rodando em' : 'O timer está rodando em'} {tarefas}.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/40 p-3 text-center">
          <p className="text-xs text-muted-foreground">Tempo para responder</p>
          <p className="font-mono text-2xl font-semibold tabular-nums">{relogio(restante).slice(3)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sem resposta, {varios ? 'todos pausam e contam' : 'o timer pausa e conta'} só até {horaCurta(contaAte)}
            {porAusencia ? ', quando o computador parou de ser usado.' : ', a hora da pergunta.'}
          </p>
        </div>
        {/* Só no navegador que ainda não respondeu ao pedido: no app desktop o
            aviso do sistema já vem liberado. */}
        {permissao === 'default' && (
          // dentro de um div: o DialogContent esconde botão que seja filho direto (o X de fechar)
          <div className="flex justify-center">
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => void pedirPermissaoDoAviso(true).then(setPermissao)}
            >
              <BellRing className="h-3.5 w-3.5" />
              Avisar também fora desta aba, na próxima vez
            </button>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            disabled={ocupado}
            onClick={() =>
              porAusencia
                ? motor.pararPorAusencia()
                : acoes.pausar.mutate({ motivo: 'sem_confirmacao', fim: new Date(perguntouEm).toISOString() })
            }
          >
            Não, parei
          </Button>
          <Button
            disabled={ocupado}
            className="bg-flag-gold text-flag-navy hover:bg-flag-gold/90"
            onClick={() => (porAusencia ? motor.confirmarAusencia() : acoes.sinal.mutate(true))}
          >
            Sim, continuo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
