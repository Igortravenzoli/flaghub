import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Prefer environment variables. Fallback values kept for local dev without .env.
// Production deployments must set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ??
  "https://nxmgppfyltwsqryfxkbm.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54bWdwcGZ5bHR3c3FyeWZ4a2JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDEwMDEsImV4cCI6MjA4NTExNzAwMX0.6TqJwx2_8dbFwbvflSZKVe6MSaagmPosQaxpg0l9Waw";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});