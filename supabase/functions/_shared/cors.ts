/**
 * Shared CORS helper for FlagHub Edge Functions.
 *
 * Behaviour by request origin:
 *   - Origin in ALLOWED_ORIGINS  → echo origin back in ACAO header (browser-safe CORS)
 *   - No Origin header (cron / server-to-server) → return production URL so the
 *     response is accepted by internal callers
 *   - Unknown / attacker origin → omit ACAO header entirely; browser blocks the read
 */

const ALLOWED_ORIGINS = [
  "https://flaghub.flag.com.br",
  "https://flaghub-staging.netlify.app",
  "http://localhost:5173",
  "http://localhost:4173",
];

export function getAllowedOrigin(req: Request): string | null {
  const origin = req.headers.get("Origin");

  // No Origin header: cron job / server-to-server caller — allow with prod URL
  if (!origin) return ALLOWED_ORIGINS[0];

  // Known browser origin: echo it back exactly
  if (ALLOWED_ORIGINS.includes(origin)) return origin;

  // Unknown / potentially hostile origin: do NOT set ACAO — browser will block
  return null;
}

export function corsHeaders(req: Request): Record<string, string> {
  const allowed = getAllowedOrigin(req);

  const base: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };

  if (allowed) {
    base["Access-Control-Allow-Origin"] = allowed;
  }

  return base;
}
