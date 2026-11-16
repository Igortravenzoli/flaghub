import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Activity, AlertTriangle, Clock, Download, Globe, ListTree, PauseCircle, UserCheck } from 'lucide-react';
import { Coluna, Pilula, SOMBRA_XS } from '@/components/timer/visual';
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
 * Cockpit do Timer, em quatro colunas (padrão visual do Flag.DS):
 *   Anotações | Iniciar demanda (épicas recolhidas) | Em espera | Em andamento.
 * Embaixo, os trechos e os lançamentos no TimeLog.
 */
function Metrica({
  icone: Icone,
  rotulo,
  valor,
  apagado = false,
}: {
  icone: ComponentType<{ className?: string }>;
  rotulo: string;
  valor: string;
  apagado?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <Icone className="h-4 w-4 text-muted-foreground" />
      <span className="text-muted-foreground">{rotulo}</span>
      <span className={cn('font-mono font-semibold tabular-nums', apagado ? 'text-muted-foreground' : 'text-foreground')}>
        {valor}
      </span>
    </span>
  );
}

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

  const virarTask = (a: Anotacao) => setAnotacao(a);

  const ocupado = motor.acoes.iniciar.isPending || motor.acoes.pausar.isPending;

  return (
    <TimerLayout>
      {/* faixa do dia */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm',
          SOMBRA_XS,
        )}
      >
        <Metrica icone={Clock} rotulo="Hoje" valor={horas(motor.totalHoje)} />
        <Metrica
          icone={Activity}
          rotulo="Rodando"
          valor={rodando ? `#${rodando.work_item_id} · ${relogio(motor.segundos)}` : 'nada'}
          apagado={!rodando}
        />
        <Metrica icone={PauseCircle} rotulo="Em espera" valor={String(emEspera.length)} />
        <span className="ml-auto">
          {podeLancar ? (
            <Pilula tom="sucesso" title="Conta do Azure DevOps em que as horas são lançadas">
              <UserCheck className="h-3 w-3" />
              {acesso?.devops_display ?? user?.email}
            </Pilula>
          ) : (
            <Pilula tom="alerta">
              <AlertTriangle className="h-3 w-3" />
              Conta do DevOps não encontrada
            </Pilula>
          )}
        </span>
      </div>

      {/* 4 colunas: no xl ocupam a altura da tela e rolam por dentro */}
      <div className="grid gap-4 md:grid-cols-2 xl:h-[calc(100dvh-9.5rem)] xl:min-h-[560px] xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <ColunaAnotacoes
          emConversao={anotacao?.id ?? null}
          onVirarTask={virarTask}
          className="max-h-[70vh] xl:max-h-none"
        />

        <Coluna
          icone={ListTree}
          titulo="Iniciar demanda"
          destaque={!!anotacao}
          className="max-h-[70vh] xl:max-h-none"
        >
          <PainelTarefas
            embutido
            iniciarRecolhido
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
          onRetomar={retomar}
          onEncerrar={(d) => setEncerrando({ id: d.work_item_id, titulo: d.titulo })}
          className="max-h-[70vh] xl:max-h-none"
        />

        <Cronometro motor={motor} onEncerrar={encerrarRodando} className="order-first md:order-none" />
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
