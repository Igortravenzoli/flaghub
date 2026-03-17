import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import postgres from "npm:postgres@3.4.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROJECT_REF = "onpdhywrzjtwxaxuvijw";
const MANAGED_JOBS = {
  devops_sync_all_default: {
    cronName: "sync-devops-all",
    schedule: "*/10 * * * *",
    functionName: "devops-sync-all",
  },
  gateway_helpdesk_clients_default: {
    cronName: "sync-vdesk-clientes",
    schedule: "*/15 * * * *",
    functionName: "vdesk-sync-base-clientes",
  },
  gateway_helpdesk_dashboard_default: {
    cronName: "sync-vdesk-helpdesk",
    schedule: "*/15 * * * *",
    functionName: "vdesk-sync-helpdesk",
  },
  "devops-sync-timelog": {
    cronName: "sync-devops-timelog",
    schedule: "*/15 * * * *",
    functionName: "devops-sync-timelog",
  },
} as const;

const EXTRA_DISABLE_ONLY_JOBS = [
  "cleanup-helpdesk-snapshots-daily",
  "cleanup-hub-raw-ingestions-daily",
] as const;

type ManagedJobKey = keyof typeof MANAGED_JOBS;

type RequestBody =
  | { action: "toggle_job"; job_key: ManagedJobKey; enabled: boolean }
  | { action: "disable_all" };

function getAdminClient(authHeader?: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    authHeader ? { global: { headers: { Authorization: authHeader } } } : undefined,
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
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  const userId = claimsData?.claims?.sub as string | undefined;

  if (claimsError || !userId) {
    throw new Response(JSON.stringify({ error: "Sessão inválida" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = getAdminClient();
  const { data: roles, error: rolesError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "gestao"]);

  if (rolesError || !roles?.length) {
    throw new Response(JSON.stringify({ error: "Permissão negada" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return userId;
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

async function cronJobExists(sql: postgres.Sql, cronName: string) {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1
      FROM cron.job
      WHERE jobname = ${cronName}
    ) AS exists
  `;
  return rows[0]?.exists ?? false;
}

async function unscheduleIfExists(sql: postgres.Sql, cronName: string) {
  if (await cronJobExists(sql, cronName)) {
    await sql`SELECT cron.unschedule(${cronName})`;
  }
}

async function ensureScheduled(sql: postgres.Sql, cronName: string, schedule: string, functionName: string) {
  if (!(await cronJobExists(sql, cronName))) {
    await sql`SELECT cron.schedule(${cronName}, ${schedule}, ${buildCronCommand(functionName)})`;
  }
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

      if (!(body.job_key in MANAGED_JOBS)) {
        return new Response(JSON.stringify({ error: "Job não suportado" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const job = MANAGED_JOBS[body.job_key];

      if (body.enabled) {
        await ensureScheduled(sql, job.cronName, job.schedule, job.functionName);
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
