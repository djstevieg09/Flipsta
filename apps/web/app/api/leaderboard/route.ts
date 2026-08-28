import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/leaderboard — Steven, 27 Aug 2026: "When someone signs up as a
 * reseller it would be good to have a leaderboard showing who is the top
 * seller by profit on the site, Top 10 is good enough." Confirmed answer
 * on privacy: "Fully public with exact profit" — no auth required here.
 *
 * REALIZED profit, not the AI's pre-estimate (opportunities.expected_margin_gbp) —
 * computed from actual completed orders: price_gbp − source_price_gbp
 * (the opportunity's known cost basis) − commission_gbp, summed per
 * seller, only counting orders where funds have actually been released
 * (funds_released_at is not null) and the order wasn't refunded.
 *
 * Honest limitation, worth knowing: this can only count profit on a
 * listing that traces back to a Flipsta-sourced opportunity (migration
 * 0017's listings.opportunity_id link — the only place a real cost basis
 * is known). A reseller's own independently-sourced listing (no
 * opportunity_id) has no known cost basis and can't contribute here yet.
 * For resellers who mostly work Flipsta's own opportunities pipeline
 * (the majority use case today) this is a faithful ranking; for a seller
 * who sources everything themselves it will under-count. Worth
 * revisiting if that gap turns out to matter in practice.
 */
export async function GET() {
  const supabase = createSupabaseServiceClient();

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("price_gbp, commission_gbp, status, funds_released_at, listings(seller_id, opportunity_id, profiles!listings_seller_id_fkey(display_name))")
    .not("funds_released_at", "is", null)
    .neq("status", "refunded");
  if (ordersError) return NextResponse.json({ error: ordersError.message }, { status: 500 });

  const eligible = (orders ?? [])
    .map((o: any) => ({ ...o, listing: Array.isArray(o.listings) ? o.listings[0] : o.listings }))
    .filter((o: any) => o.listing?.opportunity_id);

  const opportunityIds = Array.from(new Set(eligible.map((o: any) => o.listing.opportunity_id)));
  const sourcePriceByOpportunityId = new Map<string, number>();
  if (opportunityIds.length > 0) {
    const { data: opportunities, error: oppsError } = await supabase
      .from("opportunities")
      .select("id, source_price_gbp")
      .in("id", opportunityIds);
    if (oppsError) return NextResponse.json({ error: oppsError.message }, { status: 500 });
    for (const o of opportunities ?? []) sourcePriceByOpportunityId.set(o.id, o.source_price_gbp);
  }

  const profitBySeller = new Map<string, { displayName: string; profitGBP: number; itemsSold: number }>();
  for (const order of eligible) {
    const sourcePriceGBP = sourcePriceByOpportunityId.get(order.listing.opportunity_id);
    if (typeof sourcePriceGBP !== "number") continue; // opportunity row missing/deleted — skip rather than guess
    const profitGBP = order.price_gbp - sourcePriceGBP - order.commission_gbp;
    const sellerId = order.listing.seller_id;
    const displayName = order.listing.profiles?.display_name ?? "Unknown seller";
    const entry = profitBySeller.get(sellerId) ?? { displayName, profitGBP: 0, itemsSold: 0 };
    entry.profitGBP += profitGBP;
    entry.itemsSold += 1;
    profitBySeller.set(sellerId, entry);
  }

  const leaderboard = Array.from(profitBySeller.entries())
    .map(([sellerId, v]) => ({
      sellerId,
      displayName: v.displayName,
      profitGBP: Math.round(v.profitGBP * 100) / 100,
      itemsSold: v.itemsSold,
    }))
    .sort((a, b) => b.profitGBP - a.profitGBP)
    .slice(0, 10);

  return NextResponse.json({ leaderboard });
}
