import { useEffect, useMemo, useState } from 'react';
import { AppWindow, CheckCircle2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { registrarEventoTimer } from '@/hooks/useTimerAcesso';
import { IconeSistema } from '@/components/timer/IconesSistema';
import { detectarCliente, detectarPlataforma } from '@/lib/timerAcesso';
import { DOWNLOADS_TIMER, ordenarDownloads, urlDownload } from '@/lib/timerDownloads';
import { aoMudarInstalacao, instalarPwa, podeInstalar, rodandoInstalado } from '@/lib/timerPwa';

const CARD = 'flex h-full flex-col items-center gap-2.5 rounded-xl border bg-card p-4 transition-colors';

/**
 * O mesmo Timer instalado pelo próprio navegador (PWA, Chrome/Edge): janela
 * própria, sem instalador. Fica ao lado dos sistemas, no mesmo formato.
 */
function CardNavegador({ instalado, instalavel, onInstalar }: { instalado: boolean; instalavel: boolean; onInstalar: () => void }) {
  const conteudo = (
    <>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
        <AppWindow className="h-5 w-5 text-foreground/80" />
      </div>
      <div className="space-y-0.5 text-center">
        <p className="font-semibold">Navegador</p>
        <p className="text-xs text-muted-foreground">Chrome ou Edge</p>
      </div>
      {instalado ? (
        <Badge variant="outline" className="gap-1 border-[hsl(var(--success))]/40 text-[hsl(var(--success))]">
          <CheckCircle2 className="h-3 w-3" /> Instalado
        </Badge>
      ) : instalavel ? (
        <Badge variant="outline">Instalar</Badge>
      ) : (
        <p className="text-center text-[11px] leading-tight text-muted-foreground">Menu ⋮ › Instalar</p>
      )}
    </>
  );
  return instalavel && !instalado ? (
    <Button variant="ghost" onClick={onInstalar} className={cn(CARD, 'h-auto font-normal hover:border-flag-gold hover:bg-flag-gold/10')}>
      {conteudo}
    </Button>
  ) : (
    <div className={CARD}>{conteudo}</div>
  );
}

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
 *   • instalar pelo navegador (PWA, Chrome/Edge): janela própria, sem instalador;
 *   • o app para o computador (Electron), baixado da pasta do SharePoint.
 * Some dentro do próprio app desktop.
 *
 * Sem o pedido de "detectar ausência" (decisão do Igor, 17/11/2026): o
 * anti-boicote não depende dele (servidor: sinal, presença e tetos; app
 * desktop: pausa pelo sistema). Quem já tinha dado a permissão segue com a
 * pausa antecipada no navegador (useMotorTimer).
 */
export function BaixarApp({ className }: { className?: string }) {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const plataforma = detectarPlataforma(ua);
  const noDesktop = detectarCliente(ua, '/timer') === 'desktop';
  const base = import.meta.env.VITE_TIMER_DOWNLOAD_BASE_URL as string | undefined;
  const pasta = import.meta.env.VITE_TIMER_DOWNLOAD_URL as string | undefined;
  const downloads = useMemo(() => ordenarDownloads(DOWNLOADS_TIMER, plataforma), [plataforma]);

  const [instalavel, setInstalavel] = useState(podeInstalar());

  useEffect(() => aoMudarInstalacao(() => setInstalavel(podeInstalar())), []);

  if (noDesktop) return null;

  const instalar = async () => {
    if (await instalarPwa()) toast.success('Timer Flag instalado. Ele abre na própria janela.');
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
          <Secao titulo="Instalar">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <CardNavegador instalado={rodandoInstalado()} instalavel={instalavel} onInstalar={() => void instalar()} />
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
                    {recomendado && <Badge className="bg-flag-gold text-flag-navy hover:bg-flag-gold">Seu sistema</Badge>}
                    {!url && <Badge variant="outline">Em breve</Badge>}
                  </>
                );
                const classe = cn(CARD, recomendado && 'border-flag-gold/60 bg-flag-gold/5');
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
