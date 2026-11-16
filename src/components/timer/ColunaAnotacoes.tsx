import { useState } from 'react';
import { Check, NotebookPen, Play, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useTimerAnotacoes, type Anotacao } from '@/hooks/useTimerAnotacoes';
import { Coluna, SOMBRA_XS, Vazio } from '@/components/timer/visual';

interface Props {
  /** anotação em conversão para Task (destacada) */
  emConversao: string | null;
  onVirarTask: (a: Anotacao) => void;
  className?: string;
}

/**
 * Anotações: lembrete, não marca tempo. ▶ vira Task (escolhendo o PBI/Bug)
 * e inicia o timer; ✓ feita; ✕ apaga.
 */
export function ColunaAnotacoes({ emConversao, onVirarTask, className }: Props) {
  const { anotacoes, anotar, fechar, apagar } = useTimerAnotacoes();
  const [texto, setTexto] = useState('');

  const enviar = () => {
    const t = texto.trim();
    if (!t || anotar.isPending) return;
    anotar.mutate(t, { onSuccess: () => setTexto('') });
  };

  return (
    <Coluna icone={NotebookPen} titulo="Anotações" contagem={anotacoes.length} className={className}>
      <div className="space-y-2">
        <Input
          value={texto}
          maxLength={200}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              enviar();
            }
          }}
          placeholder="Anote e tecle Enter"
          aria-label="Nova anotação"
          className={cn('h-9', SOMBRA_XS)}
        />
        {anotacoes.length === 0 ? (
          <Vazio>Nenhuma anotação</Vazio>
        ) : (
          <ul className="space-y-1.5">
            {anotacoes.map((a) => (
              <li
                key={a.id}
                className={cn(
                  'group flex items-center gap-1 rounded-lg border bg-card py-1.5 pl-3 pr-1.5 text-sm transition-colors hover:bg-muted/50',
                  emConversao === a.id ? 'border-flag-gold bg-flag-gold/10' : 'border-border',
                )}
              >
                <span className="min-w-0 flex-1 truncate font-medium" title={a.texto}>
                  {a.texto}
                </span>
                <button
                  type="button"
                  className="rounded-md p-1.5 text-[hsl(var(--success))] hover:bg-[hsl(var(--success)/0.1)]"
                  onClick={() => onVirarTask(a)}
                  title="Virar Task e iniciar"
                  aria-label={`Virar "${a.texto}" em Task e iniciar`}
                >
                  <Play className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => fechar.mutate({ id: a.id })}
                  title="Feita"
                  aria-label={`Marcar "${a.texto}" como feita`}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => apagar.mutate(a.id)}
                  title="Apagar"
                  aria-label={`Apagar "${a.texto}"`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Coluna>
  );
}
