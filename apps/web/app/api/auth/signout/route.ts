import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/auth/signout — 27 Aug 2026, Steven: "when i sign out it goes to
 * local host, needs to go back to main page." `new URL("/", req.url)` was
 * building the redirect off whatever the incoming request's own URL
 * happened to resolve to — fine in local dev, but not something to trust in
 * production if a proxy/hosting layer ever hands Next.js an unexpected Host.
 * Now anchored to NEXT_PUBLIC_SITE_URL (the app's one real, canonical
 * public URL — see render.yaml) whenever it's set, so signing out always
 * lands on flipsta.co.uk's homepage regardless of what the request itself
 * looked like; only falls back to req.url when that env var isn't set at
 * all (e.g. a local dev box with no .env entry for it).
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  return NextResponse.redirect(siteUrl ? new URL("/", siteUrl) : new URL("/", req.url));
}
