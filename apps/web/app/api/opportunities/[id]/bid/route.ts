import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { requireTier, TierGuardError } from "@/lib/tierGuard";

/**
 * POST /api/opportunities/:id/bid — Section 11.5's core mechanic: a live
 * ascending auction for the exclusive right to act on the opportunity.
 * Binding the instant a bid clears the current high bid is what Section 5
 * calls out as the actual anti-free-riding mechanism — not the redaction.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  try {
    requireTier(auth.profile.subscriptionTier, "canBid");
  } catch (e) {
    if (e instanceof TierGuardError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const { amountGBP } = await req.json();
  if (typeof amountGBP !== "number" || amountGBP <= 0) {
    return NextResponse.json({ error: "amountGBP must be a positive number." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: opp, error: oppError } = await supabase
    .from("opportunities")
    .select("id, status, starting_bid_gbp, action_clock_expires_at, action_clock_seconds")
    .eq("id", id)
    .single();
  if (oppError || !opp) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  if (opp.status !== "live") return NextResponse.json({ error: "This opportunity is no longer live." }, { status: 409 });

  const { data: highBid } = await supabase
    .from("bids")
    .select("amount_gbp")
    .eq("opportunity_id", id)
    .order("amount_gbp", { ascending: false })
    .limit(1)
    .maybeSingle();

  const floor = highBid?.amount_gbp ?? opp.starting_bid_gbp;
  if (amountGBP <= floor) {
    return NextResponse.json({ error: `Bid must be higher than the current bid of £${floor}.` }, { status: 409 });
  }

  const { error: insertError } = await supabase.from("bids").insert({
    opportunity_id: id,
    bidder_id: auth.userId,
    amount_gbp: amountGBP,
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Winning is decided when the action clock actually expires (worker job —
  // see apps/worker/src/jobs/closeExpiredAuctions.ts) so a later, higher bid
  // within the window can still overtake this one before it locks in.
  return NextResponse.json({ ok: true, amountGBP });
}
