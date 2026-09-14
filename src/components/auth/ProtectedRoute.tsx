import { ReactNode, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AppRole } from '@/types/database';
import { isMonitorBlockedRoute } from '@/lib/monitorUser';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRoles?: AppRole[];
}

const LOADING_TIMEOUT_MS = 12000;

/**
 * O que fazer quando o spinner passa de LOADING_TIMEOUT_MS:
 *   • sem sessão → força logout e manda para /login (comportamento original);
 *   • com sessão → a hidratação só está lenta (3,5 s + 1 s + 6 s de tentativas,
 *     mais a contagem de hub_area_members sem timeout). Limpar o storage aqui
 *     derrubava um login válido — e o telão, sem operador, não voltava mais.
 *     A sessão fica; o monitor passa a exibir e o usuário comum segue barrado
 *     (MFA e aprovação ainda não foram decididos) com saída manual.
 */
type Esgotado = 'nao' | 'sem-sessao' | 'hidratacao-lenta';

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, role, signOut, mfaRequired, pendingApproval, isMonitor } = useAuth();
  const location = useLocation();
  const [esgotado, setEsgotado] = useState<Esgotado>('nao');
  const timeoutRef = useRef<number | null>(null);
  // O timer é armado quando isLoading vira true, e a sessão costuma chegar depois
  // disso. Ler pelo ref evita decidir com o isAuthenticated do render que armou.
  const temSessaoRef = useRef(isAuthenticated);

  useEffect(() => {
    temSessaoRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!isLoading) {
      setEsgotado('nao');
      return;
    }

    timeoutRef.current = window.setTimeout(() => {
      if (!temSessaoRef.current) {
        console.warn('[Auth] ProtectedRoute loading timeout without session; forcing logout');
        setEsgotado('sem-sessao');
        void signOut();
        return;
      }
      console.warn('[Auth] ProtectedRoute loading timeout with session; keeping session, hydration still running');
      setEsgotado('hidratacao-lenta');
    }, LOADING_TIMEOUT_MS);

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isLoading, signOut]);

  if (esgotado === 'sem-sessao') {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname, reason: 'auth_timeout' }}
        replace
      />
    );
  }

  // Monitor: isento de MFA e com áreas liberadas, então não há decisão pendente
  // que justifique segurar a TV. Exibe já; papel e rede entram quando a
  // hidratação terminar.
  const liberaMonitor = esgotado === 'hidratacao-lenta' && isAuthenticated && isMonitor;

  if (isLoading && !liberaMonitor) {
    if (esgotado === 'hidratacao-lenta' && isAuthenticated) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-sm space-y-4 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Seu acesso está demorando para carregar. A sessão continua ativa — não é preciso entrar de novo.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => window.location.reload()}>
                Tentar novamente
              </Button>
              <Button variant="ghost" onClick={() => void signOut()}>
                Sair
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // MFA enforcement for admins
  if (mfaRequired && location.pathname !== '/mfa') {
    return <Navigate to="/mfa" replace />;
  }

  // Pending approval: user authenticated but no role assigned yet
  if (pendingApproval && location.pathname !== '/pending-approval') {
    return <Navigate to="/pending-approval" replace />;
  }

  // Monitor user: block restricted routes, redirect to /home (Kiosk)
  if (isMonitor && isMonitorBlockedRoute(location.pathname)) {
    return <Navigate to="/home" replace />;
  }

  // Verificar roles se especificados
  if (requiredRoles && requiredRoles.length > 0) {
    if (!role || !requiredRoles.includes(role)) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
