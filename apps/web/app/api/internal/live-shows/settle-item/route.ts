import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { createOrderForListing } from "@/lib/orderCreation";

export const dynamic = "force-dynamic";

/**
 * POST /api/internal/live-shows/settle-item — first use of the
 * worker-calls-web "internal API" pattern releaseEscrow.ts's own comment
 * already named but never actually built ("In production this calls the
 * web app's internal ... endpoint ... so the Stripe SDK stays in one
 * place"). apps/worker/src/jobs/closeExpiredLiveItems.ts calls this once
 * per expired live_show_items row instead of creating the order itself,
 * for exactly that reason: Stripe's SDK/keys only ever live in the web
 * app, and this is the one place that ever calls createEscrowPaymentIntent
 * on a buyer's behalf without an actual signed-in buyer request — a shared
 * secret (INTERNAL_API_SECRET, set identically on both Render services) is
 * what makes that safe instead of leaving this callable by anyone.
 *
 * Deliberately narrow: takes just an itemId, re-derives the winner from
 * live_bids itself rather than trusting whatever the caller says the
 * winner is — the worker decides WHEN (the clock expired), this route
 * still decides WHO/HOW MUCH from the real bid data.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "INTERNAL_API_SECRET isn't configured on flipsta-web." }, { status: 503 });
  }
  if (req.headers.get("x-internal-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { itemId } = await req.json();
  if (!itemId) return NextResponse.json({ error: "itemId is required." }, { status: 400 });

  const supabase = createSupabaseServiceClient();

  const { data: item, error: itemError } = await supabase
    .from("live_show_items")
    .select("id, status, listing_id")
    .eq("id", itemId)
    .single();
  if (itemError || !item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  if (item.status !== "active") {
    // Already settled (buy-now beat the clock, or this got called twice) —
    // not an error, just nothing to do.
    return NextResponse.json({ ok: true, alreadySettled: true });
  }

  const { data: highBid } = await supabase
    .from("live_bids")
    .select("bidder_id, amount_gbp")
    .eq("live_show_item_id", itemId)
    .order("amount_gbp", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!highBid) {
    const { error } = await supabase.from("live_show_items").update({ status: "unsold" }).eq("id", itemId).eq("status", "active");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, sold: false });
  }

  // Optimistic-concurrency claim, same shape as buy-now's — only the first
  // settlement call for this item actually proceeds.
  const { data: claimed, error: claimError } = await supabase
    .from("live_show_items")
    .update({ status: "sold", winning_bid_gbp: highBid.amount_gbp, winner_id: highBid.bidder_id })
    .eq("id", itemId)
    .eq("status", "active")
    .select()
    .single();
  if (claimError || !claimed) {
    return NextResponse.json({ ok: true, alreadySettled: true });
  }

  const result = await createOrderForListing(supabase, {
    listingId: item.listing_id,
    buyerId: highBid.bidder_id,
    priceOverrideGBP: highBid.amount_gbp,
  });
  if (!result.ok) {
    console.error(`[internal/live-shows/settle-item] order creation failed for item ${itemId}: ${result.error}`);
    return NextResponse.json({ error: `Item marked sold but order creation failed: ${result.error}` }, { status: 500 });
  }

  // Link the order back onto the item row for /live/[id]'s own display —
  // best-effort: the order itself already succeeded, so a failure to write
  // this pointer shouldn't be reported as the settlement having failed.
  await supabase.from("live_show_items").update({ order_id: result.order.id }).eq("id", itemId);

  return NextResponse.json({ ok: true, sold: true, orderId: result.order.id });
}
