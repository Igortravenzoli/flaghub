import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';
import type { AppRole, Profile } from '@/types/database';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  networkId: number | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    role: null,
    networkId: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Provisionar usuário automaticamente (para SSO)
  const provisionUser = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase.rpc('provision_user', {
        p_user_id: userId
      });
      
      if (error) {
        console.error('Error provisioning user:', error);
        return null;
      }
      
      console.log('User provisioned:', data);
      return data;
    } catch (error) {
      console.error('Error provisioning user:', error);
      return null;
    }
  }, []);

  // Buscar perfil e role do usuário
  const fetchUserData = useCallback(async (userId: string) => {
    try {
      // Buscar profile
      let { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileError) throw profileError;

      // Se não existe profile, provisionar automaticamente
      if (!profile) {
        console.log('Profile not found, provisioning user...');
        await provisionUser(userId);
        
        // Buscar profile novamente após provisioning
        const { data: newProfile, error: newProfileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        
        if (newProfileError) throw newProfileError;
        profile = newProfile;
      }

      // Buscar role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (roleError) throw roleError;

      return {
        profile: profile as Profile | null,
        role: roleData?.role as AppRole | null,
        networkId: profile?.network_id ?? null,
      };
    } catch (error) {
      console.error('Error fetching user data:', error);
      return { profile: null, role: null, networkId: null };
    }
  }, [provisionUser]);

  useEffect(() => {
    // Listener de auth state change (deve ser configurado ANTES de getSession)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          const userData = await fetchUserData(session.user.id);
          setState({
            user: session.user,
            session,
            profile: userData.profile,
            role: userData.role,
            networkId: userData.networkId,
            isLoading: false,
            isAuthenticated: true,
          });
        } else {
          setState({
            user: null,
            session: null,
            profile: null,
            role: null,
            networkId: null,
            isLoading: false,
            isAuthenticated: false,
          });
        }
      }
    );

    // Verificar sessão existente
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const userData = await fetchUserData(session.user.id);
        setState({
          user: session.user,
          session,
          profile: userData.profile,
          role: userData.role,
          networkId: userData.networkId,
          isLoading: false,
          isAuthenticated: true,
        });
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchUserData]);

  // Funções de autenticação
  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
    return { data, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const signInWithAzure = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email profile openid',
        redirectTo: window.location.origin + '/dashboard',
      }
    });
    return { data, error };
  };

  // Verificações de permissão
  const isAdmin = state.role === 'admin';
  const isGestao = state.role === 'gestao';
  const isQualidade = state.role === 'qualidade';
  const isOperacional = state.role === 'operacional';
  const canImport = isAdmin || isGestao;
  const canManageSettings = isAdmin;

  return {
    ...state,
    signIn,
    signUp,
    signOut,
    signInWithAzure,
    isAdmin,
    isGestao,
    isQualidade,
    isOperacional,
    canImport,
    canManageSettings,
  };
}
