import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Rate-limited login proxy.
 * 
 * Tracks failed attempts per IP+email in an in-memory map.
 * Rejects requests when threshold is exceeded.
 * 
 * NOTE: In-memory store resets on cold start. For persistence,
 * migrate to a DB table or KV store.
 */

interface AttemptRecord {
  count: number;
  firstAttempt: number;
  lockedUntil: number | null;
}

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 min window
const LOCKOUT_MS = 60 * 1000; // 60s lockout
const CLEANUP_INTERVAL = 10 * 60 * 1000; // cleanup every 10min

const attempts = new Map<string, AttemptRecord>();
let lastCleanup = Date.now();

function cleanupOldEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, record] of attempts) {
    if (now - record.firstAttempt > WINDOW_MS && (!record.lockedUntil || now > record.lockedUntil)) {
      attempts.delete(key);
    }
  }
}

function getClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  cleanupOldEntries();

  const ip = getClientIp(req);

  let email: string;
  let password: string;

  try {
    const body = await req.json();
    email = body.email?.toLowerCase()?.trim();
    password = body.password;
    if (!email || !password) throw new Error("missing fields");
  } catch {
    return new Response(
      JSON.stringify({ error: "Email e senha são obrigatórios" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Rate limit key: IP + email (prevents both IP-based and account-based brute force)
  const key = `${ip}:${email}`;
  const now = Date.now();
  const record = attempts.get(key);

  // Check lockout
  if (record?.lockedUntil && now < record.lockedUntil) {
    const retryAfter = Math.ceil((record.lockedUntil - now) / 1000);
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        message: `Muitas tentativas. Tente novamente em ${retryAfter}s.`,
        retry_after: retryAfter,
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
        },
      }
    );
  }

  // Reset window if expired
  if (record && now - record.firstAttempt > WINDOW_MS) {
    attempts.delete(key);
  }

  // Attempt login via Supabase Auth
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Record failed attempt
    const current = attempts.get(key) || { count: 0, firstAttempt: now, lockedUntil: null };
    current.count += 1;

    if (current.count >= MAX_ATTEMPTS) {
      current.lockedUntil = now + LOCKOUT_MS;
      attempts.set(key, current);

      return new Response(
        JSON.stringify({
          error: "rate_limited",
          message: `Conta temporariamente bloqueada. Tente novamente em ${LOCKOUT_MS / 1000}s.`,
          retry_after: LOCKOUT_MS / 1000,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(LOCKOUT_MS / 1000),
          },
        }
      );
    }

    attempts.set(key, current);
    const remaining = MAX_ATTEMPTS - current.count;

    return new Response(
      JSON.stringify({
        error: "invalid_credentials",
        message: error.message,
        remaining_attempts: remaining,
      }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Success — clear attempts
  attempts.delete(key);

  // Return ONLY the tokens needed for setSession — never echo user details or credentials
  return new Response(
    JSON.stringify({
      session: {
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
      },
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
