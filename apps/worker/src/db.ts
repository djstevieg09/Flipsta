import { createClient } from "@supabase/supabase-js";

/**
 * The worker always uses the service-role key — it runs trusted, off the
 * critical request path, and needs to bypass RLS to sweep every user's
 * opportunities/orders. Never reuse this client in the web app's browser code.
 */
export function createDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — see INFRASTRUCTURE_TODO.md to configure the worker's environment on Render.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
