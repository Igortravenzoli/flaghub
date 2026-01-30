/**
 * Hook React para gerenciamento automático do token de sessão da API Flag
 * 
 * - Inicializa token ao montar
 * - Expõe função para obter token válido
 * - Gerencia estados de loading/erro
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  initializeToken, 
  getValidToken, 
  getTokenInfo,
  clearToken,
  withTokenRetry,
} from '@/services/apiSessionToken';

interface TokenState {
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  hasValidToken: boolean;
}

export function useApiSessionToken() {
  const [state, setState] = useState<TokenState>({
    isLoading: true,
    isInitialized: false,
    error: null,
    hasValidToken: false,
  });

  /**
   * Inicializa o token ao montar o componente
   */
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        setState(prev => ({ ...prev, isLoading: true, error: null }));
        
        const token = await initializeToken();
        
        if (mounted) {
          setState({
            isLoading: false,
            isInitialized: true,
            error: token ? null : 'Falha ao obter token',
            hasValidToken: !!token,
          });
        }
      } catch (error) {
        if (mounted) {
          setState({
            isLoading: false,
            isInitialized: true,
            error: error instanceof Error ? error.message : 'Erro desconhecido',
            hasValidToken: false,
          });
        }
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  /**
   * Obtém token válido com renovação automática
   */
  const getToken = useCallback(async (forceRenew = false): Promise<string> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const token = await getValidToken(forceRenew);
      setState(prev => ({ ...prev, isLoading: false, hasValidToken: true }));
      return token;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro ao obter token';
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        hasValidToken: false,
        error: errorMsg,
      }));
      throw error;
    }
  }, []);

  /**
   * Força renovação do token
   */
  const renewToken = useCallback(async (): Promise<string> => {
    return getToken(true);
  }, [getToken]);

  /**
   * Limpa o token armazenado
   */
  const logout = useCallback(() => {
    clearToken();
    setState(prev => ({ ...prev, hasValidToken: false }));
  }, []);

  /**
   * Retorna informações de debug sobre o token
   */
  const getDebugInfo = useCallback(() => {
    return getTokenInfo();
  }, []);

  /**
   * Executa uma função com retry automático em caso de 401
   */
  const executeWithRetry = useCallback(async <T,>(
    fn: (token: string) => Promise<T>
  ): Promise<T> => {
    try {
      const result = await withTokenRetry(fn);
      setState(prev => ({ ...prev, hasValidToken: true, error: null }));
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro na requisição';
      setState(prev => ({ ...prev, error: errorMsg }));
      throw error;
    }
  }, []);

  return {
    ...state,
    getToken,
    renewToken,
    logout,
    getDebugInfo,
    executeWithRetry,
  };
}

/**
 * Hook simplificado que apenas retorna se o token está pronto
 * Útil para componentes que só precisam saber se a API está disponível
 */
export function useApiTokenReady(): boolean {
  const { isInitialized, hasValidToken } = useApiSessionToken();
  return isInitialized && hasValidToken;
}
