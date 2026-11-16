import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ListTree, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { PainelTarefas } from '@/components/timer/PainelTarefas';
import { Cronometro } from '@/components/timer/Cronometro';
import { ColunaAnotacoes } from '@/components/timer/ColunaAnotacoes';
import { EmEspera } from '@/components/timer/EmEspera';
import { DialogoEncerrar, type AlvoLancamento } from '@/components/timer/DialogoEncerrar';
import { DialogoPresenca } from '@/components/timer/DialogoPresenca';
import { Coluna } from '@/components/timer/visual';
import { TimerLayout } from '@/components/timer/TimerLayout';
import { useMotorTimer, useTimerEstado } from '@/hooks/useTimerRelogio';
import { useTimerAnotacoes, type Anotacao } from '@/hooks/useTimerAnotacoes';
import { registrarEventoTimer, useTimerAcesso } from '@/hooks/useTimerAcesso';
import { gravarSelecao, type TarefaSelecionada } from '@/lib/timerSelecao';
import { demandasEmEspera, diaSP, pendentesDoItem, type DemandaEmEspera } from '@/lib/timerLancamento';

/**
 * Cockpit do Timer, em quatro colunas do mesmo tamanho (padrão visual do
 * Flag.DS): Anotações | Iniciar demanda | Em espera | Em andamento. Cada
 * coluna tem altura fixa e rola por dentro.
 */
const COLUNA = 'h-[70vh] md:h-[min(640px,calc(100dvh-7.5rem))]';

export default function TimerHome() {
  const { data: acesso } = useTimerAcesso();
  const motor = useMotorTimer({ tituloDaAba: true });
  const semana = useTimerEstado(7);
  const { fechar: fecharAnotacao } = useTimerAnotacoes();
  const podeLancar = !!acesso?.devops_guid;
  const somenteConsulta = motor.somenteConsulta;

  const [anotacao, setAnotacao] = useState<Anotacao | null>(null);
  const [alvo, setAlvo] = useState<AlvoLancamento | null>(null);

  const rodando = motor.rodando;
  const hoje = diaSP(motor.estado?.agora ?? new Date().toISOString());
  const emEspera = useMemo(
    () =>
      semana.data
        ? demandasEmEspera(semana.data.demandas, semana.data.trechos, rodando?.work_item_id ?? null, hoje)
        : [],
    [semana.data, rodando?.work_item_id, hoje],
  );
  const gruposDoAlvo = useMemo(() => {
    if (!alvo || !semana.data || semana.isFetching) return null;
    return pendentesDoItem(semana.data.trechos, alvo.id, hoje);
  }, [alvo, semana.data, semana.isFetching, hoje]);

  useEffect(() => {
    void registrarEventoTimer('abriu');
  }, []);

  const iniciar = (t: TarefaSelecionada) => {
    gravarSelecao(t); // o widget retoma por aqui
    if (somenteConsulta) {
      toast.info('No celular o Timer é só consulta. Inicie pelo computador.');
      return;
    }
    motor.acoes.iniciar.mutate({
      id: t.id,
      titulo: t.title ?? `#${t.id}`,
      tipo: t.work_item_type ?? 'Task',
      projeto: t.projeto,
    });
  };
  const retomar = (d: DemandaEmEspera) =>
    iniciar({ id: d.work_item_id, title: d.titulo, work_item_type: d.tipo, caminho: null, web_url: null, projeto: d.projeto });

  // Em andamento → Lançar: corta o trecho agora (o relógio segue) e abre o lançamento.
  const lancarRodando = (item: { id: number; titulo: string }) =>
    motor.acoes.partir.mutate(undefined, { onSuccess: () => setAlvo({ ...item, encerrar: false }) });
  // Em andamento → Encerrar: pausa e abre o lançamento + encerramento.
  const encerrarRodando = (item: { id: number; titulo: string }) =>
    motor.acoes.pausar.mutate({ motivo: 'manual' }, { onSuccess: () => setAlvo({ ...item, encerrar: true }) });

  const ocupado = motor.acoes.iniciar.isPending || motor.acoes.pausar.isPending || motor.acoes.partir.isPending;

  return (
    <TimerLayout>
      {somenteConsulta && (
        <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.1)] px-4 py-2.5 text-sm">
          <Smartphone className="h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
          No celular o Timer é só consulta. Iniciar e confirmar presença, só pelo computador.
        </div>
      )}
      {acesso && !podeLancar && (
        <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.1)] px-4 py-2.5 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
          Conta do Azure DevOps não encontrada: dá para marcar o tempo, mas não para lançar.
        </div>
      )}

      {/* 4 colunas do mesmo tamanho; o conteúdo rola dentro de cada uma */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ColunaAnotacoes emConversao={anotacao?.id ?? null} onVirarTask={setAnotacao} className={COLUNA} />

        <Coluna icone={ListTree} titulo="Iniciar demanda" destaque={!!anotacao} className={COLUNA}>
          <PainelTarefas
            embutido
            iniciarRecolhido
            podeIniciar={!somenteConsulta}
            selecionada={
              rodando
                ? { id: rodando.work_item_id, title: rodando.titulo, work_item_type: rodando.tipo, caminho: null, web_url: null }
                : null
            }
            onSelecionar={iniciar}
            anotacao={anotacao}
            onCancelarAnotacao={() => setAnotacao(null)}
            onItemCriado={(item) => {
              if (anotacao) fecharAnotacao.mutate({ id: anotacao.id, virouItemId: item.id });
              setAnotacao(null);
            }}
          />
        </Coluna>

        <EmEspera
          demandas={emEspera}
          ocupado={ocupado}
          podeRetomar={!somenteConsulta}
          onRetomar={retomar}
          onLancar={(d) => setAlvo({ id: d.work_item_id, titulo: d.titulo, encerrar: false })}
          onEncerrar={(d) => setAlvo({ id: d.work_item_id, titulo: d.titulo, encerrar: true })}
          className={COLUNA}
        />

        <Cronometro
          motor={motor}
          podeLancar={podeLancar}
          onLancar={lancarRodando}
          onEncerrar={encerrarRodando}
          className={`order-first md:order-none ${COLUNA}`}
        />
      </div>

      <DialogoPresenca motor={motor} />
      <DialogoEncerrar alvo={alvo} grupos={gruposDoAlvo} motor={motor} podeLancar={podeLancar} onFechar={() => setAlvo(null)} />
    </TimerLayout>
  );
}
