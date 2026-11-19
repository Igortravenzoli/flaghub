import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, AppWindow, Copy, Download, Snowflake } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useTimerEstado } from '@/hooks/useTimerRelogio';
import { registrarEventoTimer } from '@/hooks/useTimerAcesso';
import { IconeNavegador } from '@/components/timer/IconesNavegador';
import { detectarCliente, detectarPlataforma, ehCelular } from '@/lib/timerAcesso';
import { DOWNLOADS_TIMER, ordenarDownloads, urlDownload } from '@/lib/timerDownloads';
import { aoMudarInstalacao, instalarPwa, podeInstalar, rodandoInstalado } from '@/lib/timerPwa';
import { horaCurta } from '@/lib/timerRelogio';
import {
  CHAVE_CORTE_VISTO,
  CHAVE_NAO_EXIBIR,
  CHAVE_SESSAO_VISTO,
  detectarNavegador,
  INSTRUCOES_NAVEGADOR,
  instrucaoDe,
  motivoParaAbrir,
  ultimoCorteSemSinal,
  type InstrucaoNavegador,
  type MotivoAviso,
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

function Copiavel({ texto }: { texto: string }) {
  return (
    <div className="flex items-center gap-1 rounded-md border bg-muted/50 py-0.5 pl-2.5 pr-0.5">
      <code className="flex-1 select-all truncate font-mono text-xs">{texto}</code>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void copiar(texto)} aria-label={`Copiar ${texto}`}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

const CARD = 'flex h-full flex-col items-start gap-1.5 rounded-xl border bg-card p-3 text-left';

/**
 * "O navegador pode pausar o seu timer": explica o congelamento da aba e
 * oferece as saídas (app web, app desktop ou configurar o navegador). Abre
 * sozinho numa aba comum (ver motivoParaAbrir) até a pessoa marcar "Não
 * exibir novamente"; o botão no topo reabre quando quiser. Some no app
 * desktop e no app web instalado, que não congelam como aba.
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
  const [motivo, setMotivo] = useState<MotivoAviso | null>(null);
  const [naoExibir, setNaoExibir] = useState(() => ler(local, CHAVE_NAO_EXIBIR) === '1');
  const [navegador, setNavegador] = useState<InstrucaoNavegador['id']>(() => instrucaoDe(detectarNavegador(ua)).id);
  const [instalavel, setInstalavel] = useState(podeInstalar());
  useEffect(() => aoMudarInstalacao(() => setInstalavel(podeInstalar())), []);

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
    setMotivo(m);
    setAberto(true);
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
  const atual = instrucaoDe(detectarNavegador(ua)).id;
  const instrucao = instrucaoDe(navegador);
  const appWebPossivel = instrucaoDe(detectarNavegador(ua)).instalaAppWeb;

  const mudarNaoExibir = (v: boolean) => {
    setNaoExibir(v);
    gravar(local, CHAVE_NAO_EXIBIR, v ? '1' : null);
  };
  const instalar = async () => {
    if (await instalarPwa()) {
      toast.success('Timer Flag instalado. Ele abre na própria janela.');
      setAberto(false);
    }
  };
  const abrirManual = (v: boolean) => {
    setAberto(v);
    if (v) setMotivo(null);
  };

  return (
    <Dialog open={aberto} onOpenChange={abrirManual}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className={cn('gap-2', className)} title="O navegador pode pausar o timer">
          <Snowflake className="h-4 w-4" />
          <span className="hidden lg:inline">Evitar pausas</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Snowflake className="h-5 w-5 text-sky-500" />O navegador pode pausar o seu timer
          </DialogTitle>
          <DialogDescription>
            Para poupar memória e energia, o navegador congela abas que ficam em segundo plano. A aba congelada para de
            avisar o servidor e, 15 minutos depois, o timer é pausado no último aviso, mesmo que você esteja trabalhando em
            outro programa.
          </DialogDescription>
        </DialogHeader>

        {motivo === 'corte' && corte && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>
              O timer de <strong>#{corte.work_item_id}</strong> parou às <strong>{horaCurta(corte.encerrado_em)}</strong>:
              esta aba ficou sem avisar o servidor.
            </p>
          </div>
        )}

        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Use o Timer fora da aba (recomendado)</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={CARD}>
                <div className="flex items-center gap-2">
                  <AppWindow className="h-4 w-4 text-foreground/80" />
                  <p className="font-semibold">App web</p>
                </div>
                <p className="text-xs text-muted-foreground">Instala pelo próprio navegador, em janela própria. Sem instalador.</p>
                {!appWebPossivel ? (
                  <p className="text-xs text-muted-foreground">Não disponível neste navegador: use Chrome, Edge ou Brave.</p>
                ) : instalavel ? (
                  <Button size="sm" className="mt-auto" onClick={() => void instalar()}>
                    Instalar app web
                  </Button>
                ) : (
                  <p className="mt-auto text-xs">
                    No menu <strong>⋮</strong> do navegador: <strong>Instalar Timer Flag</strong>.
                  </p>
                )}
              </div>
              <div className={CARD}>
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-foreground/80" />
                  <p className="font-semibold">App para o computador</p>
                </div>
                <p className="text-xs text-muted-foreground">Não congela, pausa sozinho ao bloquear a tela e tem o mini timer.</p>
                {urlApp ? (
                  <Button asChild size="sm" variant="outline" className="mt-auto">
                    <a
                      href={urlApp}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => void registrarEventoTimer('baixou_instalador', { plataforma: download.plataforma, origem: 'aviso_aba' })}
                    >
                      Baixar para {download.rotulo}
                    </a>
                  </Button>
                ) : (
                  <Badge variant="outline" className="mt-auto">
                    Em breve
                  </Badge>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Ou configure o navegador para não congelar o Timer</h3>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Navegador">
              {INSTRUCOES_NAVEGADOR.map((i) => (
                <Button
                  key={i.id}
                  role="tab"
                  aria-selected={navegador === i.id}
                  variant="outline"
                  size="sm"
                  onClick={() => setNavegador(i.id)}
                  className={cn('h-9 gap-2', navegador === i.id && 'border-flag-gold bg-flag-gold/10 hover:bg-flag-gold/15')}
                >
                  <IconeNavegador id={i.id} className="h-4 w-4" />
                  {i.rotulo}
                  {atual === i.id && <span className="text-[10px] font-normal text-muted-foreground">· o seu</span>}
                </Button>
              ))}
            </div>
            <div className="space-y-2 rounded-xl border p-3" role="tabpanel">
              <Copiavel texto={instrucao.endereco} />
              <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                {instrucao.passos.map((p) => (
                  <li key={p}>
                    {p
                      .replace('{site}', `\`${site}\``)
                      .split('`')
                      .map((parte, i) =>
                        i % 2 === 1 ? (
                          <code key={i} className="rounded bg-muted px-1 font-mono text-xs">
                            {parte}
                          </code>
                        ) : (
                          parte
                        ),
                      )}
                  </li>
                ))}
              </ol>
              {instrucao.passos.some((p) => p.includes('{site}')) && <Copiavel texto={site} />}
              {instrucao.observacao && <p className="text-xs text-muted-foreground">{instrucao.observacao}</p>}
            </div>
          </section>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-3 sm:justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={naoExibir} onCheckedChange={(v) => mudarNaoExibir(v === true)} />
            Não exibir novamente
          </label>
          <Button onClick={() => setAberto(false)}>Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
