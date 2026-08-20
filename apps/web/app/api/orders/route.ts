import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { getMarketplaceCommissionRate } from "@flipsta/shared";
import { createEscrowPaymentIntent } from "@/lib/stripe";

/**
 * POST /api/orders — checkout (Section 6): creates the order, computes the
 * seller's tiered commission (Section 8.1), and opens a Stripe Connect
 * PaymentIntent with manual capture so funds sit in escrow until delivery
 * is confirmed (see apps/worker/src/jobs/releaseEscrow.ts).
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { listingId, courier, extendedHoldRequested } = await req.json();
  if (!listingId) return NextResponse.json({ error: "listingId is required." }, { status: 400 });

  const supabase = await createSupabaseServerClient();

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id, price_gbp, seller_id, sold_at, profiles!listings_seller_id_fkey(subscription_tier, stripe_connect_account_id)")
    .eq("id", listingId)
    .single();
  if (listingError || !listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  if (listing.sold_at) return NextResponse.json({ error: "This listing has already sold." }, { status: 409 });

  const sellerProfile = Array.isArray(listing.profiles) ? listing.profiles[0] : listing.profiles;
  const sellerTier = sellerProfile?.subscription_tier ?? "standard";
  const commissionRate = getMarketplaceCommissionRate(sellerTier);
  const commissionGBP = Math.round(listing.price_gbp * commissionRate * 100) / 100;

  const shippingGBP = courier === "dpd" ? 4.99 : 2.99;

  const paymentIntent = await createEscrowPaymentIntent({
    amountGBP: listing.price_gbp + shippingGBP,
    connectedAccountId: sellerProfile?.stripe_connect_account_id ?? "acct_not_yet_onboarded",
    metadata: { listingId, buyerId: auth.userId },
  });

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      buyer_id: auth.userId,
      listing_id: listingId,
      price_gbp: listing.price_gbp,
      commission_gbp: commissionGBP,
      courier: courier ?? "dpd",
      shipping_gbp: shippingGBP,
      extended_hold_requested: Boolean(extendedHoldRequested),
      stripe_payment_intent_id: paymentIntent.id,
      status: "pending_payment",
    })
    .select()
    .single();
  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });

  await supabase.from("listings").update({ sold_at: new Date().toISOString() }).eq("id", listingId);

  return NextResponse.json({ order, clientSecret: (paymentIntent as any).client_secret }, { status: 201 });
}

/**
 * GET /api/orders — Section 12.1's "self-serving" ask made real: a user
 * can see their own orders both as a buyer and as a seller without any
 * admin involvement, which is what powers /portfolio.
 */
export async function GET() {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();

  const { data: asBuyer, error: buyerError } = await supabase
    .from("orders")
    .select("*, listings(product_id, products(title))")
    .eq("buyer_id", auth.userId)
    .order("created_at", { ascending: false });
  if (buyerError) return NextResponse.json({ error: buyerError.message }, { status: 500 });

  // No seller_id column on orders directly — sold via the listing, so this
  // goes listing -> seller rather than a direct foreign key.
  const { data: myListingIds } = await supabase.from("listings").select("id").eq("seller_id", auth.userId);
  const ids = (myListingIds ?? []).map((l) => l.id);

  let asSeller: unknown[] = [];
  if (ids.length > 0) {
    const { data, error: sellerError } = await supabase
      .from("orders")
      .select("*, listings(product_id, products(title))")
      .in("listing_id", ids)
      .order("created_at", { ascending: false });
    if (sellerError) return NextResponse.json({ error: sellerError.message }, { status: 500 });
    asSeller = data ?? [];
  }

  return NextResponse.json({ asBuyer, asSeller });
}
