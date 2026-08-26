import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { releaseEscrowFunds } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * POST /api/shop-items/:id/confirm-delivery — Steven: "number one the money
 * does not get released until the item has been delivered." The buyer
 * confirming is what actually triggers both halves of the payout at once:
 * the buyer's held card is captured (releaseEscrowFunds — the same
 * manual-capture pattern the peer marketplace's releaseEscrow.ts uses) and
 * the fulfiller is credited their reimbursement + reward via a
 * wallet_transactions row (same payout pattern releaseEscrow.ts already
 * uses for sellers, just against reference_shop_item_id instead of
 * reference_order_id — see migration 0013).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();

  // Same optimistic-concurrency + "a row actually came back" check used
  // throughout this feature (Instant Win's migration-0011 bug is the
  // reason this pattern exists at all) — only the buyer, and only once
  // it's actually been marked shipped, can confirm delivery.
  const { data: updated, error: updateError } = await supabase
    .from("shop_items")
    .update({ status: "delivered", delivered_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "shipped")
    .eq("buyer_id", auth.userId)
    .select("id, stripe_payment_intent_id, fulfiller_id, fulfillment_reward_gbp, fulfiller_reimbursement_gbp")
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!updated) {
    return NextResponse.json(
      { error: "This order isn't yours to confirm, or hasn't been marked shipped yet." },
      { status: 409 },
    );
  }

  if (updated.stripe_payment_intent_id) {
    await releaseEscrowFunds(updated.stripe_payment_intent_id);
  }

  if (updated.fulfiller_id) {
    // fulfiller_reimbursement_gbp already covers source price + estimated
    // shipping (locked in at listing time — see shopPricing.ts); the reward
    // is on top of that, same "reimbursement + reward" split Steven asked for.
    const payoutGBP =
      Math.round(((updated.fulfiller_reimbursement_gbp ?? 0) + (updated.fulfillment_reward_gbp ?? 0)) * 100) / 100;
    await supabase.from("wallet_transactions").insert({
      profile_id: updated.fulfiller_id,
      amount_gbp: payoutGBP,
      kind: "payout",
      reference_shop_item_id: updated.id,
    });
  }

  await supabase.from("shop_items").update({ funds_released_at: new Date().toISOString() }).eq("id", id);

  return NextResponse.json({ ok: true });
}
