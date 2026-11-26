import { useState } from 'react';
import { ArrowRightLeft, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ErroTimer, useEstadosItemTimer, useMudarEstadoTimer } from '@/hooks/useTimerTarefas';
import { bloqueioDoDestino, opcoesDeDestino } from '@/lib/timerEstadoItem';
import { cn } from '@/lib/utils';

/**
 * O "momento" do PBI ou do Bug: muda o estado no Azure DevOps direto da linha,
 * SEM timer (decisão do Igor, 26/11/2026). Antes só dava para mudar dando play
 * no PBI e encerrando; o estado é controle da atividade, não hora.
 *
 * Os estados vêm do DevOps na hora em que o menu abre (a edge lê o tipo no
 * processo do projeto). O estado de conclusão fica barrado enquanto houver
 * filho aberto, e o menu diz quais são; quem barra de verdade é a edge.
 */
export function MenuEstado({ id, estadoAtual }: { id: number; estadoAtual: string | null }) {
  const [aberto, setAberto] = useState(false);
  const info = useEstadosItemTimer(aberto ? id : null);
  const mudar = useMudarEstadoTimer();
  const dados = info.data;
  const opcoes = dados ? opcoesDeDestino(dados) : [];

  const escolher = (estado: string) =>
    mudar.mutate(
      { id, estado },
      {
        onSuccess: (r) => {
          setAberto(false);
          if (r.mudou) toast.success(`#${id} foi para ${r.estado ?? estado} no DevOps.`);
          else toast.info(`#${id} já estava em ${r.estado ?? estado}.`);
        },
        onError: (e) => toast.error(e instanceof ErroTimer ? e.message : `Não foi possível mudar o estado do item #${id}.`),
      },
    );

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1 px-2 text-[11px]"
          title="Mudar o estado no DevOps (não passa pelo timer)"
          aria-label={`Mudar o estado do item ${id}${estadoAtual ? ` (hoje: ${estadoAtual})` : ''}`}
        >
          <ArrowRightLeft className="h-3 w-3" />
          Estado
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0 text-xs">
        <p className="border-b border-border px-3 py-2 text-muted-foreground">
          <span className="font-mono">#{id}</span> · hoje em{' '}
          <span className="font-semibold text-foreground">{dados?.estado ?? estadoAtual ?? '…'}</span>
        </p>
        {info.isLoading ? (
          <p className="flex items-center gap-1.5 px-3 py-3 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo os estados no DevOps…
          </p>
        ) : info.error ? (
          <p className="px-3 py-3 text-destructive">
            {info.error instanceof ErroTimer ? info.error.message : 'Não foi possível ler os estados no DevOps.'}
          </p>
        ) : !dados || dados.fechado ? (
          <p className="px-3 py-3 text-muted-foreground">Este item já está concluído: reabra no DevOps.</p>
        ) : !dados.atribuido ? (
          <p className="px-3 py-3 text-muted-foreground">
            Este item não está atribuído a você. Quem muda o estado é o responsável; mude no DevOps.
          </p>
        ) : opcoes.length === 0 ? (
          <p className="px-3 py-3 text-muted-foreground">Não há outro estado para este tipo.</p>
        ) : (
          <ul className="py-1" aria-label="Levar para">
            {opcoes.map((nome) => {
              const bloqueio = bloqueioDoDestino(dados, nome);
              return (
                <li key={nome}>
                  <button
                    type="button"
                    disabled={!!bloqueio || mudar.isPending}
                    onClick={() => escolher(nome)}
                    className={cn(
                      'flex w-full items-start justify-between gap-2 px-3 py-1.5 text-left',
                      bloqueio ? 'cursor-not-allowed text-muted-foreground' : 'hover:bg-muted disabled:opacity-50',
                    )}
                  >
                    <span className="min-w-0">
                      <span className={cn('block', !bloqueio && 'font-medium')}>{nome}</span>
                      {bloqueio && <span className="block text-[11px]">Barrado: {bloqueio}. Conclua antes.</span>}
                    </span>
                    {bloqueio ? (
                      <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                    ) : (
                      mudar.isPending && mudar.variables?.estado === nome && <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
