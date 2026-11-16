import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, MonitorDown, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { registrarEventoTimer } from '@/hooks/useTimerAcesso';
import { IconeSistema } from '@/components/timer/IconesSistema';
import { detectarCliente, detectarPlataforma } from '@/lib/timerAcesso';
import { DOWNLOADS_TIMER, ordenarDownloads, urlDownload } from '@/lib/timerDownloads';
import { aoMudarInstalacao, instalarPwa, podeInstalar, rodandoInstalado, temDeteccaoAusencia } from '@/lib/timerPwa';

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      {children}
    </section>
  );
}

/**
 * "Baixar app" no topo do Timer (popup):
 *   1. instalar pelo navegador (PWA, Chrome/Edge): janela própria, sem instalador;
 *   2. detectar ausência (Chrome/Edge): pausa com a tela bloqueada ou 30 min sem uso;
 *   3. o app para o computador (Electron), baixado da pasta do SharePoint.
 * Some dentro do próprio app desktop.
 */
export function BaixarApp({ className }: { className?: string }) {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const plataforma = detectarPlataforma(ua);
  const noDesktop = detectarCliente(ua, '/timer') === 'desktop';
  const base = import.meta.env.VITE_TIMER_DOWNLOAD_BASE_URL as string | undefined;
  const pasta = import.meta.env.VITE_TIMER_DOWNLOAD_URL as string | undefined;
  const downloads = useMemo(() => ordenarDownloads(DOWNLOADS_TIMER, plataforma), [plataforma]);

  const [instalavel, setInstalavel] = useState(podeInstalar());
  const [ausencia, setAusencia] = useState<'sem_suporte' | 'pedir' | 'ligada' | 'negada'>('sem_suporte');

  useEffect(() => aoMudarInstalacao(() => setInstalavel(podeInstalar())), []);
  useEffect(() => {
    if (!temDeteccaoAusencia()) return;
    navigator.permissions
      .query({ name: 'idle-detection' as PermissionName })
      .then((p) => setAusencia(p.state === 'granted' ? 'ligada' : p.state === 'denied' ? 'negada' : 'pedir'))
      .catch(() => setAusencia('pedir'));
  }, []);

  if (noDesktop) return null;

  const instalar = async () => {
    if (await instalarPwa()) toast.success('Timer Flag instalado. Ele abre na própria janela.');
  };
  const pedirAusencia = async () => {
    try {
      const r = await (window as unknown as { IdleDetector: { requestPermission: () => Promise<string> } }).IdleDetector.requestPermission();
      setAusencia(r === 'granted' ? 'ligada' : 'negada');
      if (r === 'granted') toast.success('Detecção de ausência ligada. Recarregue a página do Timer.');
    } catch {
      setAusencia('negada');
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className={cn('gap-2', className)}>
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Baixar app</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Timer Flag fora do navegador</DialogTitle>
          <DialogDescription>Mesma conta Microsoft, mesmo timer.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Secao titulo="Instalar pelo navegador">
            {rodandoInstalado() ? (
              <p className="flex items-center gap-2 text-sm text-[hsl(var(--success))]">
                <CheckCircle2 className="h-4 w-4" /> Você já está no Timer instalado.
              </p>
            ) : instalavel ? (
              <Button onClick={() => void instalar()} className="gap-2">
                <MonitorDown className="h-4 w-4" /> Instalar Timer Flag
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                No Chrome ou no Edge: menu <span className="font-medium text-foreground">⋮</span> › Instalar Timer Flag.
              </p>
            )}
          </Secao>

          {ausencia !== 'sem_suporte' && (
            <Secao titulo="Pausar quando eu sair">
              {ausencia === 'ligada' ? (
                <p className="flex items-center gap-2 text-sm text-[hsl(var(--success))]">
                  <CheckCircle2 className="h-4 w-4" /> Ligado: tela bloqueada ou 30 min sem uso pausam o timer.
                </p>
              ) : ausencia === 'negada' ? (
                <p className="text-sm text-muted-foreground">Permissão negada no navegador (cadeado na barra de endereço).</p>
              ) : (
                <Button variant="outline" onClick={() => void pedirAusencia()} className="gap-2">
                  <UserX className="h-4 w-4" /> Permitir detectar ausência
                </Button>
              )}
            </Secao>
          )}

          <Secao titulo="App para o computador">
            <div className="grid gap-3 sm:grid-cols-3">
              {downloads.map((d) => {
                const url = urlDownload(d, base, pasta);
                const recomendado = d.plataforma === plataforma;
                const conteudo = (
                  <>
                    <IconeSistema plataforma={d.plataforma} className="h-9 w-9" />
                    <div className="space-y-0.5 text-center">
                      <p className="font-semibold">{d.rotulo}</p>
                      <p className="text-xs text-muted-foreground">{d.formato}</p>
                    </div>
                    {recomendado && <Badge className="bg-flag-gold text-flag-navy hover:bg-flag-gold">Para o seu sistema</Badge>}
                    {!url && <Badge variant="outline">Em breve</Badge>}
                  </>
                );
                const classe = cn(
                  'flex h-full flex-col items-center gap-2.5 rounded-xl border p-4 transition-colors',
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
                      target="_blank"
                      rel="noopener noreferrer"
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
          </Secao>
        </div>
      </DialogContent>
    </Dialog>
  );
}
