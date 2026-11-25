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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { MotorTimer } from '@/hooks/useTimerRelogio';
import { useEstadosItemTimer } from '@/hooks/useTimerTarefas';
import { horas } from '@/lib/timerRelogio';
import { rotuloDia, type GrupoPendente } from '@/lib/timerLancamento';
import { destinoPadrao, MANTER_ESTADO, opcoesDeDestino } from '@/lib/timerEstadoItem';

export interface AlvoLancamento {
  id: number;
  titulo: string;
  /** true = Encerrar (lança e fecha a demanda); false = Lançar (a demanda segue aberta) */
  encerrar: boolean;
  /** tipo do work item, quando a tela sabe (o pedido do mini timer não traz) */
  tipo?: string | null;
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
 *
 * Encerrando um PBI ou Bug da própria pessoa, o diálogo mostra o estado dele no
 * DevOps e para onde vai (25/11/2026): o padrão é o estado de conclusão (Done),
 * e dá para escolher um passo intermediário ou manter como está. A Task segue
 * indo direto para Done.
 */
export function DialogoEncerrar({ alvo, grupos, motor, podeLancar, onFechar }: Props) {
  const [notas, setNotas] = useState('');
  const [escolha, setEscolha] = useState<string | null>(null);
  const { lancar, encerrarDemanda } = motor.acoes;
  const total = (grupos ?? []).reduce((s, g) => s + g.minutos, 0);
  const ocupado = lancar.isPending || encerrarDemanda.isPending;
  const temPendente = !!grupos && grupos.length > 0;

  // Só PBI/Bug consulta o DevOps; sem o tipo (pedido do mini), consulta e descobre.
  const consultarEstados = !!alvo?.encerrar && alvo.tipo !== 'Task';
  const estadosQ = useEstadosItemTimer(consultarEstados && alvo ? alvo.id : null);
  const info = consultarEstados ? (estadosQ.data ?? null) : null;
  const opcoes = info ? opcoesDeDestino(info) : [];
  const anda = !!info && info.tipo !== 'Task' && !info.fechado && opcoes.length > 0;
  const podeMudar = anda && !!info?.atribuido;
  const destino = podeMudar && info ? (escolha ?? destinoPadrao(info)) : MANTER_ESTADO;
  const estadoNovo = destino !== MANTER_ESTADO ? destino : null;
  const esperandoEstados = consultarEstados && estadosQ.isLoading;
  const rotuloTipo = info?.tipo === 'Product Backlog Item' ? 'PBI' : (info?.tipo ?? 'Item');

  const fechar = () => {
    setNotas('');
    setEscolha(null);
    onFechar();
  };

  const encerrar = (id: number) => encerrarDemanda.mutate({ id, estado: estadoNovo }, { onSuccess: fechar });

  const confirmar = () => {
    if (!alvo || !grupos) return;
    if (!temPendente) {
      if (alvo.encerrar) encerrar(alvo.id);
      return;
    }
    lancar.mutate(
      grupos.map((g) => ({ dia: g.dia, work_item_id: g.work_item_id, notas: notas.trim() || null })),
      {
        onSuccess: (r) => {
          const tudoLancado = r.resultados.length > 0 && r.resultados.every((x) => x.status === 'lancado');
          if (alvo.encerrar && tudoLancado) encerrar(alvo.id);
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

        {esperandoEstados && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo o estado do item no DevOps
          </div>
        )}
        {anda && info && (
          <div className="space-y-1.5">
            <label htmlFor="timer-estado-destino" className="text-sm font-medium">
              {rotuloTipo} no DevOps <span className="font-normal text-muted-foreground">(hoje: {info.estado})</span>
            </label>
            {podeMudar ? (
              <>
                <Select value={destino} onValueChange={setEscolha} disabled={ocupado}>
                  <SelectTrigger id="timer-estado-destino" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={MANTER_ESTADO}>Manter em {info.estado}</SelectItem>
                    {opcoes.map((nome) => (
                      <SelectItem key={nome} value={nome}>
                        {nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {estadoNovo
                    ? `Ao encerrar, o ${rotuloTipo} #${info.id} vai para ${estadoNovo}.`
                    : `Ao encerrar, o ${rotuloTipo} #${info.id} fica em ${info.estado}.`}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Não está atribuído a você: o estado não muda por aqui.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={fechar}>
            Agora não
          </Button>
          <Button
            onClick={confirmar}
            disabled={
              !grupos || ocupado || esperandoEstados || (temPendente && !podeLancar) || (!temPendente && !alvo?.encerrar)
            }
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
