import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { createEscrowPaymentIntent } from "@/lib/stripe";
import { evaluateOffer } from "@flipsta/shared";

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
  "id, category_id, product_name, description, image_url, rrp_gbp, our_price_gbp, min_offer_accept_gbp, estimated_stock_units, status, created_at, categories(name)";

/**
 * GET /api/shop-items — Flipsta's own directly-sold stock (26 Aug 2026,
 * Steven: "the RRP is to be displayed along with our price, description and
 * photos"). These are AI-sourced candidates with a genuine retailer
 * discount but no independent resale evidence — see
 * packages/shared/src/shopPricing.ts and migration 0013.
 *
 * GET /api/shop-items?mine=true — a different mode: the caller's own
 * purchases, at whatever status they're at, powering /portfolio's "My
 * purchases" — including a "Confirm delivery" action once status is
 * 'shipped'. source_retailer/source_url stay hidden even here; the buyer
 * never needs to know where Flipsta actually sourced it (only the
 * fulfiller does, once they claim the job — see /api/fulfillment).
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
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

/**
 * POST /api/shop-items — Buy Now or Make an Offer. Steven: "should have a
 * buy now button and also a make an offer. The website is to work out the
 * offer and after taking into consideration all the fees for buying and
 * shipping etc to auto accept the offer." evaluateOffer (shopPricing.ts)
 * already has those fees baked into min_offer_accept_gbp at listing time,
 * so this route is just the accept/reject + checkout wiring.
 *
 * Either path holds payment via Stripe manual capture — Steven: "the money
 * does not get released until the item has been delivered" — see
 * /api/shop-items/[id]/confirm-delivery for the actual release, which also
 * pays the fulfiller.
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { itemId, action, offerGBP, shippingAddress } = await req.json();
  if (!itemId || (action !== "buy" && action !== "offer")) {
    return NextResponse.json({ error: "itemId and a valid action ('buy' or 'offer') are required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: item, error: itemError } = await supabase
    .from("shop_items")
    .select("id, status, our_price_gbp, min_offer_accept_gbp, fulfillment_reward_gbp, fulfiller_reimbursement_gbp")
    .eq("id", itemId)
    .single();
  if (itemError || !item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  if (item.status !== "available") {
    return NextResponse.json({ error: "This item is no longer available." }, { status: 409 });
  }

  let soldPriceGBP: number;
  if (action === "buy") {
    soldPriceGBP = item.our_price_gbp;
  } else {
    const offer = Number(offerGBP);
    if (!(offer > 0)) return NextResponse.json({ error: "offerGBP must be a positive amount." }, { status: 400 });
    const decision = evaluateOffer(
      {
        ourPriceGBP: item.our_price_gbp,
        minOfferAcceptGBP: item.min_offer_accept_gbp,
        fulfillmentRewardGBP: item.fulfillment_reward_gbp,
        fulfillerReimbursementGBP: item.fulfiller_reimbursement_gbp,
      },
      offer,
    );
    if (!decision.accepted) {
      return NextResponse.json({ error: decision.reason ?? "We can't accept that offer." }, { status: 409 });
    }
    soldPriceGBP = offer;
  }

  // No connectedAccountId — Flipsta itself is the seller here, not a peer
  // (see lib/stripe.ts's updated createEscrowPaymentIntent comment).
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
    return NextResponse.json({ error: "This item was just bought by someone else." }, { status: 409 });
  }

  return NextResponse.json(
    { ok: true, pricePaidGBP: soldPriceGBP, clientSecret: (paymentIntent as { client_secret?: string }).client_secret },
    { status: 201 },
  );
}
