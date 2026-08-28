import type { SupabaseClient } from "@supabase/supabase-js";
import { getMarketplaceCommissionRate } from "@flipsta/shared";
import { createEscrowPaymentIntent } from "./stripe";
import { awardLoyaltyCredit } from "./loyalty";

/**
 * 27 Aug 2026 — extracted from api/orders/route.ts's POST handler so a
 * live-show auction win (see worker/jobs/closeExpiredLiveItems.ts and
 * api/live-shows/[id]/items/[itemId]/bid/route.ts's buy-now path) can
 * create an order the EXACT same way a normal /opportunities-derived
 * marketplace purchase does — same commission calc, same Stripe escrow
 * PaymentIntent, same listing.sold_at update, same loyalty credit award —
 * rather than a second, parallel, less-tested checkout path. The only
 * difference is priceOverrideGBP: a live-show item settles at its winning
 * bid (or buy-now price), not listing.price_gbp.
 *
 * api/orders/route.ts's own POST now just calls this with no override.
 */
export async function createOrderForListing(
  supabase: SupabaseClient,
  params: {
    listingId: string;
    buyerId: string;
    courier?: "dpd" | "royal_mail" | string;
    extendedHoldRequested?: boolean;
    /** Live-show settlement price — omit for a normal purchase, which uses listing.price_gbp. */
    priceOverrideGBP?: number;
  },
): Promise<
  | { ok: true; order: any; clientSecret: string | null }
  | { ok: false; error: string; status: number }
> {
  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id, price_gbp, seller_id, sold_at, profiles!listings_seller_id_fkey(subscription_tier, stripe_connect_account_id)")
    .eq("id", params.listingId)
    .single();
  if (listingError || !listing) return { ok: false, error: "Listing not found.", status: 404 };
  if (listing.sold_at) return { ok: false, error: "This listing has already sold.", status: 409 };

  const sellerProfile = Array.isArray(listing.profiles) ? listing.profiles[0] : listing.profiles;
  const sellerTier = sellerProfile?.subscription_tier ?? "standard";
  const commissionRate = getMarketplaceCommissionRate(sellerTier);
  const priceGBP = params.priceOverrideGBP ?? listing.price_gbp;
  const commissionGBP = Math.round(priceGBP * commissionRate * 100) / 100;

  const shippingGBP = params.courier === "dpd" ? 4.99 : 2.99;

  const paymentIntent = await createEscrowPaymentIntent({
    amountGBP: priceGBP + shippingGBP,
    connectedAccountId: sellerProfile?.stripe_connect_account_id ?? "acct_not_yet_onboarded",
    metadata: { listingId: params.listingId, buyerId: params.buyerId },
  });

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      buyer_id: params.buyerId,
      listing_id: params.listingId,
      price_gbp: priceGBP,
      commission_gbp: commissionGBP,
      courier: params.courier ?? "dpd",
      shipping_gbp: shippingGBP,
      extended_hold_requested: Boolean(params.extendedHoldRequested),
      stripe_payment_intent_id: paymentIntent.id,
      status: "pending_payment",
    })
    .select()
    .single();
  if (orderError) return { ok: false, error: orderError.message, status: 500 };

  await supabase.from("listings").update({ sold_at: new Date().toISOString() }).eq("id", params.listingId);

  // 27 Aug 2026: the "investment" stage of the Hook Model — see lib/loyalty.ts.
  await awardLoyaltyCredit(supabase, {
    profileId: params.buyerId,
    spendGBP: priceGBP + shippingGBP,
    referenceOrderId: order.id,
  });

  return { ok: true, order, clientSecret: (paymentIntent as any).client_secret ?? null };
}
