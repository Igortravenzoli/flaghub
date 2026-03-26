/**
 * Monitor user detection.
 * monitor@flag.com.br is a dedicated read-only account for Kiosk TV display.
 * 
 * Rules:
 * - Exempt from MFA
 * - Restricted to Kiosk mode only (auto-enters on login)
 * - No access to imports, settings, or admin
 */

const MONITOR_EMAIL = 'monitor@flag.com.br';

export function isMonitorUser(email: string | undefined | null): boolean {
  if (!email) return false;
  return email.toLowerCase() === MONITOR_EMAIL;
}

/** Routes the monitor user is NOT allowed to access */
const BLOCKED_PATHS = [
  '/importacoes',
  '/configuracoes',
  '/usuarios',
  '/admin',
  '/correlacao',
  '/ticket-busca',
  '/tickets',
  '/acompanhamento',
  '/dashboard',
];

export function isMonitorBlockedRoute(pathname: string): boolean {
  return BLOCKED_PATHS.some(p => pathname.startsWith(p));
}
