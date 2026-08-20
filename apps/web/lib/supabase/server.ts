import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client for use inside Route Handlers and Server
 * Components. Reads the two env vars set up in INFRASTRUCTURE_TODO.md.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component with no response to write to — safe to ignore,
            // middleware.ts is what actually refreshes the session cookie.
          }
        },
      },
    },
  );
}

/**
 * Service-role client for worker-style operations (e.g. RLS-bypassing writes
 * from trusted API routes such as the Stripe webhook). Never expose this key
 * to the browser — see INFRASTRUCTURE_TODO.md for how it's set on Render.
 */
export function createSupabaseServiceClient() {
  const { createClient } = require("@supabase/supabase-js");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
