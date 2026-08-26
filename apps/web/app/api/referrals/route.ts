import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";

// Force-dynamic: same reasoning as every other route here — live application
// data straight from Supabase, never cached.
export const dynamic = "force-dynamic";

/**
 * GET /api/referrals — 26 Aug 2026, Steven: "we need a referral program."
 * referral_code and the wallet credits themselves are set up entirely in
 * migration 0016 (a signup trigger) — this route just reads what's already
 * there to power /referrals, it doesn't create anything.
 */
export async function GET() {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("referral_code")
    .eq("id", auth.userId)
    .single();
  if (error || !profile) return NextResponse.json({ error: "Couldn't load your referral code." }, { status: 500 });

  const { count: referredCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("referred_by", auth.userId);

  const { data: credits } = await supabase
    .from("wallet_transactions")
    .select("amount_gbp")
    .eq("profile_id", auth.userId)
    .eq("kind", "referral_credit");

  const totalEarnedGBP = (credits ?? []).reduce((sum, t) => sum + Number(t.amount_gbp ?? 0), 0);

  return NextResponse.json({
    code: profile.referral_code,
    referredCount: referredCount ?? 0,
    totalEarnedGBP: Math.round(totalEarnedGBP * 100) / 100,
  });
}
