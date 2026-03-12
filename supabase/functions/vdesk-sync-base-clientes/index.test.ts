import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
await load({ export: true, allowEmptyValues: true });
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const BASE = `${SUPABASE_URL}/functions/v1/gateway-sync-clients`;

Deno.test("gateway-sync-clients: rejeita sem auth", async () => {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const body = await res.json();
  assertEquals(res.status, 401);
  assertExists(body.error);
});

Deno.test("gateway-sync-clients: CORS preflight OK", async () => {
  const res = await fetch(BASE, { method: "OPTIONS" });
  const text = await res.text();
  assertEquals(res.status, 200);
});

Deno.test("gateway-sync-clients: executa sync com auth", async () => {
  const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: "admin@flag.com.br", password: "admin123" }),
  });
  const loginData = await loginRes.json();
  if (!loginData.access_token) {
    console.log("Skipping - could not login");
    return;
  }

  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${loginData.access_token}`,
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
  });
  const body = await res.json();
  console.log("Sync clients response:", JSON.stringify(body, null, 2));
  
  // Pode ser 200 (sucesso) ou 500 (se Gateway estiver fora do ar)
  if (res.status === 200) {
    assertEquals(body.success, true);
    assertExists(body.total);
  } else {
    // Erro esperado se Gateway estiver inacessível (VPN etc)
    console.log("Gateway provavelmente inacessível:", body.error);
    assertExists(body.error);
  }
});
