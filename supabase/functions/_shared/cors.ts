/**
 * Shared CORS helper for FlagHub Edge Functions.
 * Returns dynamic Access-Control-Allow-Origin based on request origin
 * instead of the insecure wildcard (*).
 *
 * Cron-triggered functions (no Origin header) receive the production URL.
 */

const ALLOWED_ORIGINS = [
  "https://flaghub.flag.com.br",
  "https://flaghub-staging.netlify.app",
  "http://localhost:5173",
  "http://localhost:4173",
];

export function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get("Origin") ?? "";
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

export function corsHeaders(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(req),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
