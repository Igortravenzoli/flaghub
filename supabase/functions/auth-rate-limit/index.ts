import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Rate-limited login proxy.
 *
 * Tracks failed attempts per email in the `login_attempts` DB table.
 * Persists across cold starts and shared across all edge function instances.
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 min window
const LOCKOUT_MS = 60 * 1000; // 60s lockout

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Service role client for login_attempts table (bypasses RLS)
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  // Anon client for auth (signInWithPassword)
  const anonClient = createClient(supabaseUrl, supabaseAnonKey);

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

  // Cleanup old entries periodically (best-effort, non-blocking)
  Promise.resolve(adminClient.rpc("cleanup_login_attempts")).then(() => {}).catch(() => {});

  const now = new Date();

  // Fetch current attempt record from DB
  const { data: record } = await adminClient
    .from("login_attempts")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  // Check lockout
  if (record?.locked_until) {
    const lockedUntil = new Date(record.locked_until);
    if (now < lockedUntil) {
      const retryAfter = Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000);
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
  }

  // Reset window if expired
  if (record) {
    const firstAttempt = new Date(record.first_attempt_at);
    if (now.getTime() - firstAttempt.getTime() > WINDOW_MS) {
      await adminClient.from("login_attempts").delete().eq("email", email);
    }
  }

  // Attempt login via Supabase Auth
  const { data, error } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Record failed attempt in DB
    const currentCount = record?.attempt_count ?? 0;
    const newCount = currentCount + 1;

    if (newCount >= MAX_ATTEMPTS) {
      // Lock the account
      const lockedUntil = new Date(now.getTime() + LOCKOUT_MS).toISOString();

      await adminClient
        .from("login_attempts")
        .upsert({
          email,
          attempt_count: newCount,
          first_attempt_at: record?.first_attempt_at ?? now.toISOString(),
          locked_until: lockedUntil,
        }, { onConflict: "email" });

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

    // Increment counter
    await adminClient
      .from("login_attempts")
      .upsert({
        email,
        attempt_count: newCount,
        first_attempt_at: record?.first_attempt_at ?? now.toISOString(),
        locked_until: null,
      }, { onConflict: "email" });

    const remaining = MAX_ATTEMPTS - newCount;

    return new Response(
      JSON.stringify({
        error: "invalid_credentials",
        message: "Invalid login credentials",
        remaining_attempts: remaining,
      }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Success — clear attempts
  await adminClient.from("login_attempts").delete().eq("email", email);

  // Return ONLY the tokens needed for setSession
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
