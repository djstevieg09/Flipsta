import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/auth/callback — 27 Aug 2026, Steven: "need to have users be able
 * to login with google, facebook and apple." Supabase's OAuth flow redirects
 * the browser back here with a `code` param once the provider's consent
 * step is done (see SocialAuthButtons.tsx's signInWithOAuth call); exchanging
 * it for a session is what actually signs the user in.
 *
 * Redirects are anchored on NEXT_PUBLIC_SITE_URL rather than req.url, same
 * fix and same reasoning as api/auth/signout/route.ts ("when i sign out it
 * goes to local host") — not something to trust blindly behind Render's
 * proxy in production.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const errorDescription = url.searchParams.get("error_description");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const base = siteUrl ?? url.origin;

  if (!code) {
    const dest = new URL("/login", base);
    dest.searchParams.set("error", errorDescription || "Sign-in was cancelled or failed.");
    return NextResponse.redirect(dest);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    const dest = new URL("/login", base);
    dest.searchParams.set("error", error?.message ?? "Sign-in failed.");
    return NextResponse.redirect(dest);
  }

  // Reconcile a pending referral cookie (see SocialAuthButtons.tsx) now that
  // the profile row actually exists — best-effort only, a missed referral
  // credit should never block sign-in itself.
  const cookieStore = await cookies();
  const refCode = cookieStore.get("flipsta_ref")?.value;
  if (refCode) {
    try {
      const service = createSupabaseServiceClient();
      await service.rpc("apply_oauth_referral", {
        target_user_id: data.session.user.id,
        incoming_code: refCode,
      });
    } catch {
      // Best-effort — see above.
    }
    cookieStore.delete("flipsta_ref");
  }

  return NextResponse.redirect(new URL("/opportunities", base));
}
