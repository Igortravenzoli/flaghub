import { useState } from 'react';
import { GripVertical, NotebookPen, Play, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useTimerAnotacoes, type Anotacao } from '@/hooks/useTimerAnotacoes';
import { Coluna, SOMBRA_XS, Vazio } from '@/components/timer/visual';
import { escreverArrasto } from '@/lib/timerArrastar';

interface Props {
  /** anotação em conversão para Task (destacada) */
  emConversao: string | null;
  onVirarTask: (a: Anotacao) => void;
  /** arrastando uma anotação (para soltar num PBI); null ao soltar ou desistir */
  onArrastar?: (a: Anotacao | null) => void;
  className?: string;
}

/**
 * Anotações: lembrete, não marca tempo. ▶ abre o pop-up "Virar Task" (escolhe
 * o PBI/Bug; a Task é criada e o timer inicia). Arrastar a anotação até um PBI
 * abre o mesmo pop-up com ele escolhido. ✕ apaga. O ✓ "feita" saiu a pedido do
 * Igor (25/11/2026): só ▶ e ✕.
 */
export function ColunaAnotacoes({ emConversao, onVirarTask, onArrastar, className }: Props) {
  const { anotacoes, anotar, apagar, editar } = useTimerAnotacoes();
  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);

  const salvarEdicao = () => {
    if (!editando) return;
    const t = editando.texto.trim();
    const original = anotacoes.find((a) => a.id === editando.id)?.texto;
    if (!t || t === original) {
      setEditando(null);
      return;
    }
    editar.mutate({ id: editando.id, texto: t }, { onSuccess: () => setEditando(null) });
  };

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
                draggable={editando?.id !== a.id}
                onDragStart={(e) => {
                  escreverArrasto(e.dataTransfer, a);
                  onArrastar?.(a);
                }}
                onDragEnd={() => onArrastar?.(null)}
                // a dica do cartão é o texto inteiro: na coluna estreita ele corta
                // (pedido do Igor, 25/11/2026). "Arraste" ficou na alça.
                title={editando?.id === a.id ? undefined : a.texto}
                className={cn(
                  'group flex items-center gap-1 rounded-lg border bg-card py-1.5 pl-1 pr-1.5 text-sm transition-colors hover:bg-muted/50',
                  editando?.id !== a.id && 'cursor-grab active:cursor-grabbing',
                  emConversao === a.id ? 'border-flag-gold bg-flag-gold/10' : 'border-border',
                )}
              >
                <span className="flex shrink-0 items-center" title="Arraste até um PBI para virar Task nele">
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground" aria-hidden />
                </span>
                {editando?.id === a.id ? (
                  <Input
                    autoFocus
                    value={editando.texto}
                    maxLength={200}
                    onChange={(e) => setEditando({ id: a.id, texto: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        salvarEdicao();
                      } else if (e.key === 'Escape') {
                        setEditando(null);
                      }
                    }}
                    onBlur={salvarEdicao}
                    className="h-7 min-w-0 flex-1 px-2 text-sm"
                    aria-label="Editar anotação"
                  />
                ) : (
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left font-medium"
                    title={a.texto}
                    aria-label={`Editar a anotação "${a.texto}"`}
                    onClick={() => setEditando({ id: a.id, texto: a.texto })}
                  >
                    {a.texto}
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-md p-1.5 text-[hsl(var(--success))] hover:bg-[hsl(var(--success)/0.1)]"
                  onClick={() => onVirarTask(a)}
                  title="Virar Task: abre a escolha do PBI e o timer inicia"
                  aria-label={`Virar "${a.texto}" em Task: escolher o PBI`}
                >
                  <Play className="h-3.5 w-3.5" />
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
