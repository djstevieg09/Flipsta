import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

/** GET /api/admin/buyback-claims — every claim, newest first, for staff to review and resolve. */
export async function GET() {
  try {
    await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supabase = createSupabaseServiceClient();

  const { data: claims, error } = await supabase
    .from("buyback_claims")
    .select(
      "id, status, listed_at, listed_at_or_below_estimate, offered_at_cost_after_window, filed_at, resolved_at, buyback_policies(id, profile_id, item_price_gbp, payout_pct, premium_gbp, opportunities(product_name), profiles(display_name))",
    )
    .order("filed_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (claims ?? []).map((c: any) => ({
    id: c.id,
    status: c.status,
    listedAt: c.listed_at,
    listedAtOrBelowEstimate: c.listed_at_or_below_estimate,
    offeredAtCostAfterWindow: c.offered_at_cost_after_window,
    filedAt: c.filed_at,
    resolvedAt: c.resolved_at,
    policyId: c.buyback_policies?.id,
    displayName: c.buyback_policies?.profiles?.display_name ?? "Unknown",
    productName: c.buyback_policies?.opportunities?.product_name ?? "Opportunity",
    itemPriceGBP: c.buyback_policies?.item_price_gbp,
    payoutPct: c.buyback_policies?.payout_pct,
    potentialPayoutGBP:
      c.buyback_policies?.item_price_gbp && c.buyback_policies?.payout_pct
        ? Math.round(c.buyback_policies.item_price_gbp * c.buyback_policies.payout_pct * 100) / 100
        : null,
  }));

  return NextResponse.json({ claims: result });
}
