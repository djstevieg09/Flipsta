import {
  actionClockSeconds,
  calculateInstantWinPrice,
  calculateStartingBid,
  classifyUrgencyTier,
} from "@flipsta/shared";
import { createDb } from "../db.js";
import { SourceAdapter } from "../adapters/sourceAdapter.js";
import { scoreOpportunity } from "../aiScoring.js";

/** Section 2 steps 1-3: Discovery -> Verification -> Packaging as an opportunity. */
export async function discoverOpportunities(adapter: SourceAdapter) {
  const db = createDb();
  const { data: run } = await db
    .from("discovery_runs")
    .insert({ source_adapter: adapter.name })
    .select()
    .single();

  const candidates = await adapter.findCandidates();
  let created = 0;

  for (const c of candidates) {
    const marginGBP = c.estimatedResalePriceGBP - c.sourcePriceGBP;
    const marginPct = marginGBP / c.sourcePriceGBP;

    // Verification bar (Section 2 step 2) — discard weak candidates before
    // they ever reach a user, same as the doc specifies.
    if (marginPct < 0.1) continue;

    const { data: category } = await db.from("categories").select("id, name").eq("slug", c.categorySlug).single();
    if (!category) continue;

    const { confidenceScore: confidence, reasoning } = await scoreOpportunity({
      categoryName: category.name,
      sourceTier: c.sourceTier,
      sourceRetailer: c.sourceRetailer,
      sourcePriceGBP: c.sourcePriceGBP,
      estimatedResalePriceGBP: c.estimatedResalePriceGBP,
      marginPct,
      priceVolatility: c.priceVolatility,
      estimatedStockUnits: c.estimatedStockUnits,
    });
    if (confidence < 0.5) continue;

    const urgency = classifyUrgencyTier({
      limitedStock: c.perCustomerCap !== null,
      estimatedMarketDepth: c.estimatedStockUnits,
      priceVolatility: c.priceVolatility,
    });

    const clockSeconds = actionClockSeconds(urgency);
    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + clockSeconds * 1000).toISOString();

    await db.from("opportunities").insert({
      category_id: category.id,
      source_tier: c.sourceTier,
      source_retailer: c.sourceRetailer,
      source_url: c.sourceUrl,
      source_price_gbp: c.sourcePriceGBP,
      margin_band_low: Math.max(0, marginPct - 0.03),
      margin_band_high: marginPct + 0.03,
      expected_margin_gbp: Math.round(marginGBP * 100) / 100,
      confidence_score: confidence,
      urgency_tier: urgency,
      action_clock_seconds: clockSeconds,
      estimated_stock_units: c.estimatedStockUnits,
      per_customer_cap: c.perCustomerCap,
      starting_bid_gbp: calculateStartingBid(marginGBP, confidence),
      instant_win_price_gbp: calculateInstantWinPrice(marginGBP, confidence),
      status: "live",
      live_at: nowIso,
      action_clock_expires_at: expiresIso,
      ai_reasoning: reasoning,
    });
    created++;
  }

  if (run) {
    await db
      .from("discovery_runs")
      .update({ candidates_found: candidates.length, opportunities_created: created, finished_at: new Date().toISOString() })
      .eq("id", run.id);
  }

  return { candidatesFound: candidates.length, opportunitiesCreated: created };
}
