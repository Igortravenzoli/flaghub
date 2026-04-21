import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Auth rate-limit helper.
 *
 * Supports three modes via `action` field in request body:
 *
 *   action: "check"   — Check if the email is currently rate-limited.
 *                        Only `email` is required. No password is ever sent here.
 *                        Returns { ok: true } or { error: "rate_limited", retry_after: N }.
 *
 *   action: "record"  — Record the outcome of a login attempt that was authenticated
 *                        directly in the browser. Requires `email` + `success: boolean`.
 *                        Returns { ok: true }.
 *
 *   action: "legacy"  — (backward compat) Receives email + password, performs the
 *                        signInWithPassword call server-side, and returns session tokens.
 *                        Use only when the direct-browser flow is unavailable.
 *
 * Tracks failed attempts per email in the `login_attempts` DB table.
 * Persists across cold starts and shared across all edge function instances.
 * Logs login events and suspicious activity to hub_audit_logs.
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 min window
const LOCKOUT_MS = 60 * 1000; // 60s lockout

/** Best-effort audit log insert (non-blocking) */
function auditLog(
  adminClient: ReturnType<typeof createClient>,
  action: string,
  metadata: Record<string, unknown>,
  actorUserId?: string | null,
) {
  adminClient
    .from("hub_audit_logs")
    .insert({
      action,
      actor_user_id: actorUserId ?? null,
      entity_type: "auth",
      entity_id: (metadata.email as string) ?? null,
      metadata,
    })
    .then(({ error }: { error: unknown }) => {
      if (error) console.warn("[audit] insert failed:", (error as Error).message);
    });
}

/** Fetch the current rate-limit record for an email */
async function fetchRecord(adminClient: ReturnType<typeof createClient>, email: string) {
  const { data } = await adminClient
    .from("login_attempts")
    .select("*")
    .eq("email", email)
    .maybeSingle();
  return data as {
    email: string;
    attempt_count: number;
    first_attempt_at: string;
    locked_until: string | null;
  } | null;
}

/** Check if a record is currently locked. Returns remaining seconds or 0. */
function lockedSeconds(record: Awaited<ReturnType<typeof fetchRecord>>, now: Date): number {
  if (!record?.locked_until) return 0;
  const until = new Date(record.locked_until);
  const remaining = Math.ceil((until.getTime() - now.getTime()) / 1000);
  return remaining > 0 ? remaining : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Service role client for login_attempts table (bypasses RLS)
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  const action = (body.action as string) ?? "legacy";
  const email = (body.email as string)?.toLowerCase()?.trim();

  if (!email) {
    return new Response(
      JSON.stringify({ error: "Email is required" }),
      { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Cleanup old entries periodically (best-effort, non-blocking)
  Promise.resolve(adminClient.rpc("cleanup_login_attempts")).then(() => {}).catch(() => {});

  const now = new Date();

  // ── ACTION: check ─────────────────────────────────────────────────────────
  // Only email is sent — no credentials reach this function.
  if (action === "check") {
    const record = await fetchRecord(adminClient, email);

    // Reset expired window
    if (record && !record.locked_until) {
      const firstAttempt = new Date(record.first_attempt_at);
      if (now.getTime() - firstAttempt.getTime() > WINDOW_MS) {
        await adminClient.from("login_attempts").delete().eq("email", email);
      }
    }

    const remaining = lockedSeconds(record, now);
    if (remaining > 0) {
      auditLog(adminClient, "login_blocked_repeat", {
        email,
        ip: clientIp,
        reason: "request_while_locked",
        locked_until: record?.locked_until,
        attempt_count: record?.attempt_count,
      });

      return new Response(
        JSON.stringify({
          error: "rate_limited",
          message: `Muitas tentativas. Tente novamente em ${remaining}s.`,
          retry_after: remaining,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders(req),
            "Content-Type": "application/json",
            "Retry-After": String(remaining),
          },
        },
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // ── ACTION: record ────────────────────────────────────────────────────────
  // Records the result of a browser-side signInWithPassword call.
  if (action === "record") {
    const success = body.success === true;
    const record = await fetchRecord(adminClient, email);

    if (success) {
      // Clear attempts on success
      await adminClient.from("login_attempts").delete().eq("email", email);
      auditLog(adminClient, "login_success", { email, ip: clientIp });
    } else {
      // Reset expired window before incrementing
      if (record) {
        const firstAttempt = new Date(record.first_attempt_at);
        if (now.getTime() - firstAttempt.getTime() > WINDOW_MS) {
          await adminClient.from("login_attempts").delete().eq("email", email);
        }
      }

      const currentCount = record?.attempt_count ?? 0;
      const newCount = currentCount + 1;

      if (newCount >= MAX_ATTEMPTS) {
        const lockedUntil = new Date(now.getTime() + LOCKOUT_MS).toISOString();
        await adminClient.from("login_attempts").upsert(
          {
            email,
            attempt_count: newCount,
            first_attempt_at: record?.first_attempt_at ?? now.toISOString(),
            locked_until: lockedUntil,
          },
          { onConflict: "email" },
        );
        auditLog(adminClient, "login_lockout", {
          email,
          ip: clientIp,
          reason: "max_attempts_reached",
          attempt_count: newCount,
          locked_until: lockedUntil,
        });
      } else {
        await adminClient.from("login_attempts").upsert(
          {
            email,
            attempt_count: newCount,
            first_attempt_at: record?.first_attempt_at ?? now.toISOString(),
            locked_until: null,
          },
          { onConflict: "email" },
        );
        auditLog(adminClient, "login_failed", {
          email,
          ip: clientIp,
          attempt_count: newCount,
          remaining_attempts: MAX_ATTEMPTS - newCount,
        });
      }
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // ── ACTION: legacy ────────────────────────────────────────────────────────
  // Backward-compat: receives email + password and performs the auth call here.
  // Prefer the check + record flow from Login.tsx instead.
  const password = body.password as string;
  if (!password) {
    return new Response(
      JSON.stringify({ error: "Email e senha são obrigatórios" }),
      { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  const record = await fetchRecord(adminClient, email);

  // Check lockout
  const remaining = lockedSeconds(record, now);
  if (remaining > 0) {
    auditLog(adminClient, "login_blocked_repeat", {
      email,
      ip: clientIp,
      reason: "request_while_locked",
      locked_until: record?.locked_until,
      attempt_count: record?.attempt_count,
    });
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        message: `Muitas tentativas. Tente novamente em ${remaining}s.`,
        retry_after: remaining,
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders(req),
          "Content-Type": "application/json",
          "Retry-After": String(remaining),
        },
      },
    );
  }

  // Reset expired window
  if (record) {
    const firstAttempt = new Date(record.first_attempt_at);
    if (now.getTime() - firstAttempt.getTime() > WINDOW_MS) {
      await adminClient.from("login_attempts").delete().eq("email", email);
    }
  }

  // Anon client for auth (signInWithPassword) — only in legacy mode
  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error: authError } = await anonClient.auth.signInWithPassword({ email, password });

  if (authError) {
    const currentCount = record?.attempt_count ?? 0;
    const newCount = currentCount + 1;

    if (newCount >= MAX_ATTEMPTS) {
      const lockedUntil = new Date(now.getTime() + LOCKOUT_MS).toISOString();
      await adminClient.from("login_attempts").upsert(
        {
          email,
          attempt_count: newCount,
          first_attempt_at: record?.first_attempt_at ?? now.toISOString(),
          locked_until: lockedUntil,
        },
        { onConflict: "email" },
      );
      auditLog(adminClient, "login_lockout", {
        email,
        ip: clientIp,
        reason: "max_attempts_reached",
        attempt_count: newCount,
        locked_until: lockedUntil,
      });
      return new Response(
        JSON.stringify({
          error: "rate_limited",
          message: `Conta temporariamente bloqueada. Tente novamente em ${LOCKOUT_MS / 1000}s.`,
          retry_after: LOCKOUT_MS / 1000,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders(req),
            "Content-Type": "application/json",
            "Retry-After": String(LOCKOUT_MS / 1000),
          },
        },
      );
    }

    await adminClient.from("login_attempts").upsert(
      {
        email,
        attempt_count: newCount,
        first_attempt_at: record?.first_attempt_at ?? now.toISOString(),
        locked_until: null,
      },
      { onConflict: "email" },
    );
    const remainingAttempts = MAX_ATTEMPTS - newCount;
    auditLog(adminClient, "login_failed", {
      email,
      ip: clientIp,
      attempt_count: newCount,
      remaining_attempts: remainingAttempts,
    });
    return new Response(
      JSON.stringify({
        error: "invalid_credentials",
        message: "Invalid login credentials",
        remaining_attempts: remainingAttempts,
      }),
      { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Success — clear attempts
  await adminClient.from("login_attempts").delete().eq("email", email);
  auditLog(adminClient, "login_success", { email, ip: clientIp }, data.user?.id);

  return new Response(
    JSON.stringify({
      session: {
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
      },
    }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
  );
});
