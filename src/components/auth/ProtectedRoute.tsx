import { ReactNode, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import type { AppRole } from '@/types/database';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRoles?: AppRole[];
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, role, signOut, mfaRequired } = useAuth();
  const location = useLocation();
  const [isStuck, setIsStuck] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!isLoading) {
      setIsStuck(false);
      return;
    }

    timeoutRef.current = window.setTimeout(() => {
      console.warn('[Auth] ProtectedRoute loading timeout; forcing logout');
      setIsStuck(true);
      void signOut();
    }, 12000);

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isLoading, signOut]);

  if (isStuck) {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname, reason: 'auth_timeout' }}
        replace
      />
    );
  }

  if (isLoading) {
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

  // Verificar roles se especificados
  if (requiredRoles && requiredRoles.length > 0) {
    if (!role || !requiredRoles.includes(role)) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
