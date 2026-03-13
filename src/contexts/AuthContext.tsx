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
  mfaRequired: boolean;
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
  mfaRequired: boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function clearSupabaseAuthStorage() {
  console.log("[Auth] Clearing Supabase auth storage...");
  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith("sb-") && key.includes("auth-token")) {
        console.log("[Auth] Removing:", key);
        localStorage.removeItem(key);
      }
    }
  } catch (e) {
    console.warn("[Auth] Error clearing storage:", e);
  }
}

function isAuthError(error: unknown): boolean {
  if (!error) return false;
  
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
    normalized.includes("session_not_found") ||
    normalized.includes("invalid claim") ||
    normalized.includes("token is expired") ||
    normalized.includes("invalid token") ||
    normalized.includes("auth session missing") ||
    normalized.includes("not authenticated")
  );
}

function isSessionInvalid(session: Session | null): boolean {
  // Observação: não invalidar sessão apenas porque access_token expirou.
  // O Supabase consegue renovar via refresh_token; invalidar aqui causa logoff no F5.
  if (!session) return true;
  if (!session.access_token) return true;
  if (!session.user?.id) return true;
  return false;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(() => {
      reject(new Error(`[Auth] Timeout after ${ms}ms (${label})`));
    }, ms);

    promise.then(
      (value) => {
        window.clearTimeout(id);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(id);
        reject(err);
      }
    );
  });
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

    // Usar RPC get_user_role para obter a role com maior privilégio
    // (admin > gestao > qualidade > operacional)
    const { data: roleFromRpc, error: roleError } = await supabase
      .rpc("get_user_role", { p_user_id: userId });

    if (roleError) {
      console.warn("[Auth] get_user_role RPC failed, falling back to direct query:", roleError);
      // Fallback: query direta com ordenação
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      
      const rolePriority: Record<string, number> = { admin: 1, gestao: 2, qualidade: 3, operacional: 4 };
      const sortedRoles = (roleData || []).sort((a, b) => 
        (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99)
      );
      
      return {
        profile: profile as Profile | null,
        role: (sortedRoles[0]?.role as AppRole) || null,
        networkId: profile?.network_id ?? null,
      };
    }

    return {
      profile: profile as Profile | null,
      role: (roleFromRpc as AppRole) || null,
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
    mfaRequired: false,
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

    // Fase 1 (rápida): liberar UI imediatamente para não estourar watchdog do ProtectedRoute
    initializedRef.current = true;
    setState((prev) => ({
      ...prev,
      user: session.user,
      session,
      isLoading: false,
      isAuthenticated: true,
    }));

    // Fase 2 (hidratação): carregar role/network/profile em paralelo e aplicar quando pronto
    try {
      const [claims, userData] = await Promise.all([
        withTimeout(
          Promise.all([supabase.rpc("auth_user_role"), supabase.rpc("auth_network_id")]),
          2500,
          "auth claims"
        )
          .then(([roleRes, netRes]) => ({
            role: roleRes.error ? null : (roleRes.data as AppRole | null),
            networkId: netRes.error ? null : (netRes.data as number | null),
          }))
          .catch((error) => {
            console.warn("[Auth] auth claims fetch failed:", error);
            return { role: null, networkId: null };
          }),
        withTimeout(fetchUserData(session.user.id), 4500, "fetchUserData").catch((error) => {
          console.warn("[Auth] fetchUserData timed out/failed:", error);
          return { profile: null, role: null, networkId: null };
        }),
      ]);

      // Se outra operação começou, ignorar este resultado
      if (opId !== opIdRef.current) {
        console.log("[Auth] setSignedIn hydration aborted - newer operation in progress");
        return;
      }

      const mergedRole = userData.role ?? claims.role;
      const mergedNetworkId = userData.networkId ?? claims.networkId;
      if (mergedNetworkId === null) {
        console.warn("[Auth] networkId is null after sign-in (claims+profile)");
      }

      setState((prev) => ({
        ...prev,
        profile: userData.profile,
        role: mergedRole,
        networkId: mergedNetworkId,
      }));

      console.log("[Auth] User signed in successfully:", session.user.email);
    } catch (error) {
      console.error("[Auth] Error hydrating signed-in user:", error);
      // manter estado básico autenticado; apenas deixar metadados nulos
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
      
      console.warn("[Auth] Init timeout (6s); stopping loading UI (no forced logout)");
      setState((prev) => ({ ...prev, isLoading: false }));
    }, AUTH_INIT_TIMEOUT_MS);

    const clearInitTimeout = () => window.clearTimeout(timeoutId);

    // Handler para sessão - agora valida se a sessão está realmente válida
    const handleSession = async (session: Session | null, source: string) => {
      if (cancelled) return;

      // Se já inicializou por outra fonte, ignorar
      if (initializedRef.current) {
        console.log(`[Auth] ${source}: Already initialized, ignoring`);
        // Mas ainda atualizar se for uma mudança de sessão real (não inicial)
        if (session?.user && source !== "getSession" && source !== "INITIAL_SESSION") {
          if (!isSessionInvalid(session)) {
            await setSignedIn(session);
          }
        }
        return;
      }

      console.log(`[Auth] ${source}: Processing session...`);
      clearInitTimeout();

      // CRÍTICO: Validar se a sessão tem estrutura mínima
      // (não invalidar por expiração: o Supabase renova via refresh_token)
      if (isSessionInvalid(session)) {
        console.warn(`[Auth] ${source}: No session available`);
        setSignedOut();
        return;
      }

      // Não bloquear bootstrap com validação online aqui.
      // Se houver refresh token inválido, o Supabase tende a emitir SIGNED_OUT/TOKEN_REFRESH_FAILED.
      await setSignedIn(session);
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
        clearSupabaseAuthStorage();
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
          if (isAuthError(error)) {
            clearSupabaseAuthStorage();
          }
          clearInitTimeout();
          setSignedOut();
          return;
        }

        await handleSession(sessionData.session, "getSession");
      } catch (error) {
        if (cancelled || initializedRef.current) return;
        
        console.warn("[Auth] getSession threw:", error);
        if (isAuthError(error)) {
          clearSupabaseAuthStorage();
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
    console.log("[Auth] signOut called");

    // IMPORTANT: sempre finalizar o estado local primeiro (nunca ficar preso aguardando rede)
    clearSupabaseAuthStorage();
    setSignedOut();

    try {
      const { error } = await withTimeout(
        supabase.auth.signOut({ scope: "local" }),
        2000,
        "auth.signOut"
      );
      return { error: (error as unknown) ?? null };
    } catch (error) {
      console.warn("[Auth] signOut timed out/failed (state already cleared):", error);
      return { error: error ?? null };
    }
  }, [setSignedOut]);

  const signInWithAzure = useCallback(async () => {
    return await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "email profile openid",
        redirectTo: window.location.origin + "/home",
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
