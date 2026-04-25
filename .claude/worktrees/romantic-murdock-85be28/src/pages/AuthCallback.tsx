import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

/**
 * Handles OAuth callback redirects (e.g. Azure SSO).
 * Supabase appends #access_token=... to the URL after OAuth.
 * This page waits for the session to be established, then redirects to /home.
 */
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Small delay to let AuthContext hydrate
        setTimeout(() => {
          navigate('/home', { replace: true });
        }, 300);
      }
    });

    // Fallback: if no auth event fires within 10s, redirect to login
    const timeout = setTimeout(() => {
      navigate('/login', { replace: true });
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Autenticando...</p>
    </div>
  );
}
