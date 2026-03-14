import { useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Monitor, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { HubFusionAnimation } from '@/components/auth/HubFusionAnimation';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signInWithAzure, isLoading } = useAuth();
  
  const [loginData, setLoginData] = useState({ email: '', password: '', rememberMe: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAzureLoading, setIsAzureLoading] = useState(false);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const attemptsRef = useRef(0);
  const lockoutTimerRef = useRef<number | null>(null);

  const from = (location.state as { from?: string })?.from || '/home';

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
      // Se não houver erro, o usuário será redirecionado para o Azure
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

    try {
      // Call rate-limited login endpoint
      let fnData: Record<string, unknown> | null = null;
      let fnErrorMsg = '';

      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-rate-limit`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ email: loginData.email, password: loginData.password }),
          }
        );
        fnData = await res.json();
        if (!res.ok) {
          fnErrorMsg = fnData?.message as string || 'Credenciais inválidas';
        }
      } catch (networkErr) {
        toast.error('Erro de rede ao tentar fazer login');
        return;
      }

      if (fnData?.error) {
        if (fnData.error === 'rate_limited') {
          const retryAfter = (fnData.retry_after as number) || LOCKOUT_SECONDS;
          const until = Date.now() + retryAfter * 1000;
          startLockoutTimer(until);
          toast.error('Conta temporariamente bloqueada', {
            description: `Muitas tentativas falharam. Aguarde ${retryAfter} segundos.`,
            icon: <ShieldAlert className="h-4 w-4" />,
          });
        } else {
          attemptsRef.current += 1;
          const remaining = (fnData.remaining_attempts as number) ?? (MAX_ATTEMPTS - attemptsRef.current);
          toast.error('Erro no login', {
            description: `${fnErrorMsg || 'Credenciais inválidas'}. ${remaining} tentativa(s) restante(s).`,
          });
        }
      } else if (fnData?.session) {
        const session = fnData.session as { access_token: string; refresh_token: string };
        // Set session from the edge function response
        await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
        attemptsRef.current = 0;
        toast.success('Login realizado com sucesso!');

        // Check if user has elevated role → force MFA before navigating
        try {
          const { data: maskedCode } = await supabase.rpc("auth_user_role_masked");
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
      toast.error('Erro inesperado ao fazer login');
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
        <CardHeader className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-primary">
              <Monitor className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold text-primary">FLAG</span>
          </div>
          <CardTitle>FLAG Hub</CardTitle>
          
          {/* Animated Hub Fusion */}
          <HubFusionAnimation />
          
          <CardDescription>
            Central de KPIs e Dashboards Setoriais
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Botão SSO Microsoft */}
          <Button 
            variant="outline" 
            className="w-full mb-4 h-11"
            onClick={handleAzureLogin}
            disabled={isAzureLoading}
          >
            {isAzureLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <svg className="h-5 w-5 mr-2" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
              </svg>
            )}
            Entrar com Microsoft
          </Button>
          
          {/* Separador */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">ou</span>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
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
                  <Label htmlFor="login-password">Senha</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginData.password}
                    onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                    required
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="remember-me" className="text-sm font-normal cursor-pointer">
                    Manter conectado por 15 dias
                  </Label>
                  <Switch
                    id="remember-me"
                    checked={loginData.rememberMe}
                    onCheckedChange={(checked) => 
                      setLoginData(prev => ({ ...prev, rememberMe: checked }))
                    }
                  />
                </div>
                {isLockedOut() && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                    <span>Bloqueado por {remainingSeconds}s — muitas tentativas falharam.</span>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={isSubmitting || isLockedOut()}>
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

          <p className="text-xs text-muted-foreground text-center mt-6">
            Ao continuar, você concorda com os termos de uso e política de privacidade.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
