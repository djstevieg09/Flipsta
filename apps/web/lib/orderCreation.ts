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
    /**
     * 28 Aug 2026, Steven: "Also set P&P in the items they are selling."
     * A live-show item's own shipping_gbp (migration 0029), when the host
     * set one — omit to keep the existing flat courier-based default.
     */
    shippingOverrideGBP?: number;
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

  const shippingGBP = params.shippingOverrideGBP ?? (params.courier === "dpd" ? 4.99 : 2.99);

  /**
   * 19 Sept 2026 — real bug found while wiring up commission collection
   * (Steven: "also setup the commision as we will get this for
   * marketplace purchases etc"): this used to pass the literal string
   * "acct_not_yet_onboarded" as the Stripe Connect destination whenever a
   * seller had no real stripe_connect_account_id — which is every seller
   * today, since no route anywhere in this app actually creates one (grep
   * confirms it: the column is written nowhere, only ever read here).
   * Stripe would reject that as an unknown connected account, so this
   * PaymentIntent call has likely been throwing on every real marketplace
   * purchase since Stripe was actually configured, with no try/catch
   * above it in api/orders/route.ts to turn it into a clean error.
   *
   * Fixed the same way shop_items purchases (which also have no connected
   * seller — Flipsta itself is the seller there) already handle it:
   * connectedAccountId is only passed when it's a REAL account, and the
   * escrowed payment simply stays on Flipsta's own Stripe balance
   * otherwise — same as any successful capture already does before a
   * transfer. Flagged to Steven separately: seller payouts for real
   * marketplace sales still need actual Connect onboarding (an "add your
   * bank details" flow that creates the account and gets it verified) —
   * this fix stops the crash and makes commission collection correct for
   * once that exists, it doesn't build the onboarding flow itself.
   */
  const hasRealConnectedAccount = Boolean(sellerProfile?.stripe_connect_account_id);
  const paymentIntent = await createEscrowPaymentIntent({
    amountGBP: priceGBP + shippingGBP,
    connectedAccountId: hasRealConnectedAccount ? sellerProfile.stripe_connect_account_id : undefined,
    applicationFeeGBP: hasRealConnectedAccount ? commissionGBP : undefined,
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
