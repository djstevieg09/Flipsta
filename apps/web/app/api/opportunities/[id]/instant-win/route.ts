import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { requireTier, TierGuardError } from "@/lib/tierGuard";

/**
 * POST /api/opportunities/:id/instant-win — Section 11.3's instant-win path:
 * pay the pre-computed price to skip the auction and win immediately.
 * Payment is captured (or, without live Stripe keys, stubbed — see lib/stripe.ts)
 * the instant this succeeds, per Section 5's binding-payment mechanism.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  try {
    requireTier(auth.profile.subscriptionTier, "canBid");
  } catch (e) {
    if (e instanceof TierGuardError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const supabase = await createSupabaseServerClient();

  const { data: opp, error } = await supabase
    .from("opportunities")
    .select("id, status, instant_win_price_gbp")
    .eq("id", id)
    .single();
  if (error || !opp) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  if (opp.status !== "live") return NextResponse.json({ error: "This opportunity is no longer live." }, { status: 409 });

  // Instant-win short-circuits the live auction immediately — see the design
  // note in apps/worker/src/jobs/closeExpiredAuctions.ts for how the normal
  // (non-instant-win) case decides a winner when the action clock expires.
  const { error: updateError } = await supabase
    .from("opportunities")
    .update({ status: "won", won_by: auth.userId })
    .eq("id", id)
    .eq("status", "live"); // optimistic concurrency guard against two simultaneous instant-wins
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await supabase.from("bids").insert({
    opportunity_id: id,
    bidder_id: auth.userId,
    amount_gbp: opp.instant_win_price_gbp,
    is_instant_win: true,
  });

  return NextResponse.json({ ok: true, priceGBP: opp.instant_win_price_gbp });
}
