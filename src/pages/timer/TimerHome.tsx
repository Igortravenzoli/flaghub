import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Clock, Download, Globe, Plus, UserCheck } from 'lucide-react';
import { PainelTarefas } from '@/components/timer/PainelTarefas';
import { Cronometro } from '@/components/timer/Cronometro';
import { ColunaAnotacoes } from '@/components/timer/ColunaAnotacoes';
import { EmEspera } from '@/components/timer/EmEspera';
import { DialogoEncerrar } from '@/components/timer/DialogoEncerrar';
import { DialogoPresenca } from '@/components/timer/DialogoPresenca';
import { TrechosDoDia } from '@/components/timer/TrechosDoDia';
import { ResumoAdminTimer } from '@/components/timer/ResumoAdminTimer';
import { useMotorTimer, useTimerEstado } from '@/hooks/useTimerRelogio';
import { useTimerAnotacoes, type Anotacao } from '@/hooks/useTimerAnotacoes';
import { gravarSelecao, type TarefaSelecionada } from '@/lib/timerSelecao';
import { horas, relogio } from '@/lib/timerRelogio';
import { dentroDaJanela, demandasEmEspera, diaSP, gruposPendentes, type DemandaEmEspera } from '@/lib/timerLancamento';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { registrarEventoTimer, useTimerAcesso } from '@/hooks/useTimerAcesso';
import { TimerLayout } from '@/components/timer/TimerLayout';
import { IconeSistema } from '@/components/timer/IconesSistema';
import { detectarCliente, detectarPlataforma } from '@/lib/timerAcesso';
import { DOWNLOADS_TIMER, ordenarDownloads, urlDownload } from '@/lib/timerDownloads';

/**
 * Cockpit do Timer, em três colunas:
 *   Anotações (lembretes que viram Task) | Iniciar nova demanda + Tasks
 *   atribuídas + Em espera | Em andamento.
 * Embaixo, os trechos e os lançamentos no TimeLog.
 */
export default function TimerHome() {
  const { user, isAdmin } = useAuth();
  const { data: acesso } = useTimerAcesso();
  const motor = useMotorTimer({ tituloDaAba: true });
  const semana = useTimerEstado(7);
  const { fechar: fecharAnotacao } = useTimerAnotacoes();
  const podeLancar = !!acesso?.devops_guid;

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const plataforma = detectarPlataforma(ua);
  const noDesktop = detectarCliente(ua, '/timer') === 'desktop';
  const base = import.meta.env.VITE_TIMER_DOWNLOAD_BASE_URL as string | undefined;
  const downloads = useMemo(() => ordenarDownloads(DOWNLOADS_TIMER, plataforma), [plataforma]);

  const [novaAberta, setNovaAberta] = useState(false);
  const [anotacao, setAnotacao] = useState<Anotacao | null>(null);
  const [encerrando, setEncerrando] = useState<{ id: number; titulo: string } | null>(null);

  const rodando = motor.rodando;
  const hoje = diaSP(motor.estado?.agora ?? new Date().toISOString());
  const emEspera = useMemo(
    () => (semana.data ? demandasEmEspera(semana.data.trechos, rodando?.work_item_id ?? null, hoje) : []),
    [semana.data, rodando?.work_item_id, hoje],
  );
  const gruposEncerrando = useMemo(() => {
    if (!encerrando || !semana.data || semana.isFetching) return null;
    return gruposPendentes(semana.data.trechos).filter(
      (g) => g.work_item_id === encerrando.id && dentroDaJanela(g.dia, hoje),
    );
  }, [encerrando, semana.data, semana.isFetching, hoje]);

  useEffect(() => {
    void registrarEventoTimer('abriu');
  }, []);

  const iniciar = (t: TarefaSelecionada) => {
    gravarSelecao(t); // o widget retoma por aqui
    motor.acoes.iniciar.mutate({
      id: t.id,
      titulo: t.title ?? `#${t.id}`,
      tipo: t.work_item_type ?? 'Task',
      projeto: t.projeto,
    });
  };
  const retomar = (d: DemandaEmEspera) =>
    iniciar({ id: d.work_item_id, title: d.titulo, work_item_type: d.tipo, caminho: null, web_url: null, projeto: d.projeto });
  const encerrarRodando = (item: { id: number; titulo: string }) =>
    motor.acoes.pausar.mutate({ motivo: 'manual' }, { onSuccess: () => setEncerrando(item) });

  const virarTask = (a: Anotacao) => {
    setAnotacao(a);
    setNovaAberta(true);
  };

  const ocupado = motor.acoes.iniciar.isPending || motor.acoes.pausar.isPending;

  return (
    <TimerLayout>
      {/* faixa do dia */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-3 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-4 w-4" /> Hoje acumulado:
            <span className="font-mono font-semibold text-foreground">{horas(motor.totalHoje)}</span>
          </span>
          <span className="text-muted-foreground">
            Rodando agora:{' '}
            <span className="font-mono font-semibold text-foreground">
              {rodando ? `#${rodando.work_item_id} · ${relogio(motor.segundos)}` : '—'}
            </span>
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            {podeLancar ? (
              <>
                <UserCheck className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> Lança como {acesso?.devops_display ?? user?.email}
              </>
            ) : (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--warning))]" /> Conta do DevOps não encontrada:
                não dá para lançar horas
              </>
            )}
          </span>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
        <ColunaAnotacoes emConversao={anotacao?.id ?? null} onVirarTask={virarTask} />

        <Card className="min-w-0">
          <CardContent className="space-y-4 p-4">
            <Button
              className="w-full bg-[hsl(var(--success))] text-white hover:bg-[hsl(var(--success)/0.9)]"
              onClick={() => setNovaAberta((v) => !v)}
              aria-expanded={novaAberta}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Iniciar nova demanda
              <ChevronDown className={cn('ml-1.5 h-4 w-4 transition-transform', novaAberta && 'rotate-180')} />
            </Button>
            {novaAberta && (
              <PainelTarefas
                embutido
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
            )}
            <EmEspera demandas={emEspera} ocupado={ocupado} onRetomar={retomar} onEncerrar={(d) => setEncerrando({ id: d.work_item_id, titulo: d.titulo })} />
          </CardContent>
        </Card>

        <div className="order-first min-w-0 lg:order-none">
          <Cronometro motor={motor} onEncerrar={encerrarRodando} />
        </div>
      </div>

      <TrechosDoDia motor={motor} podeLancar={podeLancar} />

      {isAdmin && <ResumoAdminTimer />}

      <DialogoPresenca motor={motor} />
      <DialogoEncerrar
        alvo={encerrando}
        grupos={gruposEncerrando}
        motor={motor}
        podeLancar={podeLancar}
        onFechar={() => setEncerrando(null)}
      />

      {!noDesktop && (
        <section className="space-y-3" aria-labelledby="timer-downloads">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="timer-downloads" className="flex items-center gap-2 text-lg font-semibold">
                <Download className="h-4 w-4 text-primary" /> Baixe o app
              </h2>
              <p className="text-sm text-muted-foreground">
                O app fica na bandeja do sistema com um widget flutuante. Entra com a mesma conta Microsoft.
              </p>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5" /> Ou use aqui mesmo, no navegador.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {downloads.map((d) => {
              const url = urlDownload(d, base);
              const recomendado = d.plataforma === plataforma;
              const conteudo = (
                <>
                  <IconeSistema plataforma={d.plataforma} className="h-10 w-10" />
                  <div className="space-y-0.5 text-center">
                    <p className="font-semibold">{d.rotulo}</p>
                    <p className="text-xs text-muted-foreground">{d.formato}</p>
                  </div>
                  {recomendado && <Badge className="bg-flag-gold text-flag-navy hover:bg-flag-gold">Para o seu sistema</Badge>}
                  {!url && <Badge variant="outline">Em breve</Badge>}
                </>
              );
              const classe = cn(
                'flex h-full flex-col items-center gap-3 rounded-xl border p-5 transition-colors',
                recomendado ? 'border-flag-gold/60 bg-flag-gold/5' : 'bg-card',
              );
              return url ? (
                <Button
                  key={d.plataforma}
                  asChild
                  variant="ghost"
                  className={cn(classe, 'h-auto hover:border-flag-gold hover:bg-flag-gold/10')}
                >
                  <a
                    href={url}
                    rel="noopener"
                    onClick={() => void registrarEventoTimer('baixou_instalador', { plataforma: d.plataforma })}
                  >
                    {conteudo}
                  </a>
                </Button>
              ) : (
                <div key={d.plataforma} className={cn(classe, 'cursor-not-allowed opacity-70')} aria-disabled>
                  {conteudo}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </TimerLayout>
  );
}
