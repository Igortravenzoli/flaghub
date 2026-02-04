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
  // Evita ficar preso em loading quando existir refresh_token inválido/corrompido no storage.
  // Supabase usa chaves do tipo: sb-<project-ref>-auth-token
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
      console.error("Error provisioning user:", error);
      return null;
    }

    console.log("User provisioned:", data);
    return data;
  } catch (error) {
    console.error("Error provisioning user:", error);
    return null;
  }
}

async function fetchUserData(userId: string) {
  try {
    // Buscar profile
    let { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) throw profileError;

    // Se não existe profile, provisionar automaticamente
    if (!profile) {
      console.log("Profile not found, provisioning user...");
      await provisionUser(userId);

      // Buscar profile novamente após provisioning
      const { data: newProfile, error: newProfileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (newProfileError) throw newProfileError;
      profile = newProfile;
    }

    // Buscar role
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
    console.error("Error fetching user data:", error);
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

  // Garante que apenas a última operação async de auth pode aplicar state
  const opIdRef = useRef(0);

  const setSignedOut = useCallback(() => {
    opIdRef.current += 1;
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
    const opId = (opIdRef.current += 1);
    const userData = await fetchUserData(session.user.id);
    if (opId !== opIdRef.current) return;
    setState({
      user: session.user,
      session,
      profile: userData.profile,
      role: userData.role,
      networkId: userData.networkId,
      isLoading: false,
      isAuthenticated: true,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const AUTH_INIT_TIMEOUT_MS = 8000;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      console.warn("[Auth] Init timeout; forcing clean logout");
      clearPossiblyCorruptedAuthStorage();
      setSignedOut();
    }, AUTH_INIT_TIMEOUT_MS);

    const clearInitTimeout = () => window.clearTimeout(timeoutId);

    const safeSignedOut = () => {
      if (cancelled) return;
      clearInitTimeout();
      setSignedOut();
    };

    const safeSignedIn = async (session: Session) => {
      if (cancelled) return;
      try {
        await setSignedIn(session);
      } finally {
        clearInitTimeout();
      }
    };

    // Listener primeiro (padrão recomendado pelo Supabase)
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      const eventName = event as unknown as string;
      console.debug("[Auth] onAuthStateChange:", eventName);

      if (eventName === "TOKEN_REFRESH_FAILED") {
        clearPossiblyCorruptedAuthStorage();
        safeSignedOut();
        return;
      }

      if (eventName === "SIGNED_OUT") {
        safeSignedOut();
        return;
      }

      if (session?.user) {
        await safeSignedIn(session);
      } else {
        safeSignedOut();
      }
    });

    // Depois, tenta restaurar a sessão persistida
    (async () => {
      try {
        const { data: sessionData, error } = await supabase.auth.getSession();
        if (cancelled) return;

        if (error) {
          console.warn("[Auth] getSession error:", error);
          if (shouldClearAuthStorageForError(error)) {
            clearPossiblyCorruptedAuthStorage();
          }
          safeSignedOut();
          return;
        }

        const session = sessionData.session;
        if (session?.user) {
          await safeSignedIn(session);
        } else {
          clearInitTimeout();
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        console.warn("[Auth] getSession threw:", error);
        if (shouldClearAuthStorageForError(error)) {
          clearPossiblyCorruptedAuthStorage();
        }
        safeSignedOut();
      }
    })();

    return () => {
      cancelled = true;
      clearInitTimeout();
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
      // Mesmo que a API falhe, garantir que a sessão local não fique corrompida
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
