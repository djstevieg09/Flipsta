import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { requireTier, TierGuardError } from "@/lib/tierGuard";
import { autoListWonOpportunity } from "@/lib/autoListOpportunity";
import { awardLoyaltyCredit } from "@/lib/loyalty";

/**
 * POST /api/opportunities/:id/instant-win — Section 11.3's instant-win path:
 * pay the pre-computed price to skip the auction and win immediately.
 * Payment is captured (or, without live Stripe keys, stubbed — see lib/stripe.ts)
 * the instant this succeeds, per Section 5's binding-payment mechanism.
 *
 * 26 Aug 2026, Steven: "when someone buys an oppotunity it should list the
 * item straight away once they have confirmed how many units they
 * brought." Body now optionally carries { quantity }, validated against
 * however many units are actually available and however many one buyer's
 * allowed to take — then, once the win itself is locked in, this same
 * request finishes by turning it straight into a live listing via
 * autoListWonOpportunity (fully automatic, no review screen, per Steven's
 * confirmed answer).
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

  let quantity = 1;
  try {
    const body = await req.json();
    if (body && body.quantity !== undefined) quantity = Number(body.quantity);
  } catch {
    // No body (or non-JSON) sent — default to 1, same as before quantity existed.
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return NextResponse.json({ error: "quantity must be a positive whole number." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: opp, error } = await supabase
    .from("opportunities")
    .select(
      "id, status, instant_win_price_gbp, category_id, categories(name), source_tier, source_retailer, source_price_gbp, expected_margin_gbp, product_name, image_url, estimated_stock_units, per_customer_cap",
    )
    .eq("id", id)
    .single();
  if (error || !opp) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  if (opp.status !== "live") return NextResponse.json({ error: "This opportunity is no longer live." }, { status: 409 });
  if (typeof opp.estimated_stock_units === "number" && quantity > opp.estimated_stock_units) {
    return NextResponse.json({ error: `Only ${opp.estimated_stock_units} unit(s) available.` }, { status: 400 });
  }
  if (typeof opp.per_customer_cap === "number" && quantity > opp.per_customer_cap) {
    return NextResponse.json({ error: `You can take at most ${opp.per_customer_cap} unit(s) of this opportunity.` }, { status: 400 });
  }

  // Instant-win short-circuits the live auction immediately — see the design
  // note in apps/worker/src/jobs/closeExpiredAuctions.ts for how the normal
  // (non-instant-win) case decides a winner when the action clock expires.
  //
  // 26 Aug 2026 real bug: an update that matches zero rows (whether from
  // the .eq() filters below, or — what actually happened in production —
  // an RLS policy silently blocking it) returns NO error from
  // supabase-js, just an empty result. The old code only checked
  // `error`, so it reported "You won it!" even when nothing had changed.
  // Chaining .select() and checking that a row actually came back is what
  // catches both a real RLS gap (see migration 0011) and the legitimate
  // case of someone else winning it a moment earlier.
  const { data: updated, error: updateError } = await supabase
    .from("opportunities")
    .update({ status: "won", won_by: auth.userId })
    .eq("id", id)
    .eq("status", "live") // optimistic concurrency guard against two simultaneous instant-wins
    .select("id")
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!updated) {
    return NextResponse.json({ error: "This opportunity was just won by someone else, or is no longer live." }, { status: 409 });
  }

  // instant_win_price_gbp, like source_price_gbp and per_customer_cap
  // elsewhere (see apps/worker/src/jobs/flagRiskSignals.ts and
  // evaluateBatchRelisting.ts, which both compute exposure as
  // per_customer_cap * source_price_gbp — a per-unit price), is a per-unit
  // figure. Paying for more than one unit means paying for each of them.
  const totalPriceGBP = Math.round(opp.instant_win_price_gbp * quantity * 100) / 100;

  await supabase.from("bids").insert({
    opportunity_id: id,
    bidder_id: auth.userId,
    amount_gbp: totalPriceGBP,
    is_instant_win: true,
  });

  // 27 Aug 2026: the "investment" stage of the Hook Model — see lib/loyalty.ts.
  await awardLoyaltyCredit(supabase, { profileId: auth.userId, spendGBP: totalPriceGBP, referenceOpportunityId: id });

  // Auto-list straight away — Steven's confirmed "fully automatic, no
  // review screen" answer. The win itself is already locked in above (the
  // optimistic-concurrency update succeeded and the bid row is recorded),
  // so a failure here shouldn't undo the win or hide it from the buyer —
  // it just means autoListed comes back false and the item is still
  // listable by hand from /sell/new, same as before this feature existed.
  let autoListed = false;
  let listingId: string | null = null;
  try {
    const { listing } = await autoListWonOpportunity(supabase, opp, auth.userId, quantity);
    autoListed = true;
    listingId = listing.id;
  } catch (e) {
    console.error("Auto-list on instant win failed:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true, priceGBP: totalPriceGBP, quantity, autoListed, listingId });
}
