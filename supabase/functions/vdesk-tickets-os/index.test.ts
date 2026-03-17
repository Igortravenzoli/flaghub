import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
await load({ export: true, allowEmptyValues: true });
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const BASE = `${SUPABASE_URL}/functions/v1/vdesk-proxy`;

Deno.test("vdesk-proxy: rejeita sem auth", async () => {
  const res = await fetch(`${BASE}?action=status`, {
    headers: { "Content-Type": "application/json" },
  });
  const body = await res.json();
  assertEquals(res.status, 401);
  assertExists(body.error);
});

Deno.test("vdesk-proxy: CORS preflight OK", async () => {
  const res = await fetch(BASE, { method: "OPTIONS" });
  const text = await res.text();
  assertEquals(res.status, 200);
  assertExists(res.headers.get("access-control-allow-origin"));
});

Deno.test("vdesk-proxy: status com auth", async () => {
  // Login to get a real token
  const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email: "admin@flag.com.br", password: "admin123" }),
  });
  const loginData = await loginRes.json();
  
  if (!loginData.access_token) {
    console.log("Skipping auth test - could not login:", JSON.stringify(loginData));
    return;
  }

  const res = await fetch(`${BASE}?action=status`, {
    headers: {
      "Authorization": `Bearer ${loginData.access_token}`,
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
  });
  const body = await res.json();
  await console.log("Status response:", JSON.stringify(body, null, 2));
  assertEquals(res.status, 200);
  assertExists(body.activeEndpoint);
});

Deno.test("vdesk-proxy: correlacao sem ticketNestle retorna 400", async () => {
  const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: "admin@flag.com.br", password: "admin123" }),
  });
  const loginData = await loginRes.json();
  if (!loginData.access_token) return;

  const res = await fetch(`${BASE}?action=correlacao`, {
    headers: {
      "Authorization": `Bearer ${loginData.access_token}`,
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
  });
  const body = await res.json();
  assertEquals(res.status, 400);
});
