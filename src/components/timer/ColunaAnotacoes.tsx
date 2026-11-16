import { useState } from 'react';
import { Check, Info, NotebookPen, Play, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useTimerAnotacoes, type Anotacao } from '@/hooks/useTimerAnotacoes';

interface Props {
  /** anotação em conversão para Task (destacada) */
  emConversao: string | null;
  onVirarTask: (a: Anotacao) => void;
}

/**
 * Anotações: "anote e Enter, vira demanda depois". Lembrete, não marca tempo.
 * ▶ vira Task (escolhendo o PBI/Bug) e inicia o timer; ✓ feita; ✕ apaga.
 */
export function ColunaAnotacoes({ emConversao, onVirarTask }: Props) {
  const { anotacoes, anotar, fechar, apagar } = useTimerAnotacoes();
  const [texto, setTexto] = useState('');

  const enviar = () => {
    const t = texto.trim();
    if (!t || anotar.isPending) return;
    anotar.mutate(t, { onSuccess: () => setTexto('') });
  };

  return (
    <Card className="h-full min-w-0">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
          <NotebookPen className="h-4 w-4 text-primary" /> Anotações
          <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
            {anotacoes.length}
          </Badge>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Sobre as anotações">
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs normal-case tracking-normal">
                Lembretes rápidos, sem marcar tempo. O ▶ transforma a anotação numa Task, no PBI ou Bug que você
                escolher, e já inicia o timer nela.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
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
          placeholder="Anote e Enter — vira demanda depois"
          aria-label="Nova anotação"
        />
        <ul className="space-y-1.5">
          {anotacoes.map((a) => (
            <li
              key={a.id}
              className={cn(
                'flex items-center gap-1 rounded-lg border bg-card px-2.5 py-2 text-sm',
                emConversao === a.id && 'border-flag-gold bg-flag-gold/10',
              )}
            >
              <span className="min-w-0 flex-1 truncate" title={a.texto}>
                {a.texto}
              </span>
              <button
                type="button"
                className="rounded p-1 text-[hsl(var(--success))] hover:bg-muted"
                onClick={() => onVirarTask(a)}
                title="Virar Task e iniciar o timer"
              >
                <Play className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => fechar.mutate({ id: a.id })}
                title="Feita"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                onClick={() => apagar.mutate(a.id)}
                title="Apagar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
