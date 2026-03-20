import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};


const PROJECT_REF = "nxmgppfyltwsqryfxkbm";


const MANAGED_JOBS: Record<string, { cronName: string; defaultSchedule: string; functionName: string }> = {
  devops_sync_all_default: {
    cronName: "sync-devops-all",
    defaultSchedule: "*/10 * * * *",
    functionName: "devops-sync-all",
  },
  gateway_helpdesk_clients_default: {
    cronName: "sync-vdesk-clientes",
    defaultSchedule: "*/15 * * * *",
    functionName: "vdesk-sync-base-clientes",
  },
  gateway_helpdesk_dashboard_default: {
    cronName: "sync-vdesk-helpdesk",
    defaultSchedule: "*/15 * * * *",
    functionName: "vdesk-sync-helpdesk",
  },
  "devops-sync-timelog": {
    cronName: "sync-devops-timelog",
    defaultSchedule: "*/15 * * * *",
    functionName: "devops-sync-timelog",
  },

  "devops-sync-qualidade": {
    cronName: "sync-devops-qualidade",
    defaultSchedule: "*/10 * * * *",
    functionName: "devops-sync-qualidade",
  },

};

const EXTRA_DISABLE_ONLY_JOBS = [
  "cleanup-helpdesk-snapshots-daily",
  "cleanup-hub-raw-ingestions-daily",
] as const;

const INTERVAL_PRESETS: Record<number, string> = {
  5: "*/5 * * * *",
  10: "*/10 * * * *",
  15: "*/15 * * * *",
  30: "*/30 * * * *",
  60: "0 * * * *",
  120: "0 */2 * * *",
  360: "0 */6 * * *",
  720: "0 */12 * * *",
  1440: "0 0 * * *",
};

type RequestBody =
  | { action: "toggle_job"; job_key: string; enabled: boolean }
  | { action: "update_interval"; job_key: string; interval_minutes: number }
  | { action: "disable_all" }
  | { action: "list_intervals" };

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function getUserClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

async function requirePrivilegedUser(req: Request): Promise<string> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Autenticação obrigatória" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = getUserClient(authHeader);
  const { data: { user }, error } = await userClient.auth.getUser();

  if (error || !user) {
    throw new Response(JSON.stringify({ error: "Sessão inválida" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = getAdminClient();
  const { data: roles, error: rolesError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["admin", "gestao"]);

  if (rolesError || !roles?.length) {
    throw new Response(JSON.stringify({ error: "Permissão negada" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return user.id;
}

function buildCronCommand(functionName: string) {
  return `SELECT net.http_post(
    url := 'https://${PROJECT_REF}.supabase.co/functions/v1/${functionName}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_cron_secret()
    ),
    body := '{}'::jsonb
  ) AS request_id;`;
}

function getSqlClient() {
  return postgres(Deno.env.get("SUPABASE_DB_URL")!, {
    ssl: "require",
    max: 1,
    prepare: false,
    idle_timeout: 5,
    connect_timeout: 10,
  });
}

async function cronJobExists(sql: any, cronName: string) {
  const rows = await sql`
    SELECT EXISTS(
      SELECT 1 FROM cron.job WHERE jobname = ${cronName}
    ) AS exists
  `;
  return rows[0]?.exists ?? false;
}

async function unscheduleIfExists(sql: any, cronName: string) {
  if (await cronJobExists(sql, cronName)) {
    await sql`SELECT cron.unschedule(${cronName})`;
  }
}

async function reschedule(sql: any, cronName: string, schedule: string, functionName: string) {
  // Always remove first then re-create to update the schedule
  await unscheduleIfExists(sql, cronName);
  await sql`SELECT cron.schedule(${cronName}, ${schedule}, ${buildCronCommand(functionName)})`;
}

function minutesToCron(minutes: number): string {
  if (INTERVAL_PRESETS[minutes]) return INTERVAL_PRESETS[minutes];
  if (minutes < 60) return `*/${minutes} * * * *`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    return `0 */${hours} * * *`;
  }
  return "0 0 * * *"; // daily fallback
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

  try {
    await requirePrivilegedUser(req);

    const body = await req.json() as RequestBody;
    const admin = getAdminClient();

    // List intervals doesn't need DB connection
    if (body.action === "list_intervals") {
      return new Response(JSON.stringify({
        success: true,
        presets: Object.entries(INTERVAL_PRESETS).map(([min, cron]) => ({
          minutes: Number(min),
          cron,
          label: Number(min) < 60 ? `${min} min` : Number(min) < 1440 ? `${Number(min) / 60}h` : "Diário",
        })),
        jobs: Object.entries(MANAGED_JOBS).map(([key, job]) => ({
          job_key: key,
          cron_name: job.cronName,
          default_schedule: job.defaultSchedule,
          function_name: job.functionName,
        })),
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sql = getSqlClient();

    try {
      if (body.action === "disable_all") {
        const cronNames = [
          ...Object.values(MANAGED_JOBS).map((job) => job.cronName),
          ...EXTRA_DISABLE_ONLY_JOBS,
        ];

        for (const cronName of cronNames) {
          await unscheduleIfExists(sql, cronName);
        }

        await admin
          .from("hub_sync_jobs")
          .update({ enabled: false, next_run_at: null })
          .in("job_key", Object.keys(MANAGED_JOBS));

        return new Response(JSON.stringify({
          success: true,
          disabled_jobs: cronNames,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (body.action === "update_interval") {
        if (!(body.job_key in MANAGED_JOBS)) {
          return new Response(JSON.stringify({ error: "Job não suportado" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const minutes = body.interval_minutes;
        if (!minutes || minutes < 5 || minutes > 1440) {
          return new Response(JSON.stringify({ error: "Intervalo deve ser entre 5 e 1440 minutos" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const job = MANAGED_JOBS[body.job_key];
        const newCron = minutesToCron(minutes);

        // Check if job is currently enabled
        const { data: jobRow } = await admin
          .from("hub_sync_jobs")
          .select("enabled")
          .eq("job_key", body.job_key)
          .maybeSingle();

        // If enabled, reschedule the cron; otherwise just update the DB
        if (jobRow?.enabled) {
          await reschedule(sql, job.cronName, newCron, job.functionName);
        }

        await admin
          .from("hub_sync_jobs")
          .update({ schedule_minutes: minutes, schedule_cron: newCron })
          .eq("job_key", body.job_key);

        return new Response(JSON.stringify({
          success: true,
          job_key: body.job_key,
          interval_minutes: minutes,
          cron_expression: newCron,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (body.action === "toggle_job") {
        if (!(body.job_key in MANAGED_JOBS)) {
          return new Response(JSON.stringify({ error: "Job não suportado" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const job = MANAGED_JOBS[body.job_key];

        if (body.enabled) {
          // Get custom schedule if set
          const { data: jobRow } = await admin
            .from("hub_sync_jobs")
            .select("schedule_cron")
            .eq("job_key", body.job_key)
            .maybeSingle();

          const schedule = jobRow?.schedule_cron || job.defaultSchedule;
          await reschedule(sql, job.cronName, schedule, job.functionName);
        } else {
          await unscheduleIfExists(sql, job.cronName);
        }

        await admin
          .from("hub_sync_jobs")
          .update({ enabled: body.enabled, next_run_at: null })
          .eq("job_key", body.job_key);

        return new Response(JSON.stringify({
          success: true,
          job_key: body.job_key,
          enabled: body.enabled,
          cron_name: job.cronName,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Ação não reconhecida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    const message = error instanceof Error ? error.message : "Erro interno";
    console.error("[manage-sync-schedules]", message);

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
