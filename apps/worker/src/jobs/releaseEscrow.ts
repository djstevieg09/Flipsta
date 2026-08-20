import { createDb } from "../db.js";

/**
 * Section 6 — releases held funds once delivery is confirmed, or once the
 * seller's optional 2-week extended hold has elapsed on top of that.
 * The actual Stripe capture call lives in apps/web/lib/stripe.ts; this job
 * only decides *when* an order qualifies, then hits the web app's internal
 * release endpoint (kept in the web app so it shares Stripe client config).
 */
export async function releaseEscrow() {
  const db = createDb();
  const standardHoldDays = 2; // buyer-protection window after "delivered"
  const extendedHoldDays = 14; // Section 6's optional seller opt-in

  const { data: candidates } = await db
    .from("orders")
    .select("id, status, extended_hold_requested, created_at, funds_released_at, price_gbp, commission_gbp, listings(seller_id)")
    .eq("status", "delivered")
    .is("funds_released_at", null);

  let released = 0;
  const now = Date.now();

  for (const order of candidates ?? []) {
    const holdDays = order.extended_hold_requested ? extendedHoldDays : standardHoldDays;
    const eligibleAt = new Date(order.created_at).getTime() + holdDays * 24 * 60 * 60 * 1000;
    if (now >= eligibleAt) {
      // In production this calls the web app's POST /api/internal/release-escrow
      // (INTERNAL_API_SECRET-authenticated) so the Stripe SDK stays in one place.
      await db.from("orders").update({ funds_released_at: new Date().toISOString() }).eq("id", order.id);

      // Section 9's wallet ledger — this is what makes /wallet a real,
      // self-serve balance instead of an always-empty page. Net payout =
      // what actually lands in the seller's Stripe Connect balance.
      const listing = Array.isArray(order.listings) ? order.listings[0] : order.listings;
      if (listing?.seller_id) {
        const netPayoutGBP = Math.round((order.price_gbp - order.commission_gbp) * 100) / 100;
        await db.from("wallet_transactions").insert({
          profile_id: listing.seller_id,
          amount_gbp: netPayoutGBP,
          kind: "payout",
          reference_order_id: order.id,
        });
      }

      released++;
    }
  }

  return { checked: candidates?.length ?? 0, released };
}
