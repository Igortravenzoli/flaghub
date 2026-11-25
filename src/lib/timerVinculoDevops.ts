// Vínculo do Timer com o Azure DevOps por pessoa (docs/timer-identidade-por-dev.md).
//
// Para o History do DevOps mostrar o dev (e não o dono do PAT), a edge
// `timer-devops` precisa de um refresh token Microsoft da própria pessoa. Ele
// só existe se o login pedir `offline_access`, e a Supabase o entrega UMA vez,
// logo após o login, sem guardar. Aqui fica a parte pura do lado do app:
// quais escopos o login pede e se o token deste login já foi mandado à edge.
//
// Tudo desligado por padrão: sem VITE_SSO_ESCOPOS_EXTRAS o login pede os
// mesmos escopos de sempre, não chega refresh token nenhum e nada é enviado.

/** Os escopos de sempre do SSO Microsoft do FlagHub. */
export const ESCOPOS_SSO = 'email profile openid';

/**
 * Escopos do login: os de sempre mais os extras da variável de ambiente
 * (ex.: "offline_access"). Separados por espaço — o Auth da Supabase quebra
 * a lista por vírgula, então vírgula aqui partiria o pedido. Extra com
 * caractere estranho ou repetido é descartado.
 */
export function escoposDoSso(extras: string | null | undefined): string {
  const base = ESCOPOS_SSO.split(' ');
  const novos = (extras ?? '')
    .split(/\s+/)
    .filter((e) => /^[A-Za-z0-9:/._-]{2,200}$/.test(e) && !base.includes(e));
  return [...base, ...new Set(novos)].join(' ');
}

/**
 * Marca curta do token (FNV-1a), só para saber se o token DESTE login já foi
 * mandado. Não dá para voltar dela ao token, e o token nunca é guardado.
 */
export function marcaDoToken(token: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${token.length}.${(h >>> 0).toString(36)}`;
}

export const chaveDoVinculo = (userId: string) => `timer-flag:devops-vinculo:${userId}`;

/** Manda só quando há token e ele ainda não foi mandado por esta pessoa. */
export function deveEnviarVinculo(token: string | null | undefined, marcaGuardada: string | null): token is string {
  return typeof token === 'string' && token.length >= 20 && marcaDoToken(token) !== marcaGuardada;
}

// O token do último login, só em memória (some ao recarregar a página). O
// AuthContext o entrega aqui quando o evento de login chega; a tela do Timer
// o consome depois de confirmar o acesso.
let doLogin: { userId: string; token: string } | null = null;

export function lembrarTokenDoLogin(
  sessao: { user?: { id?: string } | null; provider_refresh_token?: string | null } | null | undefined,
): void {
  const token = sessao?.provider_refresh_token;
  const userId = sessao?.user?.id;
  if (typeof token === 'string' && token && userId) doLogin = { userId, token };
}

/** Lê e esquece: o token não fica na memória depois de mandado. */
export function consumirTokenDoLogin(userId: string): string | null {
  if (!doLogin || doLogin.userId !== userId) return null;
  const { token } = doLogin;
  doLogin = null;
  return token;
}
