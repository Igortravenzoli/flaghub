import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Profile } from "@/types/database";
import { hasElevated, hasManagement, hasQuality, hasOperational, canPerformImport, canManageConfig } from "@/lib/roleMap";

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  /** Obfuscated role code (s1, s2, s3, s4) — never exposes DB role names */
  roleCode: string | null;
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
  clearMfaRequired: () => void;
  /** @deprecated use roleCode-based checks */
  role: AppRole | null;
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
  /** Already obfuscated role code (s1/s2/s3/s4) */
  roleCode: string | null;
  networkId: number | null;
}> {
  try {
    let { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, full_name, network_id, created_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profile) {
      console.log("[Auth] Profile not found, provisioning user...");
      await provisionUser(userId);

      const { data: newProfile, error: newProfileError } = await supabase
        .from("profiles")
        .select("user_id, full_name, network_id, created_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (newProfileError) throw newProfileError;
      profile = newProfile;
    }

    // Use masked RPC — returns obfuscated code (s1/s2/s3/s4), never plain role names
    const { data: maskedCode, error: roleError } = await supabase
      .rpc("auth_user_role_masked");

    if (roleError) {
      console.warn("[Auth] auth_user_role_masked RPC failed:", roleError);
    }

    return {
      profile: profile as Profile | null,
      roleCode: (maskedCode as string) || null,
      networkId: profile?.network_id ?? null,
    };
  } catch (error) {
    console.error("[Auth] Error fetching user data:", error);
    return { profile: null, roleCode: null, networkId: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    roleCode: null,
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
      roleCode: null,
      networkId: null,
      isLoading: false,
      isAuthenticated: false,
      mfaRequired: false,
    });
  }, []);

  const hydrateUserData = useCallback(async (session: Session, opId: number) => {
    // Helper to fetch role/profile data with retry
    const attemptHydration = async (attempt: number): Promise<boolean> => {
      const timeoutMs = attempt === 1 ? 3500 : 6000;
      const claimsTimeoutMs = attempt === 1 ? 3000 : 5000;

      try {
        const [claims, userData] = await Promise.all([
          withTimeout(
            Promise.all([supabase.rpc("auth_user_role_masked"), supabase.rpc("auth_network_id")]),
            claimsTimeoutMs,
            `auth claims (attempt ${attempt})`
          )
            .then(([roleRes, netRes]) => ({
              roleCode: roleRes.error ? null : (roleRes.data as string | null),
              networkId: netRes.error ? null : (netRes.data as number | null),
            }))
            .catch((error) => {
              console.warn(`[Auth] auth claims fetch failed (attempt ${attempt}):`, error);
              return { roleCode: null, networkId: null };
            }),
          withTimeout(fetchUserData(session.user.id), timeoutMs, `fetchUserData (attempt ${attempt})`).catch((error) => {
            console.warn(`[Auth] fetchUserData timed out/failed (attempt ${attempt}):`, error);
            return { profile: null, roleCode: null, networkId: null };
          }),
        ]);

        if (opId !== opIdRef.current) {
          console.log("[Auth] hydration aborted - newer operation in progress");
          return false;
        }

        // Both sources now return obfuscated codes directly — no toCode() needed
        const mergedRoleCode = userData.roleCode ?? claims.roleCode;
        const mergedNetworkId = userData.networkId ?? claims.networkId;

        // If both sources returned null, hydration failed
        if (!mergedRoleCode && !userData.profile) {
          return false;
        }

        if (mergedNetworkId === null) {
          console.warn("[Auth] networkId is null after sign-in (claims+profile)");
        }

        const obfuscatedRole = mergedRoleCode;

        let mfaRequired = false;
        if (hasElevated(obfuscatedRole)) {
          const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          if (aalData && aalData.currentLevel !== aalData.nextLevel) {
            mfaRequired = true;
          } else if (aalData && aalData.currentLevel === "aal1" && aalData.nextLevel === "aal1") {
            mfaRequired = true;
          }
          console.log("[Auth] Elevated role MFA check:", { currentLevel: aalData?.currentLevel, nextLevel: aalData?.nextLevel, mfaRequired });
        }

        setState((prev) => {
          const nextRoleCode = obfuscatedRole ?? prev.roleCode;
          const nextNetworkId = mergedNetworkId ?? prev.networkId;

          if (!obfuscatedRole && prev.roleCode) {
            console.warn("[Auth] Hydration returned empty role; preserving previous roleCode");
          }

          return {
            ...prev,
            profile: userData.profile ?? prev.profile,
            roleCode: nextRoleCode,
            networkId: nextNetworkId,
            mfaRequired: obfuscatedRole ? mfaRequired : prev.mfaRequired,
          };
        });

        console.log("[Auth] User hydrated successfully:", session.user.email, "role:", obfuscatedRole);
        return true;
      } catch (error) {
        console.error(`[Auth] Hydration attempt ${attempt} failed:`, error);
        return false;
      }
    };

    // Attempt 1
    const success = await attemptHydration(1);
    if (!success && opId === opIdRef.current) {
      // Wait a bit and retry — setSession may still be finalizing
      console.log("[Auth] Hydration failed, retrying in 1s...");
      await new Promise((r) => setTimeout(r, 1000));
      if (opId === opIdRef.current) {
        await attemptHydration(2);
      }
    }
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

    // Fase 2 (hidratação): carregar role/network/profile com retry
    await hydrateUserData(session, opId);

    // Fase 3: Se hydration não trouxe roleCode, tentar mais uma vez após breve delay
    // (cobre cenário pós-login onde RPC pode falhar na primeira tentativa)
    if (opId === opIdRef.current) {
      setState((prev) => {
        if (!prev.roleCode && prev.isAuthenticated) {
          console.warn("[Auth] roleCode still null after hydration, scheduling retry...");
          setTimeout(async () => {
            if (opId === opIdRef.current) {
              await hydrateUserData(session, opId);
            }
          }, 2000);
        }
        return prev;
      });
    }
  }, [hydrateUserData]);

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

  const clearMfaRequired = useCallback(() => {
    console.log("[Auth] clearMfaRequired called");
    setState((prev) => ({ ...prev, mfaRequired: false }));
  }, []);

  const isAdmin = hasElevated(state.roleCode);
  const isGestao = hasManagement(state.roleCode) && !hasElevated(state.roleCode);
  const isQualidade = hasQuality(state.roleCode);
  const isOperacional = hasOperational(state.roleCode);
  const canImport = canPerformImport(state.roleCode);
  const canManageSettingsFlag = canManageConfig(state.roleCode);

  // Derive the DB role name from obfuscated code for backward compatibility
  const roleFromCode = ((): AppRole | null => {
    if (!state.roleCode) return null;
    const map: Record<string, AppRole> = { s1: 'admin', s2: 'gestao', s3: 'qualidade', s4: 'operacional' };
    return map[state.roleCode] ?? null;
  })();

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      role: roleFromCode,
      signIn,
      signUp,
      signOut,
      signInWithAzure,
      clearMfaRequired,
      isAdmin,
      isGestao,
      isQualidade,
      isOperacional,
      canImport,
      canManageSettings: canManageSettingsFlag,
      mfaRequired: state.mfaRequired,
    }),
    [
      state,
      roleFromCode,
      signIn,
      signUp,
      signOut,
      signInWithAzure,
      clearMfaRequired,
      isAdmin,
      isGestao,
      isQualidade,
      isOperacional,
      canImport,
      canManageSettingsFlag,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
