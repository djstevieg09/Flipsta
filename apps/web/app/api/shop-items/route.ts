import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { createEscrowPaymentIntent } from "@/lib/stripe";

// Force-dynamic: every route here reads live application data (bids, wallet
// balances, opportunities, order status) straight from Supabase. Without this,
// Next.js's App Router can cache a GET route's first response (including the
// fetch calls a library like supabase-js makes under the hood) and keep
// serving that same stale response indefinitely, even after the database
// changes underneath it — exactly what caused real, freshly-discovered
// opportunities to not show up on /opportunities on 25 Aug 2026.
export const dynamic = "force-dynamic";

// source_retailer/source_url deliberately excluded — same blind-teaser
// reasoning as the opportunities feed (Section 5): showing customers where
// Flipsta actually sourced the item just tells them to go buy it there
// instead. Revealed only to the fulfiller once they've claimed the job
// (see /api/fulfillment) — migration 0013's comments call this out too.
const PUBLIC_SHOP_ITEM_COLUMNS =
  "id, category_id, product_name, description, image_url, rrp_gbp, our_price_gbp, created_at, categories(name)";

/**
 * GET /api/shop-items — AI-sourced deals, fulfilled by an independent
 * Flipsta reseller once bought (26 Aug 2026, Steven: "the RRP is to be
 * displayed along with our price, description and photos"; also Steven,
 * on the "Sold by Flipsta" framing: "that would assume we are taking
 * ownership of the sale. We are just a broker" — Flipsta sources and takes
 * payment, an independent reseller actually buys and ships).
 *
 * Steven, 26 Aug 2026: "if there is more than one item available to buy
 * the items should not remove themselves from the store." Each unit of
 * stock is its own row (see discoverOpportunities.ts) so that buying one
 * only removes that row, not the listing — grouped here by product +
 * price into one card with a unitsAvailable count, so the store doesn't
 * show duplicate tiles for the same product.
 *
 * GET /api/shop-items?mine=true — a different mode: the caller's own
 * purchases, at whatever status they're at, powering /portfolio's "My
 * purchases" — including a "Confirm delivery" action once status is
 * 'shipped'. source_retailer/source_url stay hidden even here; the buyer
 * never needs to know where it was sourced (only the fulfiller does, once
 * they claim the job — see /api/fulfillment).
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();

  if (req.nextUrl.searchParams.get("mine") === "true") {
    const auth = await getCurrentProfile();
    if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const { data, error } = await supabase
      .from("shop_items")
      .select(
        "id, product_name, description, image_url, rrp_gbp, sold_price_gbp, status, paid_at, shipped_at, delivered_at, categories(name)",
      )
      .eq("buyer_id", auth.userId)
      .order("paid_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data });
  }

  const { data, error } = await supabase
    .from("shop_items")
    .select(PUBLIC_SHOP_ITEM_COLUMNS)
    .eq("status", "available")
    .order("created_at", { ascending: true }); // oldest-first within a group keeps the representative row stable across refreshes
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    id: string;
    category_id: string;
    product_name: string;
    description: string | null;
    image_url: string | null;
    rrp_gbp: number;
    our_price_gbp: number;
    created_at: string;
    categories: { name: string } | { name: string }[] | null;
  };

  const groups = new Map<string, Row & { unitsAvailable: number }>();
  for (const row of (data ?? []) as Row[]) {
    const key = `${row.product_name}|${row.our_price_gbp}`;
    const existing = groups.get(key);
    if (existing) {
      existing.unitsAvailable++;
    } else {
      groups.set(key, { ...row, unitsAvailable: 1 });
    }
  }

  return NextResponse.json({ items: Array.from(groups.values()) });
}

/**
 * POST /api/shop-items — Buy Now. (Make an Offer was removed 26 Aug 2026,
 * Steven: "Also take away the offer button" — the pricing/accept-offer
 * logic still lives in packages/shared/src/shopPricing.ts if this comes
 * back later, this route just no longer calls it.)
 *
 * Payment is held via Stripe manual capture — Steven: "the money does not
 * get released until the item has been delivered" — see
 * /api/shop-items/[id]/confirm-delivery for the actual release, which also
 * pays the fulfiller.
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { itemId, shippingAddress } = await req.json();
  if (!itemId) return NextResponse.json({ error: "itemId is required." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: item, error: itemError } = await supabase
    .from("shop_items")
    .select("id, status, our_price_gbp")
    .eq("id", itemId)
    .single();
  if (itemError || !item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  if (item.status !== "available") {
    // Most likely a sibling unit of the same product got bought a moment
    // ago and this exact row was the one picked — the client should just
    // reload the shop list and try again, same as an Instant Win race.
    return NextResponse.json({ error: "This item was just bought by someone else — refresh and try again." }, { status: 409 });
  }

  const soldPriceGBP = item.our_price_gbp;

  // No connectedAccountId — Flipsta collects payment here but isn't the
  // one shipping the item, so there's no Connect account to route the
  // eventual capture to (see lib/stripe.ts's createEscrowPaymentIntent
  // comment). The fulfiller who actually buys and ships it is paid
  // separately via a wallet_transactions credit on delivery confirmation.
  const paymentIntent = await createEscrowPaymentIntent({
    amountGBP: soldPriceGBP,
    metadata: { shopItemId: itemId, buyerId: auth.userId },
  });

  // Same optimistic-concurrency + "a row actually came back" check as
  // Instant Win (migration 0011's real production bug) — RLS's "buy an
  // available item" policy (migration 0013) only matches status='available',
  // so a second buyer racing the first one correctly gets zero rows back
  // here instead of a false "you bought it."
  const { data: updated, error: updateError } = await supabase
    .from("shop_items")
    .update({
      status: "sold_awaiting_fulfillment",
      buyer_id: auth.userId,
      sold_price_gbp: soldPriceGBP,
      stripe_payment_intent_id: paymentIntent.id,
      paid_at: new Date().toISOString(),
      shipping_address: shippingAddress ?? null,
    })
    .eq("id", itemId)
    .eq("status", "available")
    .select("id")
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!updated) {
    return NextResponse.json({ error: "This item was just bought by someone else — refresh and try again." }, { status: 409 });
  }

  return NextResponse.json(
    { ok: true, pricePaidGBP: soldPriceGBP, clientSecret: (paymentIntent as { client_secret?: string }).client_secret },
    { status: 201 },
  );
}
