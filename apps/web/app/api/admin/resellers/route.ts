import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";

// Force-dynamic: same reasoning as every other route here — live application
// data straight from Supabase, never cached.
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/resellers — 26 Aug 2026, Steven: "need to be able to
 * manage resellers from this panel." Distinct from /admin/sellers (every
 * profile, generic tier/status/tickets) — this is specifically about
 * fulfillment activity: who's actually claiming and delivering AI-sourced
 * shop orders (see api/fulfillment for the claim/ship flow these numbers
 * come from), which /admin/sellers has no visibility into at all.
 */
export async function GET() {
  try {
    await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supabase = createSupabaseServiceClient();

  const { data: resellers, error } = await supabase
    .from("profiles")
    .select("id, display_name, subscription_tier, status, created_at")
    .in("subscription_tier", ["pro", "elite"])
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: claims } = await supabase
    .from("shop_items")
    .select("fulfiller_id, status, fulfillment_reward_gbp, fulfiller_reimbursement_gbp")
    .not("fulfiller_id", "is", null);

  const byFulfiller = new Map<string, { claimsTotal: number; delivered: number; active: number; earnedGBP: number }>();
  for (const c of claims ?? []) {
    const key = c.fulfiller_id as string;
    const stats = byFulfiller.get(key) ?? { claimsTotal: 0, delivered: 0, active: 0, earnedGBP: 0 };
    stats.claimsTotal++;
    if (c.status === "delivered") {
      stats.delivered++;
      // Paid out via a wallet_transactions credit at delivery confirmation
      // (see api/shop-items/[id]/confirm-delivery) — reward + reimbursement
      // together is what actually landed in their wallet.
      stats.earnedGBP += Number(c.fulfillment_reward_gbp ?? 0) + Number(c.fulfiller_reimbursement_gbp ?? 0);
    }
    if (c.status === "fulfillment_claimed" || c.status === "shipped") stats.active++;
    byFulfiller.set(key, stats);
  }

  const result = (resellers ?? []).map((r: any) => {
    const stats = byFulfiller.get(r.id) ?? { claimsTotal: 0, delivered: 0, active: 0, earnedGBP: 0 };
    return {
      id: r.id,
      displayName: r.display_name,
      subscriptionTier: r.subscription_tier,
      status: r.status,
      createdAt: r.created_at,
      claimsTotal: stats.claimsTotal,
      delivered: stats.delivered,
      activeClaims: stats.active,
      earnedGBP: Math.round(stats.earnedGBP * 100) / 100,
    };
  });

  return NextResponse.json({ resellers: result });
}
