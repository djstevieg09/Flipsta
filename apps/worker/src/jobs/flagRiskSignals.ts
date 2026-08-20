import { CONCENTRATION_CAPS } from "@flipsta/shared";
import { createDb } from "../db.js";

/**
 * Section 12.1 — Risk & Fraud Monitoring. Writes into risk_flags for a
 * human to review in the admin dashboard (GET /api/admin/risk-flags);
 * this job never suspends or actions anything itself, by design (Section
 * 12.1 is explicit that alerts surface for a human, not auto-actioned).
 *
 * Two signals to start with, both already flagged conceptually elsewhere
 * in the codebase — this is what actually turns them into something an
 * admin sees:
 *   - concentration risk (Section 8.4): a seller's outstanding exposure
 *     approaching the per-opportunity guaranteed-value cap.
 *   - buyback abuse pattern (Section 11.6): repeated claims from the same
 *     seller in a short window.
 */
export async function flagRiskSignals() {
  const db = createDb();
  let created = 0;

  // --- Concentration risk ---
  const { data: wonOpportunities } = await db
    .from("opportunities")
    .select("id, won_by, per_customer_cap, source_price_gbp")
    .eq("status", "won")
    .not("won_by", "is", null);

  for (const opp of wonOpportunities ?? []) {
    const exposureGBP = (opp.per_customer_cap ?? 0) * (opp.source_price_gbp ?? 0);
    const nearCap = exposureGBP >= CONCENTRATION_CAPS.perOpportunityAggregateGuaranteedValueGBP * 0.8;
    if (!nearCap) continue;

    const { data: existing } = await db
      .from("risk_flags")
      .select("id")
      .eq("seller_id", opp.won_by)
      .eq("type", "concentration_risk")
      .eq("status", "open")
      .limit(1);
    if (existing && existing.length > 0) continue; // don't spam duplicate open flags

    await db.from("risk_flags").insert({
      type: "concentration_risk",
      severity: "high",
      seller_id: opp.won_by,
      detail: `Exposure on opportunity ${opp.id} is approaching the per-opportunity guaranteed-value cap (Section 8.4).`,
    });
    created++;
  }

  // --- Buyback abuse pattern: 3+ claims filed by the same seller in 60 days ---
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentClaims } = await db
    .from("buyback_claims")
    .select("id, filed_at, buyback_policies(order_id, orders(buyer_id))")
    .gte("filed_at", sixtyDaysAgo);

  const claimsBySeller = new Map<string, number>();
  for (const claim of recentClaims ?? []) {
    const policy = Array.isArray(claim.buyback_policies) ? claim.buyback_policies[0] : claim.buyback_policies;
    const order = policy ? (Array.isArray(policy.orders) ? policy.orders[0] : policy.orders) : null;
    const sellerId = order?.buyer_id;
    if (!sellerId) continue;
    claimsBySeller.set(sellerId, (claimsBySeller.get(sellerId) ?? 0) + 1);
  }

  for (const [sellerId, count] of claimsBySeller.entries()) {
    if (count < 3) continue;
    const { data: existing } = await db
      .from("risk_flags")
      .select("id")
      .eq("seller_id", sellerId)
      .eq("type", "buyback_abuse_pattern")
      .eq("status", "open")
      .limit(1);
    if (existing && existing.length > 0) continue;

    await db.from("risk_flags").insert({
      type: "buyback_abuse_pattern",
      severity: "high",
      seller_id: sellerId,
      detail: `${count} buyback claims filed in the last 60 days — above the platform's normal rate (Section 11.6).`,
    });
    created++;
  }

  return { concentrationChecked: wonOpportunities?.length ?? 0, sellersWithClaims: claimsBySeller.size, flagsCreated: created };
}
