import { useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Monitor, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { FusionText } from '@/components/auth/FusionText';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signUp, signInWithAzure, isLoading } = useAuth();
  
  const [loginData, setLoginData] = useState({ email: '', password: '', rememberMe: false });
  const [signupData, setSignupData] = useState({ email: '', password: '', fullName: '' });
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
      const { data, error } = await signIn(loginData.email, loginData.password);
      
      if (error) {
        attemptsRef.current += 1;
        
        if (attemptsRef.current >= MAX_ATTEMPTS) {
          const until = Date.now() + LOCKOUT_SECONDS * 1000;
          startLockoutTimer(until);
          toast.error('Conta temporariamente bloqueada', {
            description: `Muitas tentativas falharam. Aguarde ${LOCKOUT_SECONDS} segundos.`,
            icon: <ShieldAlert className="h-4 w-4" />,
          });
        } else {
          const remaining = MAX_ATTEMPTS - attemptsRef.current;
          toast.error('Erro no login', {
            description: `${error.message}. ${remaining} tentativa(s) restante(s).`,
          });
        }
      } else {
        attemptsRef.current = 0;
        toast.success('Login realizado com sucesso!');
        navigate(from, { replace: true });
      }
    } catch (err) {
      toast.error('Erro inesperado ao fazer login');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { error } = await signUp(
        signupData.email, 
        signupData.password, 
        signupData.fullName
      );
      
      if (error) {
        toast.error('Erro no cadastro', { description: error.message });
      } else {
        toast.success('Cadastro realizado!', { 
          description: 'Verifique seu email para confirmar a conta.' 
        });
      }
    } catch (err) {
      toast.error('Erro inesperado ao criar conta');
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
          <CardTitle>Painel Operacional</CardTitle>
          
          {/* Animated Fusion Text */}
          <FusionText />
          
          <CardDescription>
            Acesse sua conta para gerenciar tickets e ordens de serviço
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

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 mt-4">
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
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Entrando...
                    </>
                  ) : (
                    'Entrar'
                  )}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Nome Completo</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Seu nome"
                    value={signupData.fullName}
                    onChange={(e) => setSignupData(prev => ({ ...prev, fullName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={signupData.email}
                    onChange={(e) => setSignupData(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Senha</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={signupData.password}
                    onChange={(e) => setSignupData(prev => ({ ...prev, password: e.target.value }))}
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Cadastrando...
                    </>
                  ) : (
                    'Criar Conta'
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Ao continuar, você concorda com os termos de uso e política de privacidade.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
