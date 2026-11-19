import { ArrowDownUp, CalendarArrowDown, CalendarArrowUp } from 'lucide-react';
import { proximaOrdem, ROTULO_ORDEM, type OrdemTasks } from '@/lib/ordemAbertura';

/** O ícone que alterna a ordem das Tasks do PBI pela abertura. */
export function BotaoOrdemAbertura({
  ordem,
  onMudar,
  comPadrao = true,
}: {
  ordem: OrdemTasks;
  onMudar: (o: OrdemTasks) => void;
  comPadrao?: boolean;
}) {
  const Icone = ordem === 'recentes' ? CalendarArrowDown : ordem === 'antigas' ? CalendarArrowUp : ArrowDownUp;
  const proxima = proximaOrdem(ordem, comPadrao);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onMudar(proxima);
      }}
      className={
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-muted ' +
        (ordem === 'padrao' ? 'text-muted-foreground' : 'text-flag-gold')
      }
      title={`Tasks: ${ROTULO_ORDEM[ordem].toLowerCase()}. Clique: ${ROTULO_ORDEM[proxima].toLowerCase()}`}
      aria-label={`Ordem das Tasks: ${ROTULO_ORDEM[ordem]}`}
    >
      <Icone className="h-3.5 w-3.5" />
    </button>
  );
}
