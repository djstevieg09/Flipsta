import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { SOCIAL_SHARE_REWARD_COINS } from "@flipsta/shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/orders/:id/share-reward — 18 Sept 2026, Steven: "when someone
 * make profit from a sale then it shoudl ask them to share it to social
 * media, they get a free coin for sharing to social media or whatever you
 * think is the right amount." "Made profit from a sale" is the moment an
 * order's escrow actually releases (funds_released_at — see
 * apps/worker/src/jobs/releaseEscrow.ts, which is also when the seller's
 * net payout lands in wallet_transactions); /portfolio prompts the seller
 * to share from that point on. One reward per order, enforced by the
 * profit_share_reward_claimed_at flag (migration 0034) rather than a
 * unique constraint, since it's a single nullable timestamp, not a
 * multi-row ledger.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, funds_released_at, profit_share_reward_claimed_at, listings(seller_id)")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const listing = Array.isArray(order.listings) ? order.listings[0] : order.listings;
  if (!listing || listing.seller_id !== auth.userId) {
    return NextResponse.json({ error: "This isn't your sale." }, { status: 403 });
  }
  if (!order.funds_released_at) {
    return NextResponse.json({ error: "This sale hasn't completed yet." }, { status: 409 });
  }
  if (order.profit_share_reward_claimed_at) {
    return NextResponse.json({ error: "You've already claimed the share reward for this sale." }, { status: 409 });
  }

  // Service-role client — credit_flippy_coins' EXECUTE grant is service_role
  // only (migration 0031), same reason every other coin-crediting route
  // (Stripe webhook, admin wallet-admin) uses it instead of the normal
  // user-context client.
  const service = createSupabaseServiceClient();
  const { data: newBalance, error: rpcError } = await service.rpc("credit_flippy_coins", {
    p_profile_id: auth.userId,
    p_amount: SOCIAL_SHARE_REWARD_COINS,
    p_kind: "bonus",
    p_note: `Shared sale (order ${id}) to social media`,
  });
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });

  const { error: updateError } = await supabase
    .from("orders")
    .update({ profit_share_reward_claimed_at: new Date().toISOString() })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, coinsAwarded: SOCIAL_SHARE_REWARD_COINS, newBalance });
}
