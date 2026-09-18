import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { requireTier, TierGuardError } from "@/lib/tierGuard";
import { autoListWonOpportunity } from "@/lib/autoListOpportunity";
import { awardLoyaltyCredit } from "@/lib/loyalty";

/**
 * POST /api/opportunities/:id/buy-slot — 18 Sept 2026, Steven: "we are
 * moving away from the bid and instant win on the site... get rid of
 * bidding and have a fixed price." The fixed-price equivalent of the old
 * bid/instant-win routes, for opportunities with pricing_mode='fixed_price'
 * (every opportunity discoverOpportunities.ts creates from migration 0034
 * onward — legacy 'auction' rows still use the old routes untouched).
 *
 * No auction, no quantity picker — one slot per person, at the price
 * already fixed on the row, paid in Flippy Coins ("remenber 1 coin = £1").
 * All the real work (row-locking the opportunity so two concurrent buyers
 * of the last slot can't both succeed, checking capacity, debiting coins,
 * recording the purchase, flipping to 'sold_out' once full) happens
 * atomically inside buy_deal_slot() (migration 0034) — this route just
 * calls it and translates the result/error into an HTTP response.
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

  const supabase = await createSupabaseServerClient();

  const { data: result, error: rpcError } = await supabase.rpc("buy_deal_slot", {
    p_opportunity_id: id,
    p_profile_id: auth.userId,
  });

  if (rpcError) {
    const message = rpcError.message ?? "Something went wrong.";
    // Postgres RAISE EXCEPTION messages come through verbatim in
    // rpcError.message — the CHECK constraint one (insufficient balance)
    // doesn't read well for a user, so it gets a friendlier message here.
    if (message.includes("flippy_coin_balance") || message.toLowerCase().includes("check constraint")) {
      return NextResponse.json({ error: "Not enough Flippy Coins for this deal — top up on the Coins page and try again." }, { status: 402 });
    }
    const status = message.includes("Sold out") || message.includes("already have a slot") || message.includes("no longer available") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  // Fetch the row fresh (unredacted, since this account now owns a slot on
  // it) to auto-list the resale and award loyalty credit — same "fully
  // automatic, no review screen" behaviour the old instant-win route had.
  const { data: opp } = await supabase
    .from("opportunities")
    .select(
      "id, category_id, categories(name), source_tier, source_retailer, source_price_gbp, expected_margin_gbp, product_name, image_url",
    )
    .eq("id", id)
    .single();

  let autoListed = false;
  let listingId: string | null = null;
  if (opp) {
    try {
      const { listing } = await autoListWonOpportunity(supabase, opp, auth.userId, 1);
      autoListed = true;
      listingId = listing.id;
    } catch (e) {
      console.error("Auto-list on deal-slot purchase failed:", e instanceof Error ? e.message : e);
    }
    await awardLoyaltyCredit(supabase, { profileId: auth.userId, spendGBP: result.priceCoins, referenceOpportunityId: id });
  }

  return NextResponse.json({
    ok: true,
    priceCoins: result.priceCoins,
    newBalance: result.newBalance,
    autoListed,
    listingId,
  });
}
