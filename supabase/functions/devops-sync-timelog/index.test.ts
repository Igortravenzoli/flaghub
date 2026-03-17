import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.test("timelog sync - invoke with cron secret", async () => {
  const url = Deno.env.get('SUPABASE_URL');
  const cronSecret = Deno.env.get('CRON_SECRET');
  
  console.log(`URL: ${url}/functions/v1/devops-sync-timelog`);
  console.log(`Has CRON_SECRET: ${!!cronSecret}`);
  
  const resp = await fetch(
    `${url}/functions/v1/devops-sync-timelog`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': cronSecret || '',
      },
      body: JSON.stringify({ source: 'test' }),
    }
  );
  
  const body = await resp.text();
  console.log('Status:', resp.status);
  console.log('Response:', body);
  
  assertEquals(resp.status, 200, `Expected 200 but got ${resp.status}: ${body}`);
});
