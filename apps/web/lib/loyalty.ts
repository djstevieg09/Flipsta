import type { SupabaseClient } from "@supabase/supabase-js";
import { LOYALTY_EARN_RATE_PCT } from "@flipsta/shared";

/**
 * 27 Aug 2026 — the "investment" stage of the Hook Model (see
 * claude/deployment-checklist.md's #-5 research write-up): a small % of
 * every real purchase comes back as spendable wallet credit. Reuses the
 * EXISTING wallet_transactions ledger (referral credit and seller payouts
 * already use it) rather than a new points system — Steven's confirmed
 * answer — via migration 0021's new 'loyalty_credit' kind.
 *
 * Awarded at the moment of purchase, same as referral credit — not gated
 * behind delivery/escrow release. A deliberate first-pass choice, same
 * status as REFERRAL_REWARD_GBP: worth revisiting if refund clawback ever
 * matters at real volume.
 *
 * Never throws — a failure here shouldn't undo or block a real purchase
 * that already succeeded, same reasoning as autoListWonOpportunity's own
 * try/catch at its call sites.
 */
export async function awardLoyaltyCredit(
  supabase: SupabaseClient,
  params: {
    profileId: string;
    spendGBP: number;
    referenceOrderId?: string;
    referenceShopItemId?: string;
    referenceOpportunityId?: string;
  },
): Promise<void> {
  const amountGBP = Math.round(params.spendGBP * (LOYALTY_EARN_RATE_PCT / 100) * 100) / 100;
  if (!(amountGBP > 0)) return;
  try {
    const { error } = await supabase.from("wallet_transactions").insert({
      profile_id: params.profileId,
      amount_gbp: amountGBP,
      kind: "loyalty_credit",
      reference_order_id: params.referenceOrderId ?? null,
      reference_shop_item_id: params.referenceShopItemId ?? null,
      reference_opportunity_id: params.referenceOpportunityId ?? null,
    });
    if (error) console.error("Loyalty credit award failed:", error.message);
  } catch (e) {
    console.error("Loyalty credit award failed:", e instanceof Error ? e.message : e);
  }
}
