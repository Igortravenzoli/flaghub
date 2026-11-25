import { ReactNode, useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2, ShieldX, Timer as TimerIcon, RefreshCw, Maximize2 } from 'lucide-react';
import { PilulaMini, BotaoMini, useFundoTransparente } from '@/components/timer/PilulaMini';
import { ponteDesktop } from '@/lib/timerDesktop';
import { useAuth } from '@/hooks/useAuth';
import { useAtivarTimer, useTimerAcesso } from '@/hooks/useTimerAcesso';
import { useVincularDevops } from '@/hooks/useTimerVinculoDevops';
import { estadoAcesso, guardarDestino } from '@/lib/timerAcesso';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Guard das rotas do Timer Flag (/timer e /timer/widget).
 *
 * Fica FORA do ProtectedRoute de propósito: quem tem só o Timer é "pendente"
 * para o hub e o ProtectedRoute o mandaria para /pending-approval. Aqui a
 * régua é outra: autenticado + linha ativa em timer_access. A segurança de
 * verdade é a RLS — este guard só decide o que a tela mostra.
 */
export function TimerRoute({ children, compacto = false }: { children: ReactNode; compacto?: boolean }) {
  const { isAuthenticated, isLoading, isMonitor, mfaRequired } = useAuth();
  const location = useLocation();
  const acesso = useTimerAcesso();
  // Só na janela completa e com o Timer ativo: entrega à edge o vínculo com o
  // Azure DevOps deste login (inerte com o recurso desligado).
  useVincularDevops(!compacto && isAuthenticated && !isMonitor && acesso.data?.status === 'ativo');

  // Mini timer (/timer/widget): cabe numa pílula. Nada de cartão, login ou
  // ativação ali; tudo o que não for "rodar o timer" abre a janela completa.
  if (compacto) {
    const estado = estadoAcesso({ carregando: acesso.isLoading, linha: acesso.data });
    if (isLoading || (isAuthenticated && estado.tipo === 'carregando' && !acesso.isError)) {
      return <AvisoMini texto="Timer Flag" />;
    }
    if (isAuthenticated && !isMonitor && !mfaRequired && estado.tipo === 'ativo') return <>{children}</>;
    if (acesso.isError && acesso.data === undefined) {
      return <AvisoMini texto="Sem conexão" acao={{ titulo: 'Tentar de novo', fazer: () => void acesso.refetch() }} />;
    }
    return <AvisoMini texto="Abra o Timer para entrar" />;
  }

  if (isLoading) return <Carregando />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  // A conta do telão é só leitura do kiosk: não marca hora de ninguém.
  if (isMonitor) return <Navigate to="/home" replace />;
  if (mfaRequired) return <Navigate to="/mfa" replace />;

  // Erro só quando não há nenhum acesso conhecido: com o último confirmado na
  // mão, a tela segue e a conferência tenta de novo por trás.
  if (acesso.isError && acesso.data === undefined) {
    return (
      <Centro>
        <p className="text-sm text-muted-foreground">Não foi possível conferir seu acesso ao Timer.</p>
        <Button variant="outline" className="gap-2" onClick={() => void acesso.refetch()}>
          <RefreshCw className="h-4 w-4" /> Tentar de novo
        </Button>
      </Centro>
    );
  }

  const estado = estadoAcesso({ carregando: acesso.isLoading, linha: acesso.data });
  if (estado.tipo === 'carregando') return <Carregando />;
  if (estado.tipo === 'ativo') return <>{children}</>;
  return <AtivacaoTimer revogado={estado.tipo === 'revogado'} motivoRevogacao={acesso.data?.motivo_revogacao ?? null} />;
}

/** Motivos em que a saída é entrar de novo pelo SSO Microsoft. */
const PEDE_SSO = new Set(['sem_identidade_microsoft', 'sessao_nao_veio_do_sso']);

function AtivacaoTimer({ revogado, motivoRevogacao }: { revogado: boolean; motivoRevogacao: string | null }) {
  const { user, signOut, signInWithAzure } = useAuth();
  const location = useLocation();
  const ativar = useAtivarTimer();
  const disparou = useRef(false);

  const veioDoSso = (user?.app_metadata?.providers as string[] | undefined)?.includes('azure')
    || user?.app_metadata?.provider === 'azure';

  // Aprovação automática: quem chegou pelo SSO não precisa clicar em nada.
  useEffect(() => {
    if (revogado || !veioDoSso || disparou.current) return;
    disparou.current = true;
    ativar.mutate();
  }, [revogado, veioDoSso, ativar]);

  const entrarComMicrosoft = async () => {
    guardarDestino(location.pathname);
    await signOut();
    await signInWithAzure();
  };

  if (revogado) {
    return (
      <Centro>
        <ShieldX className="h-10 w-10 text-destructive" />
        <CardTitle className="text-lg">Acesso ao Timer revogado</CardTitle>
        <CardDescription>
          Um administrador revogou seu acesso ao Timer Flag.
          {motivoRevogacao ? ` Motivo: ${motivoRevogacao}` : ''}
        </CardDescription>
      </Centro>
    );
  }

  const r = ativar.data;
  const recusado = r && !r.ok;

  if (!veioDoSso || (recusado && PEDE_SSO.has(r.motivo ?? ''))) {
    return (
      <Centro>
        <TimerIcon className="h-10 w-10 text-primary" />
        <CardTitle className="text-lg">Timer Flag</CardTitle>
        <CardDescription>
          {recusado && r?.mensagem ? r.mensagem : 'O Timer libera na hora para quem entra com a conta Microsoft da Flag.'}
        </CardDescription>
        <Button className="gap-2" onClick={() => void entrarComMicrosoft()}>
          Entrar com Microsoft
        </Button>
      </Centro>
    );
  }

  if (recusado) {
    return (
      <Centro>
        <ShieldX className="h-10 w-10 text-destructive" />
        <CardTitle className="text-lg">Não foi possível liberar o Timer</CardTitle>
        <CardDescription>{r?.mensagem ?? 'Tente de novo em instantes.'}</CardDescription>
        <Button variant="outline" className="gap-2" onClick={() => ativar.mutate()} disabled={ativar.isPending}>
          <RefreshCw className="h-4 w-4" /> Tentar de novo
        </Button>
      </Centro>
    );
  }

  return (
    <Centro>
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Liberando o Timer para a sua conta…</p>
    </Centro>
  );
}

function AvisoMini({ texto, acao }: { texto: string; acao?: { titulo: string; fazer: () => void } }) {
  useFundoTransparente();
  return (
    <PilulaMini>
      <span className="h-2 w-2 shrink-0 rounded-full bg-white/30" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/70">{texto}</span>
      {acao && (
        <BotaoMini titulo={acao.titulo} onClick={acao.fazer}>
          <RefreshCw className="h-3.5 w-3.5" />
        </BotaoMini>
      )}
      {ponteDesktop() && (
        <BotaoMini titulo="Abrir o Timer" onClick={() => ponteDesktop()?.abrirCompleto()}>
          <Maximize2 className="h-3.5 w-3.5" />
        </BotaoMini>
      )}
    </PilulaMini>
  );
}

function Carregando() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function Centro({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="sr-only">
          <CardTitle>Timer Flag</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">{children}</CardContent>
      </Card>
    </div>
  );
}
