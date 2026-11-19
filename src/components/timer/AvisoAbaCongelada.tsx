import { useEffect, useMemo, useState } from 'react';
import { Bell, ChevronRight, Copy, Globe, Monitor, Snowflake } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useTimerEstado } from '@/hooks/useTimerRelogio';
import { registrarEventoTimer } from '@/hooks/useTimerAcesso';
import { IconeNavegador } from '@/components/timer/IconesNavegador';
import { detectarCliente, detectarPlataforma, ehCelular } from '@/lib/timerAcesso';
import { DOWNLOADS_TIMER, ordenarDownloads, urlDownload } from '@/lib/timerDownloads';
import { aoMudarInstalacao, instalarPwa, podeInstalar, rodandoInstalado } from '@/lib/timerPwa';
import {
  CHAVE_CORTE_VISTO,
  CHAVE_LIDO,
  CHAVE_NAO_EXIBIR,
  CHAVE_SESSAO_VISTO,
  detectarNavegador,
  INSTRUCOES_NAVEGADOR,
  instrucaoDe,
  motivoParaAbrir,
  ultimoCorteSemSinal,
  type InstrucaoNavegador,
} from '@/lib/timerAbaCongelada';

// O storage pode faltar (janela anônima, site bloqueado): o aviso segue sem ele.
function ler(s: () => Storage, chave: string): string | null {
  try {
    return s().getItem(chave);
  } catch {
    return null;
  }
}
function gravar(s: () => Storage, chave: string, valor: string | null) {
  try {
    if (valor === null) s().removeItem(chave);
    else s().setItem(chave, valor);
  } catch {
    /* sem storage: só não lembra */
  }
}
const local = () => window.localStorage;
const sessao = () => window.sessionStorage;

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success('Copiado.');
  } catch {
    toast.error('Não deu para copiar. Selecione o texto e copie.');
  }
}

function BotaoCopiar({ texto, className }: { texto: string; className?: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('h-7 w-7 shrink-0', className)}
      onClick={() => void copiar(texto)}
      aria-label={`Copiar ${texto}`}
    >
      <Copy className="h-3.5 w-3.5" />
    </Button>
  );
}

const ehBrave = () => typeof navigator !== 'undefined' && 'brave' in navigator;

const OPCAO =
  'flex h-auto flex-col items-center gap-1.5 rounded-xl border bg-transparent px-2 py-4 text-sm font-normal hover:border-flag-gold hover:bg-flag-gold/10 [&_svg]:size-6';

/** O passo a passo do navegador escolhido: o endereço para copiar e os passos. */
function PassoAPasso({ instrucao, site }: { instrucao: InstrucaoNavegador; site: string }) {
  return (
    <div className="space-y-2.5 rounded-xl border p-3">
      <div className="flex items-center gap-1 rounded-md border bg-muted/40 py-0.5 pl-2.5 pr-0.5">
        <code className="flex-1 select-all truncate font-mono text-xs">{instrucao.endereco}</code>
        <BotaoCopiar texto={instrucao.endereco} />
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed">
        {instrucao.passos.map((p) => (
          <li key={p}>
            {p
              .replace('{site}', `\`${site}\``)
              .split('`')
              .map((parte, i) =>
                i % 2 === 0 ? (
                  parte
                ) : (
                  <span key={i} className="inline-flex items-center">
                    <code className="rounded bg-muted px-1 font-mono text-xs">{parte}</code>
                    {parte === site && <BotaoCopiar texto={site} className="h-6 w-6" />}
                  </span>
                ),
              )}
          </li>
        ))}
      </ol>
      {instrucao.observacao && <p className="text-xs text-muted-foreground">{instrucao.observacao}</p>}
    </div>
  );
}

/**
 * "O navegador pode pausar o seu timer" (mock aprovado pelo Igor em
 * 19/11/2026): instalar (app web ou app para PC) ou configurar o navegador,
 * com o passo a passo aberto só ao clicar no logo. Abre sozinho numa aba
 * comum (ver motivoParaAbrir) até a pessoa marcar "Não exibir novamente".
 * Fica guardado no sino de notificações, à esquerda do Sair (pedido do Igor):
 * o ponto no sino some depois que a pessoa abre o aviso. Some no app
 * desktop, no app web instalado e no celular.
 */
export function AvisoAbaCongelada({ className }: { className?: string }) {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const noDesktop = detectarCliente(ua, '/timer') === 'desktop';
  const instalado = rodandoInstalado();
  // no celular o Timer é só consulta: não há timer de aba para congelar
  const abaComum = !noDesktop && !instalado && !ehCelular(ua);

  const estadoQ = useTimerEstado(1, abaComum);
  const estado = estadoQ.data ?? null;

  const [aberto, setAberto] = useState(false);
  const [sino, setSino] = useState(false);
  const [lido, setLido] = useState(() => ler(local, CHAVE_LIDO) === '1');
  const [naoExibir, setNaoExibir] = useState(() => ler(local, CHAVE_NAO_EXIBIR) === '1');
  const [escolhido, setEscolhido] = useState<InstrucaoNavegador['id'] | null>(null);
  const [instalavel, setInstalavel] = useState(podeInstalar());
  useEffect(() => aoMudarInstalacao(() => setInstalavel(podeInstalar())), []);

  const abrir = (v: boolean) => {
    setAberto(v);
    if (!v) return;
    setEscolhido(null);
    setLido(true);
    gravar(local, CHAVE_LIDO, '1');
  };

  const corte = useMemo(() => (estado ? ultimoCorteSemSinal(estado.trechos) : null), [estado]);
  const rodando = (estado?.rodandoTodos.length ?? 0) > 0;

  useEffect(() => {
    if (!estado || aberto) return;
    const m = motivoParaAbrir({
      abaComum,
      naoExibir,
      corte,
      corteVisto: ler(local, CHAVE_CORTE_VISTO),
      rodando,
      vistoNaSessao: ler(sessao, CHAVE_SESSAO_VISTO) === '1',
    });
    if (!m) return;
    // marca na hora: não reabre na próxima resposta do servidor
    if (corte) gravar(local, CHAVE_CORTE_VISTO, corte.id);
    gravar(sessao, CHAVE_SESSAO_VISTO, '1');
    abrir(true);
  }, [estado, aberto, abaComum, naoExibir, corte, rodando]);

  if (!abaComum) return null;

  const plataforma = detectarPlataforma(ua);
  const download = ordenarDownloads(DOWNLOADS_TIMER, plataforma)[0];
  const urlApp = urlDownload(
    download,
    import.meta.env.VITE_TIMER_DOWNLOAD_BASE_URL as string | undefined,
    import.meta.env.VITE_TIMER_DOWNLOAD_URL as string | undefined,
  );
  const site = typeof window !== 'undefined' ? window.location.host : 'flaghub.flag.com.br';
  const meu = detectarNavegador(ua, ehBrave());
  const appWebPossivel = meu !== 'outro' && instrucaoDe(meu).instalaAppWeb;

  const mudarNaoExibir = (v: boolean) => {
    setNaoExibir(v);
    gravar(local, CHAVE_NAO_EXIBIR, v ? '1' : null);
  };
  const instalarWeb = async () => {
    if (!appWebPossivel) {
      toast.info('O app web instala pelo Chrome, Edge ou Brave.');
      return;
    }
    if (!instalavel) {
      toast.info('No menu ⋮ do navegador, escolha "Instalar Timer Flag".');
      return;
    }
    if (await instalarPwa()) {
      toast.success('Timer Flag instalado. Ele abre na própria janela.');
      setAberto(false);
    }
  };
  const instrucao = escolhido ? instrucaoDe(escolhido) : null;

  return (
    <>
      <Popover open={sino} onOpenChange={setSino}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className={cn('relative', className)} aria-label="Notificações">
            <Bell className="h-4 w-4" />
            {!lido && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-flag-gold" aria-hidden />}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-1.5">
          <p className="px-2 pb-1.5 pt-1 text-xs font-semibold text-muted-foreground">Notificações</p>
          <button
            type="button"
            onClick={() => {
              setSino(false);
              abrir(true);
            }}
            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted"
          >
            <Snowflake className="h-5 w-5 shrink-0 text-sky-500" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Como evitar pausas</span>
              <span className="block text-xs text-muted-foreground">O navegador pode pausar o timer da aba.</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverContent>
      </Popover>
      <Dialog open={aberto} onOpenChange={abrir}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Snowflake className="h-5 w-5 text-sky-500" />O navegador pode pausar o seu timer
            </DialogTitle>
            <DialogDescription>
              Abas em segundo plano são congeladas para poupar memória. Para o timer não parar sozinho, use o app ou
              ajuste o navegador.
            </DialogDescription>
          </DialogHeader>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Instalar</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <Button variant="ghost" className={OPCAO} onClick={() => void instalarWeb()}>
                <Globe className="h-6 w-6" />
                App web
                <span className="text-[11px] text-muted-foreground">pelo navegador</span>
              </Button>
              {urlApp ? (
                <Button asChild variant="ghost" className={OPCAO}>
                  <a
                    href={urlApp}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      void registrarEventoTimer('baixou_instalador', {
                        plataforma: download.plataforma,
                        origem: 'aviso_aba',
                      })
                    }
                  >
                    <Monitor className="h-6 w-6" />
                    App para PC
                    <span className="text-[11px] text-muted-foreground">{download.rotulo}</span>
                  </a>
                </Button>
              ) : (
                <div
                  className={cn(OPCAO, 'cursor-not-allowed opacity-60 hover:border-border hover:bg-transparent')}
                  aria-disabled
                >
                  <Monitor className="h-6 w-6" />
                  App para PC
                  <span className="text-[11px] text-muted-foreground">em breve</span>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Ou configure o navegador</h3>
            <div className="grid grid-cols-4 gap-1.5">
              {INSTRUCOES_NAVEGADOR.map((i) => (
                <Button
                  key={i.id}
                  variant="ghost"
                  aria-expanded={escolhido === i.id}
                  onClick={() => setEscolhido((e) => (e === i.id ? null : i.id))}
                  className={cn(
                    'flex h-auto flex-col items-center gap-1 border border-transparent px-1 py-2.5 text-xs font-normal text-muted-foreground [&_svg]:size-7',
                    escolhido === i.id && 'border-border bg-muted text-foreground',
                  )}
                >
                  <IconeNavegador id={i.id} className="h-7 w-7" />
                  <span className="leading-tight">{i.rotulo}</span>
                  {/* a linha existe em todos, para os quatro ficarem da mesma altura */}
                  <span className="h-3 text-[10px] leading-3 text-flag-gold">{meu === i.id ? 'o seu' : ''}</span>
                </Button>
              ))}
            </div>
            {instrucao ? (
              <PassoAPasso instrucao={instrucao} site={site} />
            ) : (
              <p className="text-xs text-muted-foreground">Toque no seu navegador para ver o passo a passo.</p>
            )}
          </section>

          <DialogFooter className="flex-row items-center justify-between gap-3 border-t pt-4 sm:justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={naoExibir} onCheckedChange={(v) => mudarNaoExibir(v === true)} />
              Não exibir novamente
            </label>
            <Button onClick={() => setAberto(false)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
