import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Profile } from "@/types/database";

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  networkId: number | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface AuthContextValue extends AuthState {
  signIn: (
    email: string,
    password: string
  ) => ReturnType<typeof supabase.auth.signInWithPassword>;
  signUp: (
    email: string,
    password: string,
    fullName?: string
  ) => ReturnType<typeof supabase.auth.signUp>;
  signOut: () => Promise<{ error: unknown | null }>;
  signInWithAzure: () => ReturnType<typeof supabase.auth.signInWithOAuth>;
  isAdmin: boolean;
  isGestao: boolean;
  isQualidade: boolean;
  isOperacional: boolean;
  canImport: boolean;
  canManageSettings: boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function clearPossiblyCorruptedAuthStorage() {
  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore
  }
}

function shouldClearAuthStorageForError(error: unknown) {
  const message =
    typeof (error as { message?: unknown })?.message === "string"
      ? ((error as { message?: string }).message ?? "")
      : String(error ?? "");

  const normalized = message.toLowerCase();
  return (
    normalized.includes("invalid refresh token") ||
    normalized.includes("refresh token") ||
    normalized.includes("token refresh") ||
    normalized.includes("jwt expired") ||
    normalized.includes("session_not_found")
  );
}

async function provisionUser(userId: string) {
  try {
    const { data, error } = await supabase.rpc("provision_user", {
      p_user_id: userId,
    });

    if (error) {
      console.error("[Auth] Error provisioning user:", error);
      return null;
    }

    console.log("[Auth] User provisioned:", data);
    return data;
  } catch (error) {
    console.error("[Auth] Error provisioning user:", error);
    return null;
  }
}

async function fetchUserData(userId: string): Promise<{
  profile: Profile | null;
  role: AppRole | null;
  networkId: number | null;
}> {
  try {
    let { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profile) {
      console.log("[Auth] Profile not found, provisioning user...");
      await provisionUser(userId);

      const { data: newProfile, error: newProfileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (newProfileError) throw newProfileError;
      profile = newProfile;
    }

    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (roleError) throw roleError;

    return {
      profile: profile as Profile | null,
      role: roleData?.role as AppRole | null,
      networkId: profile?.network_id ?? null,
    };
  } catch (error) {
    console.error("[Auth] Error fetching user data:", error);
    return { profile: null, role: null, networkId: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    role: null,
    networkId: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Ref para garantir que o estado inicial só seja definido uma vez
  const initializedRef = useRef(false);
  // Garante que apenas a última operação async de auth pode aplicar state
  const opIdRef = useRef(0);

  const setSignedOut = useCallback(() => {
    console.log("[Auth] setSignedOut called");
    opIdRef.current += 1;
    initializedRef.current = true;
    setState({
      user: null,
      session: null,
      profile: null,
      role: null,
      networkId: null,
      isLoading: false,
      isAuthenticated: false,
    });
  }, []);

  const setSignedIn = useCallback(async (session: Session) => {
    console.log("[Auth] setSignedIn called for user:", session.user.email);
    const opId = (opIdRef.current += 1);
    
    try {
      const userData = await fetchUserData(session.user.id);
      
      // Se outra operação começou, ignorar este resultado
      if (opId !== opIdRef.current) {
        console.log("[Auth] setSignedIn aborted - newer operation in progress");
        return;
      }
      
      initializedRef.current = true;
      setState({
        user: session.user,
        session,
        profile: userData.profile,
        role: userData.role,
        networkId: userData.networkId,
        isLoading: false,
        isAuthenticated: true,
      });
      console.log("[Auth] User signed in successfully:", session.user.email);
    } catch (error) {
      console.error("[Auth] Error in setSignedIn:", error);
      // Em caso de erro, ainda marcar como inicializado para não ficar travado
      if (opId === opIdRef.current) {
        initializedRef.current = true;
        setState({
          user: session.user,
          session,
          profile: null,
          role: null,
          networkId: null,
          isLoading: false,
          isAuthenticated: true,
        });
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const AUTH_INIT_TIMEOUT_MS = 6000; // Reduzido para 6s para feedback mais rápido
    
    console.log("[Auth] Initializing auth state...");
    
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      
      // Se já inicializou, não fazer nada
      if (initializedRef.current) {
        console.log("[Auth] Timeout fired but already initialized");
        return;
      }
      
      console.warn("[Auth] Init timeout (6s); forcing clean logout");
      clearPossiblyCorruptedAuthStorage();
      setSignedOut();
    }, AUTH_INIT_TIMEOUT_MS);

    const clearInitTimeout = () => window.clearTimeout(timeoutId);

    // Handler para sessão válida
    const handleSession = async (session: Session | null, source: string) => {
      if (cancelled) return;
      
      // Se já inicializou por outra fonte, ignorar
      if (initializedRef.current) {
        console.log(`[Auth] ${source}: Already initialized, ignoring`);
        // Mas ainda atualizar se for uma mudança de sessão real (não inicial)
        if (session?.user && source !== "getSession" && source !== "INITIAL_SESSION") {
          await setSignedIn(session);
        }
        return;
      }
      
      console.log(`[Auth] ${source}: Processing session...`);
      clearInitTimeout();
      
      if (session?.user) {
        await setSignedIn(session);
      } else {
        setSignedOut();
      }
    };

    // Listener primeiro (padrão recomendado pelo Supabase)
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      console.log("[Auth] onAuthStateChange:", event);

      // Eventos de erro
      // TOKEN_REFRESH_FAILED não é um AuthChangeEvent oficial, mas pode aparecer
      const eventName = event as string;
      if (eventName === "TOKEN_REFRESH_FAILED") {
        console.warn("[Auth] Token refresh failed");
        clearPossiblyCorruptedAuthStorage();
        clearInitTimeout();
        setSignedOut();
        return;
      }

      if (event === "SIGNED_OUT") {
        clearInitTimeout();
        setSignedOut();
        return;
      }

      // INITIAL_SESSION é o evento que indica restauração de sessão
      if (event === "INITIAL_SESSION") {
        await handleSession(session, "INITIAL_SESSION");
        return;
      }

      // Outros eventos (SIGNED_IN, TOKEN_REFRESHED, etc.)
      if (session?.user) {
        // Se já inicializou, atualizar sessão normalmente
        if (initializedRef.current) {
          await setSignedIn(session);
        } else {
          await handleSession(session, event);
        }
      }
    });

    // Fallback: getSession() para casos onde INITIAL_SESSION não dispara
    // Aguardar um pequeno delay para dar prioridade ao listener
    const getSessionTimeout = window.setTimeout(async () => {
      if (cancelled || initializedRef.current) return;
      
      console.log("[Auth] getSession fallback triggered");
      
      try {
        const { data: sessionData, error } = await supabase.auth.getSession();
        
        if (cancelled || initializedRef.current) return;

        if (error) {
          console.warn("[Auth] getSession error:", error);
          if (shouldClearAuthStorageForError(error)) {
            clearPossiblyCorruptedAuthStorage();
          }
          clearInitTimeout();
          setSignedOut();
          return;
        }

        await handleSession(sessionData.session, "getSession");
      } catch (error) {
        if (cancelled || initializedRef.current) return;
        
        console.warn("[Auth] getSession threw:", error);
        if (shouldClearAuthStorageForError(error)) {
          clearPossiblyCorruptedAuthStorage();
        }
        clearInitTimeout();
        setSignedOut();
      }
    }, 100); // Pequeno delay para dar prioridade ao listener

    return () => {
      cancelled = true;
      clearInitTimeout();
      window.clearTimeout(getSessionTimeout);
      data.subscription.unsubscribe();
    };
  }, [setSignedIn, setSignedOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    return await supabase.auth.signInWithPassword({
      email,
      password,
    });
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    return await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      clearPossiblyCorruptedAuthStorage();
      setSignedOut();
      return { error };
    } catch (error) {
      clearPossiblyCorruptedAuthStorage();
      setSignedOut();
      return { error };
    }
  }, [setSignedOut]);

  const signInWithAzure = useCallback(async () => {
    return await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "email profile openid",
        redirectTo: window.location.origin + "/dashboard",
      },
    });
  }, []);

  const isAdmin = state.role === "admin";
  const isGestao = state.role === "gestao";
  const isQualidade = state.role === "qualidade";
  const isOperacional = state.role === "operacional";
  const canImport = isAdmin || isGestao;
  const canManageSettings = isAdmin;

  const value = useMemo<AuthContextValue>(
    () => ({
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
    }),
    [
      state,
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
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
