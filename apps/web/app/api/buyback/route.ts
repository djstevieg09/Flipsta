import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyback — the signed-in shopper's own buyback policies (one per
 * insured win) plus any claim filed against each, powering /portfolio's
 * protection status and "File a claim" flow. RLS (migration 0024) already
 * scopes both tables to auth.uid() = profile_id, so a plain server client
 * is enough — no service-role client needed here.
 */
export async function GET() {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();

  const { data: policies, error } = await supabase
    .from("buyback_policies")
    .select("id, opportunity_id, premium_gbp, failure_probability, payout_pct, item_price_gbp, purchased_at, opportunities(product_name)")
    .eq("profile_id", auth.userId)
    .order("purchased_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const policyIds = (policies ?? []).map((p) => p.id);
  const { data: claims } = await supabase
    .from("buyback_claims")
    .select("*")
    .in("policy_id", policyIds.length > 0 ? policyIds : ["00000000-0000-0000-0000-000000000000"]);

  const claimsByPolicy = new Map<string, any>();
  for (const c of claims ?? []) claimsByPolicy.set(c.policy_id, c);

  const result = (policies ?? []).map((p: any) => ({
    id: p.id,
    opportunityId: p.opportunity_id,
    productName: p.opportunities?.product_name ?? "Opportunity",
    premiumGBP: p.premium_gbp,
    payoutPct: p.payout_pct,
    itemPriceGBP: p.item_price_gbp,
    potentialPayoutGBP: p.item_price_gbp ? Math.round(p.item_price_gbp * p.payout_pct * 100) / 100 : null,
    purchasedAt: p.purchased_at,
    claim: claimsByPolicy.get(p.id) ?? null,
  }));

  return NextResponse.json({ policies: result });
}
