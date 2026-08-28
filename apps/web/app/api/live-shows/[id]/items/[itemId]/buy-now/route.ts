import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { createOrderForListing } from "@/lib/orderCreation";

export const dynamic = "force-dynamic";

/**
 * POST /api/live-shows/:id/items/:itemId/buy-now — the impatient-buyer
 * escape hatch alongside the live auction, same "instant-win sits
 * alongside the live auction, not instead of it" shape opportunities
 * already use. Settles the item and creates the order right here,
 * synchronously — unlike a plain live_bids row, this needs the real
 * checkout/escrow machinery immediately, via the shared
 * createOrderForListing helper (lib/orderCreation.ts) so it behaves
 * identically to any other Flipsta purchase.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { itemId } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();

  const { data: item, error: itemError } = await supabase
    .from("live_show_items")
    .select("id, status, listing_id, buy_now_price_gbp, ends_at")
    .eq("id", itemId)
    .single();
  if (itemError || !item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  if (item.status !== "active") return NextResponse.json({ error: "This item isn't live right now." }, { status: 409 });
  if (item.buy_now_price_gbp === null) return NextResponse.json({ error: "This item doesn't have a buy-now price." }, { status: 400 });

  // Optimistic-concurrency guard: only the FIRST buy-now request actually
  // settles the item — everyone else racing this same click gets a clean
  // 409, not a duplicate order. Mirrors opportunities' instant-win route.
  const { data: claimed, error: claimError } = await supabase
    .from("live_show_items")
    .update({ status: "sold", winning_bid_gbp: item.buy_now_price_gbp, winner_id: auth.userId })
    .eq("id", itemId)
    .eq("status", "active")
    .select()
    .single();
  if (claimError || !claimed) {
    return NextResponse.json({ error: "Someone else just bought this item." }, { status: 409 });
  }

  const result = await createOrderForListing(supabase, {
    listingId: item.listing_id,
    buyerId: auth.userId,
    priceOverrideGBP: item.buy_now_price_gbp,
  });
  if (!result.ok) {
    // Order creation failed after the item was already claimed — surface
    // it clearly rather than leaving a "sold" item with no real order.
    // Not rolled back automatically: a real occurrence of this needs a
    // human (Steven/support) to sort out the specific listing, same trust
    // level as every other unchecked-edge-case note in this codebase.
    return NextResponse.json(
      { error: `Item marked sold but the order failed to create: ${result.error}. Contact support.` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, order: result.order, clientSecret: result.clientSecret }, { status: 201 });
}
