import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ListTree, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { PainelTarefas } from '@/components/timer/PainelTarefas';
import { Cronometro } from '@/components/timer/Cronometro';
import { ColunaAnotacoes } from '@/components/timer/ColunaAnotacoes';
import { EmEspera } from '@/components/timer/EmEspera';
import { DialogoEncerrar, type AlvoLancamento } from '@/components/timer/DialogoEncerrar';
import { DialogoPresenca } from '@/components/timer/DialogoPresenca';
import { DialogoReuniao } from '@/components/timer/DialogoReuniao';
import { DialogoAnotacao } from '@/components/timer/DialogoAnotacao';
import { useMinhasTarefasTimer } from '@/hooks/useTimerTarefas';
import type { ItemDevops } from '@/lib/minhasAtividades';
import { Coluna } from '@/components/timer/visual';
import { TimerLayout } from '@/components/timer/TimerLayout';
import { useMotorTimer, useTimerEstado } from '@/hooks/useTimerRelogio';
import { useTimerAnotacoes, type Anotacao } from '@/hooks/useTimerAnotacoes';
import { registrarEventoTimer, useTimerAcesso } from '@/hooks/useTimerAcesso';
import { gravarModoParalelo, gravarSelecao, lerModoParalelo, type TarefaSelecionada } from '@/lib/timerSelecao';
import { demandasEmEspera, diaSP, pendentesDoItem, type DemandaEmEspera } from '@/lib/timerLancamento';
import { CHAVE_PEDIDO_ENCERRAR, lerPedidoEncerrar } from '@/lib/timerDesktop';

/**
 * Cockpit do Timer, em quatro colunas do mesmo tamanho (padrão visual do
 * Flag.DS): Anotações | Iniciar demanda | Em espera | Em andamento. Cada
 * coluna tem altura fixa e rola por dentro.
 */
// Ocupa a altura toda da janela (barra 3,5rem + margens 2rem), sem sobra embaixo.
const COLUNA = 'h-[70vh] md:h-[calc(100dvh-5.5rem)] md:min-h-[420px]';

export default function TimerHome() {
  const { data: acesso } = useTimerAcesso();
  const motor = useMotorTimer({ tituloDaAba: true });
  const semana = useTimerEstado(7);
  const { fechar: fecharAnotacao } = useTimerAnotacoes();
  const podeLancar = !!acesso?.devops_guid;
  const somenteConsulta = motor.somenteConsulta;

  // anotação virando Task: o pop-up "Virar Task" (▶ = escolhe o PBI e inicia;
  // arrastar até um PBI = ele já vem escolhido, sem iniciar). 25/11/2026.
  const [virar, setVirar] = useState<{ anotacao: { id: string; texto: string }; pbi: ItemDevops | null; iniciar: boolean } | null>(null);
  // anotação sendo arrastada até um PBI (a árvore realça os alvos)
  const [arrastada, setArrastada] = useState<Anotacao | null>(null);
  const [alvo, setAlvo] = useState<AlvoLancamento | null>(null);
  const [reuniaoAberta, setReuniaoAberta] = useState(false);
  // Features já carregadas na árvore (a mesma consulta, sem ir de novo ao DevOps)
  const minhas = useMinhasTarefasTimer();
  const { features, pbis, tarefas } = useMemo(() => {
    const vistos = new Set<number>();
    const todos = [...(minhas.data?.ancestrais ?? []), ...(minhas.data?.itens ?? [])].filter((i) => {
      if (vistos.has(i.id) || ['Done', 'Closed', 'Removed'].includes(i.state ?? '')) return false;
      vistos.add(i.id);
      return true;
    });
    return {
      features: todos.filter((i) => i.work_item_type === 'Feature'),
      tarefas: (minhas.data?.itens ?? []).filter((i) => i.work_item_type === 'Task' && !['Done', 'Closed', 'Removed'].includes(i.state ?? '')),
      pbis: todos.filter((i) => i.work_item_type === 'Product Backlog Item' || i.work_item_type === 'Bug'),
    };
  }, [minhas.data]);
  // Paralelo (TM9): ligado, iniciar outra demanda NÃO pausa as que rodam.
  const [paralelo, setParalelo] = useState(() => lerModoParalelo());
  const mudarParalelo = (v: boolean) => {
    setParalelo(v);
    gravarModoParalelo(v);
  };

  const rodando = motor.rodando;
  const rodandoIds = useMemo(() => motor.rodandoTodos.map((r) => r.work_item_id), [motor.rodandoTodos]);
  const hoje = diaSP(motor.estado?.agora ?? new Date().toISOString());
  const emEspera = useMemo(
    () =>
      semana.data
        ? demandasEmEspera(semana.data.demandas, semana.data.trechos, rodandoIds, hoje)
        : [],
    [semana.data, rodandoIds, hoje],
  );
  const gruposDoAlvo = useMemo(() => {
    if (!alvo || !semana.data || semana.isFetching) return null;
    return pendentesDoItem(semana.data.trechos, alvo.id, hoje);
  }, [alvo, semana.data, semana.isFetching, hoje]);

  useEffect(() => {
    void registrarEventoTimer('abriu');
  }, []);

  // App desktop: o mini timer pausou e pediu "encerrar e lançar" aqui.
  const { refetch: refazerSemana } = semana;
  useEffect(() => {
    const atender = (bruto: string | null) => {
      const p = lerPedidoEncerrar(bruto);
      if (!p) return;
      try {
        localStorage.removeItem(CHAVE_PEDIDO_ENCERRAR);
      } catch {
        /* segue */
      }
      void refazerSemana();
      setAlvo({ id: p.id, titulo: p.titulo, encerrar: true });
    };
    try {
      atender(localStorage.getItem(CHAVE_PEDIDO_ENCERRAR));
    } catch {
      /* sem storage */
    }
    const aoMudar = (e: StorageEvent) => {
      if (e.key === CHAVE_PEDIDO_ENCERRAR) atender(e.newValue);
    };
    window.addEventListener('storage', aoMudar);
    return () => window.removeEventListener('storage', aoMudar);
  }, [refazerSemana]);

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
      paralelo: paralelo && motor.rodandoTodos.length > 0,
    });
  };
  const retomar = (d: DemandaEmEspera) =>
    iniciar({ id: d.work_item_id, title: d.titulo, work_item_type: d.tipo, caminho: null, web_url: null, projeto: d.projeto });

  // Em andamento → Lançar: corta o trecho agora (o relógio segue) e abre o lançamento.
  const lancarRodando = (item: { id: number; titulo: string }) =>
    motor.acoes.partir.mutate(item.id, { onSuccess: () => setAlvo({ ...item, encerrar: false }) });
  // Em andamento → Encerrar: pausa e abre o lançamento + encerramento.
  const encerrarRodando = (item: { id: number; titulo: string }) =>
    motor.acoes.pausar.mutate(
      { motivo: 'manual', workItemId: item.id },
      { onSuccess: () => setAlvo({ ...item, encerrar: true }) },
    );

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
        <ColunaAnotacoes
          emConversao={virar?.anotacao.id ?? null}
          onVirarTask={(a: Anotacao) => setVirar({ anotacao: a, pbi: null, iniciar: true })}
          onArrastar={setArrastada}
          className={COLUNA}
        />

        <Coluna icone={ListTree} titulo="Iniciar demanda" className={COLUNA}>
          <PainelTarefas
            embutido
            iniciarRecolhido
            podeIniciar={!somenteConsulta}
            selecionada={
              rodando
                ? { id: rodando.work_item_id, title: rodando.titulo, work_item_type: rodando.tipo, caminho: null, web_url: null }
                : null
            }
            rodandoIds={rodandoIds}
            onSelecionar={iniciar}
            anotacaoArrastada={arrastada}
            onAnotacaoSolta={(pai, a) => {
              setArrastada(null);
              setVirar({ anotacao: a, pbi: pai, iniciar: false });
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
          paralelo={paralelo}
          onParalelo={mudarParalelo}
          onReuniao={() => setReuniaoAberta(true)}
          onLancar={lancarRodando}
          onEncerrar={encerrarRodando}
          className={`order-first md:order-none ${COLUNA}`}
        />
      </div>

      <DialogoPresenca motor={motor} />
      <DialogoReuniao
        aberto={reuniaoAberta}
        onFechar={() => setReuniaoAberta(false)}
        features={features}
        pbis={pbis}
        tarefas={tarefas}
        onCriada={(item) =>
          iniciar({
            id: item.id,
            title: item.title,
            work_item_type: item.work_item_type ?? 'Task',
            caminho: null,
            web_url: item.web_url,
            projeto: (item as { team_project?: string | null }).team_project ?? null,
          })
        }
      />
      {virar && (
        <DialogoAnotacao
          key={`${virar.anotacao.id}-${virar.pbi?.id ?? ''}`}
          anotacao={virar.anotacao}
          pbiInicial={virar.pbi}
          iniciar={virar.iniciar && !somenteConsulta}
          onFechar={() => setVirar(null)}
          onCriada={(item) => {
            fecharAnotacao.mutate({ id: virar.anotacao.id, virouItemId: item.id });
            if (virar.iniciar)
              iniciar({
                id: item.id,
                title: item.title,
                work_item_type: item.work_item_type ?? 'Task',
                caminho: null,
                web_url: item.web_url,
                projeto: item.team_project ?? null,
              });
          }}
        />
      )}
      <DialogoEncerrar alvo={alvo} grupos={gruposDoAlvo} motor={motor} podeLancar={podeLancar} onFechar={() => setAlvo(null)} />
    </TimerLayout>
  );
}
