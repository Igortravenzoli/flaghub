import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Globe } from 'lucide-react';
import { PainelTarefas } from '@/components/timer/PainelTarefas';
import { Cronometro } from '@/components/timer/Cronometro';
import { DialogoPresenca } from '@/components/timer/DialogoPresenca';
import { TrechosDoDia } from '@/components/timer/TrechosDoDia';
import { ResumoAdminTimer } from '@/components/timer/ResumoAdminTimer';
import { useMotorTimer } from '@/hooks/useTimerRelogio';
import { gravarSelecao, lerSelecao, type TarefaSelecionada } from '@/lib/timerSelecao';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { registrarEventoTimer, useTimerAcesso } from '@/hooks/useTimerAcesso';
import { TimerLayout } from '@/components/timer/TimerLayout';
import { IconeSistema } from '@/components/timer/IconesSistema';
import { detectarCliente, detectarPlataforma } from '@/lib/timerAcesso';
import { DOWNLOADS_TIMER, ordenarDownloads, urlDownload } from '@/lib/timerDownloads';

export default function TimerHome() {
  const { user, isAdmin } = useAuth();
  const { data: acesso } = useTimerAcesso();
  const motor = useMotorTimer({ tituloDaAba: true });

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const plataforma = detectarPlataforma(ua);
  const noDesktop = detectarCliente(ua, '/timer') === 'desktop';
  const base = import.meta.env.VITE_TIMER_DOWNLOAD_BASE_URL as string | undefined;
  const downloads = useMemo(() => ordenarDownloads(DOWNLOADS_TIMER, plataforma), [plataforma]);

  const [selecionada, setSelecionada] = useState<TarefaSelecionada | null>(() => lerSelecao());
  const trocarSelecao = (t: TarefaSelecionada | null) => {
    setSelecionada(t);
    gravarSelecao(t);
  };

  useEffect(() => {
    void registrarEventoTimer('abriu');
  }, []);

  return (
    <TimerLayout>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Timer Flag</h1>
        <p className="text-sm text-muted-foreground">
          Marque o tempo de cada tarefa e lance as horas no Azure DevOps, pelo navegador ou pelo app.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Cronometro motor={motor} selecionada={selecionada} onLimparSelecao={() => trocarSelecao(null)} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sua conta no DevOps</CardTitle>
            <CardDescription>As horas são lançadas no seu nome no TimeLog.</CardDescription>
          </CardHeader>
          <CardContent>
            {acesso?.devops_guid ? (
              <div className="flex items-start gap-2 rounded-lg border border-[hsl(var(--success)/0.3)] bg-[hsl(var(--success)/0.08)] p-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--success))]" />
                <span>
                  Conta encontrada{acesso.devops_display ? `: ${acesso.devops_display}` : ''}.
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.1)] p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--warning))]" />
                <span>
                  Não achamos sua conta no Azure DevOps pelo e-mail {user?.email}. Sem ela, o Timer não lança horas.
                  Peça ao administrador para conferir seu usuário na organização FlagIW.
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <TrechosDoDia motor={motor} podeLancar={!!acesso?.devops_guid} />

      <PainelTarefas selecionada={selecionada} onSelecionar={trocarSelecao} />

      {isAdmin && <ResumoAdminTimer />}

      <DialogoPresenca motor={motor} />

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
