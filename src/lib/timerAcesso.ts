/**
 * Regras puras do acesso ao Timer Flag (front).
 *
 * O Timer é para quem NÃO tem KPI: o acesso fica em `timer_access`, fora de
 * `hub_area_members`, e quem tem só o Timer continua "pendente" para o resto
 * do hub. Por isso as rotas /timer e /timer/widget ficam FORA do
 * ProtectedRoute, atrás do TimerRoute. Esconder no front é só UX: quem barra
 * os dados é a RLS (`hub_is_approved()` segue falso para essa pessoa).
 */

/** Rotas que pertencem ao Timer. Nada além delas abre para quem tem só o Timer. */
export const ROTAS_TIMER = ['/timer', '/timer/widget'] as const;

export function ehRotaTimer(pathname: string): boolean {
  return ROTAS_TIMER.some((r) => pathname === r || pathname === `${r}/`);
}

/** Caminho interno e seguro: nunca URL externa, protocolo ou `//host`. */
export function sanitizarDestino(bruto: unknown): string | null {
  if (typeof bruto !== 'string') return null;
  if (!bruto.startsWith('/') || bruto.startsWith('//')) return null;
  if (bruto.includes(':') || bruto.includes('\\')) return null;
  if (bruto.length > 200) return null;
  return bruto;
}

/**
 * O SSO do Azure sai do site e volta em /auth/callback, e o `state.from` do
 * router se perde no caminho. O destino pedido (ex.: /timer) atravessa o
 * redirect no sessionStorage, que é por aba e some ao fechar.
 */
export const CHAVE_DESTINO_POS_LOGIN = 'flaghub:destino-pos-login';

export function guardarDestino(destino: unknown, storage: Pick<Storage, 'setItem' | 'removeItem'> | null = safeSession()): void {
  if (!storage) return;
  const limpo = sanitizarDestino(destino);
  try {
    if (limpo && limpo !== '/home') storage.setItem(CHAVE_DESTINO_POS_LOGIN, limpo);
    else storage.removeItem(CHAVE_DESTINO_POS_LOGIN);
  } catch {
    // storage bloqueado: segue para /home, como antes
  }
}

export function consumirDestino(storage: Pick<Storage, 'getItem' | 'removeItem'> | null = safeSession()): string | null {
  if (!storage) return null;
  try {
    const valor = storage.getItem(CHAVE_DESTINO_POS_LOGIN);
    storage.removeItem(CHAVE_DESTINO_POS_LOGIN);
    return sanitizarDestino(valor);
  } catch {
    return null;
  }
}

function safeSession(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export type Plataforma = 'windows' | 'macos' | 'linux' | 'outra';

export function detectarPlataforma(userAgent: string): Plataforma {
  const ua = userAgent.toLowerCase();
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('android')) return 'outra';
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'macos';
  if (ua.includes('linux') || ua.includes('x11')) return 'linux';
  return 'outra';
}

/**
 * Celular? A mesma regra do servidor (timer__eh_celular, TM6): no celular o
 * Timer é só consulta. O servidor decide; aqui é só para a tela não oferecer
 * o que vai ser recusado.
 */
export function ehCelular(userAgent: string): boolean {
  return /(android|iphone|ipad|ipod|mobile|webos|blackberry|opera mini|iemobile|windows phone)/i.test(userAgent);
}

export type ClienteTimer = 'web' | 'desktop' | 'widget';

/** O app desktop (Electron) se identifica no User-Agent com "TimerFlag/<versão>". */
export function detectarCliente(userAgent: string, pathname: string): ClienteTimer {
  if (pathname.startsWith('/timer/widget')) return 'widget';
  return /TimerFlag\/[\d.]+/.test(userAgent) ? 'desktop' : 'web';
}

export function versaoDesktop(userAgent: string): string | null {
  return userAgent.match(/TimerFlag\/([\d.]+)/)?.[1] ?? null;
}

/**
 * A consulta saiu sem a sessão do usuário (token vencido e ainda não renovado,
 * comum ao voltar da suspensão ou com duas janelas abertas): a API responde
 * como anônimo, "permission denied" (42501), ou JWT vencido (PGRST301/302/303).
 */
export function erroDeSessao(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  return ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(error.code ?? '') || /jwt/i.test(error.message ?? '');
}

/** O que a tela faz com o estado do acesso ao Timer. */
export type EstadoAcessoTimer =
  | { tipo: 'carregando' }
  | { tipo: 'ativo' }
  | { tipo: 'revogado' }
  | { tipo: 'sem_acesso' };

export function estadoAcesso(params: {
  carregando: boolean;
  linha: { status: string } | null | undefined;
}): EstadoAcessoTimer {
  if (params.carregando) return { tipo: 'carregando' };
  if (!params.linha) return { tipo: 'sem_acesso' };
  if (params.linha.status === 'ativo') return { tipo: 'ativo' };
  return { tipo: 'revogado' };
}
