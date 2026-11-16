import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { registrarEventoTimer } from '@/hooks/useTimerAcesso';
import { IconeSistema } from '@/components/timer/IconesSistema';
import { detectarCliente, detectarPlataforma } from '@/lib/timerAcesso';
import { DOWNLOADS_TIMER, ordenarDownloads, urlDownload } from '@/lib/timerDownloads';

/** "Baixar app" no topo do Timer: abre um popup com os instaladores. Some dentro do próprio app. */
export function BaixarApp({ className }: { className?: string }) {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const plataforma = detectarPlataforma(ua);
  const noDesktop = detectarCliente(ua, '/timer') === 'desktop';
  const base = import.meta.env.VITE_TIMER_DOWNLOAD_BASE_URL as string | undefined;
  const downloads = useMemo(() => ordenarDownloads(DOWNLOADS_TIMER, plataforma), [plataforma]);

  if (noDesktop) return null;

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
          <DialogTitle>Baixar o Timer Flag</DialogTitle>
          <DialogDescription>Mesma conta Microsoft. Fica na bandeja do sistema com um widget flutuante.</DialogDescription>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}
