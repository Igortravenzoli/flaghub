/**
 * Serviço de Gerenciamento de Token de Sessão para API Flag
 * 
 * Gerencia autenticação em duas etapas:
 * 1. Obtém token via POST /api/faq/validate-client
 * 2. Usa token nas chamadas subsequentes como Bearer
 */

const API_BASE_URL = 'https://clientes.flag.com.br/Flag.Ai.Gateway';
const STORAGE_KEY = 'flag_api_session_token';
const EXPIRY_MARGIN_SECONDS = 60; // Renovar 60s antes de expirar

/**
 * Estrutura do token armazenado no localStorage
 */
export interface StoredSessionToken {
  token: string;
  expiresAt: string; // ISO 8601
  createdAt: string;
}

/**
 * Response da API validate-client
 */
export interface ValidateClientResponse {
  sessionToken: string;
  expiresAt: string;
  success?: boolean;
  message?: string;
}

/**
 * Chama POST /api/faq/validate-client para obter um novo token
 */
export async function validateClient(): Promise<ValidateClientResponse> {
  const response = await fetch(`${API_BASE_URL}/api/faq/validate-client`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ codigoPuxada: '1' }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(
      (errorData.message as string) || `Falha na validação: HTTP ${response.status}`
    );
  }

  return await response.json();
}

/**
 * Recupera token do localStorage
 */
export function getStoredToken(): StoredSessionToken | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as StoredSessionToken;
  } catch {
    console.warn('[SessionToken] Erro ao ler token do sessionStorage');
    return null;
  }
}

/**
 * Salva token no localStorage
 */
export function storeToken(token: string, expiresAt: string): void {
  const storedToken: StoredSessionToken = {
    token,
    expiresAt,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(storedToken));
}

/**
 * Limpa token do localStorage
 */
export function clearToken(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Verifica se o token é válido (existe e não expirou)
 */
export function isTokenValid(storedToken: StoredSessionToken | null): boolean {
  if (!storedToken) return false;

  try {
    const expiresAt = new Date(storedToken.expiresAt);
    const now = new Date();
    const marginMs = EXPIRY_MARGIN_SECONDS * 1000;
    
    // Token válido se expiração é maior que agora + margem
    return expiresAt.getTime() > now.getTime() + marginMs;
  } catch {
    return false;
  }
}

/**
 * Obtém um token válido (reutiliza existente ou renova)
 * 
 * @param forceRenew - Se true, força renovação mesmo com token válido
 * @returns Token de sessão válido
 */
export async function getValidToken(forceRenew = false): Promise<string> {
  // Tentar reutilizar token existente
  if (!forceRenew) {
    const stored = getStoredToken();
    if (isTokenValid(stored)) {
      console.debug('[SessionToken] Reutilizando token existente');
      return stored!.token;
    }
  }

  // Renovar token
  console.debug('[SessionToken] Obtendo novo token via validate-client');
  const response = await validateClient();
  
  // Armazenar novo token
  storeToken(response.sessionToken, response.expiresAt);
  
  return response.sessionToken;
}

/**
 * Executa uma função com retry automático em caso de token expirado
 * 
 * @param fn - Função que recebe o token e executa a requisição
 * @param maxRetries - Número máximo de tentativas (padrão: 2)
 */
export async function withTokenRetry<T>(
  fn: (token: string) => Promise<T>,
  maxRetries = 2
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Na primeira tentativa, usa token existente; nas demais, força renovação
      const token = await getValidToken(attempt > 0);
      return await fn(token);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Se for erro 401, tentar renovar token
      const is401 = lastError.message.includes('401') || 
                    lastError.message.toLowerCase().includes('unauthorized');
      
      if (!is401 || attempt >= maxRetries - 1) {
        throw lastError;
      }
      
      console.warn(`[SessionToken] Token inválido, tentando renovar (tentativa ${attempt + 1})`);
      clearToken(); // Limpar token inválido
    }
  }
  
  throw lastError || new Error('Falha após múltiplas tentativas');
}

/**
 * Inicializa o token ao carregar a aplicação
 * Chama validate-client proativamente
 */
export async function initializeToken(): Promise<string | null> {
  try {
    return await getValidToken();
  } catch (error) {
    console.error('[SessionToken] Falha ao inicializar token:', error);
    return null;
  }
}

/**
 * Retorna informações sobre o token atual (para debug)
 */
export function getTokenInfo(): {
  hasToken: boolean;
  isValid: boolean;
  expiresAt: string | null;
  createdAt: string | null;
} {
  const stored = getStoredToken();
  return {
    hasToken: !!stored,
    isValid: isTokenValid(stored),
    expiresAt: stored?.expiresAt || null,
    createdAt: stored?.createdAt || null,
  };
}
