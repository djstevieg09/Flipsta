import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

// Force-dynamic — every hit carries a one-time token, never cache this.
export const dynamic = "force-dynamic";

/**
 * GET /auth/confirm — 19 Sept 2026, Steven: "clicked verify email an d says
 * no spi found."
 *
 * Root cause: api/auth/send-email-hook/route.ts was building the
 * confirmation link as `${email_data.site_url}/auth/v1/verify?...` on the
 * assumption that `email_data.site_url` was Supabase's own project API
 * URL. It isn't — Supabase's docs confirm it's actually the *app's*
 * configured Site URL (flipsta.co.uk). So the link pointed at OUR domain's
 * `/auth/v1/verify`, which doesn't exist here (that path only exists on
 * Supabase's own project domain) — the token was never actually sent to
 * Supabase to verify, which is why the confirmation silently failed
 * (confirmed via the DB: email_confirmed_at stayed null for the real
 * signup this happened to).
 *
 * Rather than just fixing that URL to point at Supabase's real API domain,
 * this route replaces it with Supabase's own documented pattern for Next.js
 * email links (supabase.com/docs/guides/auth/server-side/nextjs): verify
 * the token_hash server-side with verifyOtp() and set the session cookie
 * directly, instead of redirecting to Supabase's hosted verify endpoint
 * (which, for our PKCE-flow signup tokens, would otherwise hand back a
 * `?code=` that needs exchanging against a code_verifier stored in
 * whichever browser/device started the signup — broken any time the email
 * is opened somewhere else, which is the normal case for a real person
 * clicking a link from their email app; see
 * supabase.com/docs/guides/auth/sessions/pkce-flow, "the code exchange
 * must be initiated on the same browser and device where the flow was
 * started"). verifyOtp only needs the token_hash itself, so this works
 * from any browser or device.
 *
 * Handles every auth-hook email type the same way (signup, recovery,
 * magiclink, email_change, invite) — send-email-hook/route.ts tells us
 * where to land afterwards via `next`.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") || "/opportunities";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const base = siteUrl ?? url.origin;

  if (!token_hash || !type) {
    const dest = new URL("/login", base);
    dest.searchParams.set("error", "This confirmation link is missing information — please request a new one.");
    return NextResponse.redirect(dest);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });

  if (error) {
    const dest = new URL("/login", base);
    dest.searchParams.set("error", error.message || "This confirmation link is invalid or has expired.");
    return NextResponse.redirect(dest);
  }

  return NextResponse.redirect(new URL(next, base));
}
