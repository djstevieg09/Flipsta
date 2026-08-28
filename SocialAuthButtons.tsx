"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const PROVIDERS: { id: "google" | "facebook" | "apple"; label: string }[] = [
  { id: "google", label: "Google" },
  { id: "facebook", label: "Facebook" },
  { id: "apple", label: "Apple" },
];

/**
 * 27 Aug 2026, Steven: "need to have users be able to login with google,
 * facebook and apple." Shared between /login and /signup — Supabase's OAuth
 * doesn't distinguish "log in" from "sign up" the way our own email/password
 * forms do; signInWithOAuth either finds a matching existing identity or
 * creates a brand-new one, so one component and one call cover both pages.
 *
 * `refCode` is only ever passed from /signup (its existing ?ref=CODE
 * handling — see signup/page.tsx). signInWithOAuth has no equivalent of
 * signUp's `options.data` for attaching our own metadata before the user
 * exists, so the code is stashed in a short-lived, non-httpOnly cookie here
 * and picked back up by api/auth/callback/route.ts once the OAuth
 * round-trip completes and the profile row actually exists — see
 * 0026_social_login.sql's apply_oauth_referral() for the reconciliation.
 *
 * Provider setup (enabling each of these three in the Supabase dashboard,
 * and registering the app with Google/Facebook/Apple) is a one-time,
 * account-holder-only task — see INFRASTRUCTURE_TODO.md #12. With a
 * provider not yet enabled, Supabase just returns an error and the user
 * lands back on /login with a message — no crash, nothing to gate here.
 */
export function SocialAuthButtons({ refCode }: { refCode?: string | null }) {
  async function signInWith(provider: "google" | "facebook" | "apple") {
    if (refCode) {
      document.cookie = `flipsta_ref=${encodeURIComponent(refCode)}; path=/; max-age=600; SameSite=Lax`;
    }
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-textDim">
        <div className="flex-1 h-px bg-border" />
        or continue with
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {PROVIDERS.map((p) => (
          <button key={p.id} type="button" className="btn btn-ghost text-sm" onClick={() => signInWith(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
