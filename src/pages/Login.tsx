import { useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, ShieldAlert, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { HubFusionAnimation } from '@/components/auth/HubFusionAnimation';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signInWithAzure, isLoading } = useAuth();
  
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAzureLoading, setIsAzureLoading] = useState(false);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [localLoginOpen, setLocalLoginOpen] = useState(false);
  const attemptsRef = useRef(0);
  const lockoutTimerRef = useRef<number | null>(null);

  // Sanitize redirect target — must be an internal path, never an external URL.
  const rawFrom = (location.state as { from?: string })?.from;
  const from =
    typeof rawFrom === 'string' &&
    rawFrom.startsWith('/') &&
    !rawFrom.startsWith('//') &&
    !rawFrom.includes(':')
      ? rawFrom
      : '/home';

  const isLockedOut = useCallback(() => {
    if (!lockoutUntil) return false;
    return Date.now() < lockoutUntil;
  }, [lockoutUntil]);

  const startLockoutTimer = (until: number) => {
    setLockoutUntil(until);
    const tick = () => {
      const remaining = Math.ceil((until - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockoutUntil(null);
        setRemainingSeconds(0);
        attemptsRef.current = 0;
        if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);
        return;
      }
      setRemainingSeconds(remaining);
    };
    tick();
    lockoutTimerRef.current = window.setInterval(tick, 1000);
  };

  const handleAzureLogin = async () => {
    setIsAzureLoading(true);
    try {
      const { error } = await signInWithAzure();
      if (error) {
        toast.error('Erro ao conectar com Microsoft', { description: error.message });
        setIsAzureLoading(false);
      }
    } catch (err) {
      toast.error('Erro inesperado ao conectar com Microsoft');
      setIsAzureLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isLockedOut()) {
      toast.error('Muitas tentativas', {
        description: `Aguarde ${remainingSeconds}s antes de tentar novamente.`,
      });
      return;
    }

    setIsSubmitting(true);

    const rlBase = import.meta.env.VITE_SUPABASE_URL;
    const rlKey  = import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    try {
      // ── Step 1: check rate-limit BEFORE sending credentials anywhere ──────
      let checkData: Record<string, unknown> | null = null;
      try {
        const checkRes = await fetch(`${rlBase}/functions/v1/auth-rate-limit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': rlKey },
          body: JSON.stringify({ action: 'check', email: loginData.email }),
        });
        checkData = await checkRes.json();
      } catch {
        toast.error('Erro de rede ao tentar fazer login');
        return;
      }

      if (checkData?.error === 'rate_limited') {
        const retryAfter = (checkData.retry_after as number) || LOCKOUT_SECONDS;
        startLockoutTimer(Date.now() + retryAfter * 1000);
        toast.error('Conta temporariamente bloqueada', {
          description: `Muitas tentativas falharam. Aguarde ${retryAfter} segundos.`,
          icon: <ShieldAlert className="h-4 w-4" />,
        });
        return;
      }

      // ── Step 2: authenticate directly — password never leaves the browser ──
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginData.email,
        password: loginData.password,
      });

      // ── Step 3: record attempt result (non-blocking) ──────────────────────
      fetch(`${rlBase}/functions/v1/auth-rate-limit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': rlKey },
        body: JSON.stringify({
          action: 'record',
          email: loginData.email,
          success: !authError,
        }),
      }).catch(() => {/* non-critical */});

      if (authError) {
        attemptsRef.current += 1;
        const remaining = Math.max(0, MAX_ATTEMPTS - attemptsRef.current);
        toast.error('Credenciais inválidas', {
          description: remaining > 0
            ? `${remaining} tentativa(s) restante(s).`
            : 'Conta será bloqueada na próxima tentativa.',
        });
        return;
      }

      if (authData.session) {
        attemptsRef.current = 0;
        toast.success('Login realizado com sucesso!');

        try {
          const { data: maskedCode, error: rpcErr } = await supabase.rpc("auth_user_role_masked");
          if (import.meta.env.DEV && rpcErr) {
            console.error('[Login] RPC auth_user_role_masked failed:', rpcErr);
          }
          if (maskedCode === 's1') {
            navigate('/mfa', { replace: true });
          } else {
            navigate(from, { replace: true });
          }
        } catch {
          navigate(from, { replace: true });
        }
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Login] Full error:', err);
      toast.error(`Erro ao fazer login: ${err instanceof Error ? err.message : 'desconhecido'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2 pb-2">
          <HubFusionAnimation />
          <CardDescription>
            Central de KPIs e Dashboards Setoriais
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* SSO Microsoft — Primary */}
          <Button 
            className="w-full h-12 text-base font-semibold gap-3"
            onClick={handleAzureLogin}
            disabled={isAzureLoading}
          >
            {isAzureLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
              </svg>
            )}
            Entrar com Microsoft
          </Button>

          {/* Local login — Collapsible */}
          <Collapsible open={localLoginOpen} onOpenChange={setLocalLoginOpen}>
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center">
                <CollapsibleTrigger asChild>
                  <button className="bg-card px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 rounded-full border border-border/50 hover:border-border">
                    Acesso local
                    <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${localLoginOpen ? 'rotate-180' : ''}`} />
                  </button>
                </CollapsibleTrigger>
              </div>
            </div>

            <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
              <form onSubmit={handleLogin} className="space-y-3 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-sm">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={loginData.email}
                    onChange={(e) => setLoginData(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-sm">Senha</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginData.password}
                    onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                    required
                  />
                </div>
                {isLockedOut() && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                    <span>Bloqueado por {remainingSeconds}s — muitas tentativas falharam.</span>
                  </div>
                )}
                <Button type="submit" variant="secondary" className="w-full" disabled={isSubmitting || isLockedOut()}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Entrando...
                    </>
                  ) : isLockedOut() ? (
                    `Aguarde ${remainingSeconds}s`
                  ) : (
                    'Entrar'
                  )}
                </Button>
              </form>
            </CollapsibleContent>
          </Collapsible>

          <p className="text-xs text-muted-foreground text-center mt-4">
            Ao continuar, você concorda com os termos de uso e política de privacidade.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
