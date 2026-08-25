import {
  actionClockSeconds,
  calculateInstantWinPrice,
  calculateStartingBid,
  classifyUrgencyTier,
} from "@flipsta/shared";
import { createDb } from "../db.js";
import { CandidateDeal, SourceAdapter } from "../adapters/sourceAdapter.js";
import { scoreOpportunity } from "../aiScoring.js";

// 26 Aug 2026, Steven, filling the dashboard for the first time: "i need it
// to keep goint to start with until its got 1 oppotunity. then stop once
// its founfd one and its displayed it on dashboard." This is the real bar
// an adapter's onBatch callback (see sourceAdapter.ts) stops against — an
// actual opportunity that's cleared verification and been inserted, ready
// to show on /opportunities, not just something the adapter reported.
// Change this one number whenever the target changes; nothing else needs
// touching.
const TARGET_OPPORTUNITIES_PER_RUN = 1;

/** Section 2 steps 1-3: Discovery -> Verification -> Packaging as an opportunity. */
export async function discoverOpportunities(adapter: SourceAdapter, targetOpportunities = TARGET_OPPORTUNITIES_PER_RUN) {
  const db = createDb();
  const { data: run } = await db
    .from("discovery_runs")
    .insert({ source_adapter: adapter.name })
    .select()
    .single();

  let created = 0;
  // Candidates already run through tryCreateOpportunity, keyed by object
  // reference — lets the same candidate be safely processed either via the
  // adapter's onBatch callback (as it's found) or the final catch-all pass
  // below (for adapters like mockAdapter that ignore onBatch and just
  // return everything at once) without double-processing it either way.
  const processed = new Set<CandidateDeal>();

  async function tryCreateOpportunity(c: CandidateDeal): Promise<boolean> {
    const marginGBP = c.estimatedResalePriceGBP - c.sourcePriceGBP;
    const marginPct = marginGBP / c.sourcePriceGBP;

    // Verification bar (Section 2 step 2) — discard weak candidates before
    // they ever reach a user, same as the doc specifies.
    if (marginPct < 0.1) return false;

    const { data: category } = await db.from("categories").select("id, name").eq("slug", c.categorySlug).single();
    if (!category) return false;

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
    if (confidence < 0.5) return false;

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
      estimated_resale_price_gbp: c.estimatedResalePriceGBP,
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
    return true;
  }

  async function processBatch(batch: CandidateDeal[]): Promise<boolean> {
    for (const c of batch) {
      if (processed.has(c)) continue;
      processed.add(c);
      if (await tryCreateOpportunity(c)) created++;
      if (created >= targetOpportunities) break;
    }
    return created >= targetOpportunities;
  }

  const candidates = await adapter.findCandidates(processBatch);
  // Catch-all: process anything the adapter returned but never actually
  // ran through the callback (adapters like mockAdapter ignore onBatch
  // entirely and just return everything at once) — processed's dedupe
  // means anything the callback already handled is skipped here, so this
  // is always safe to run regardless of which style the adapter used.
  await processBatch(candidates);

  if (run) {
    await db
      .from("discovery_runs")
      .update({ candidates_found: candidates.length, opportunities_created: created, finished_at: new Date().toISOString() })
      .eq("id", run.id);
  }

  return { candidatesFound: candidates.length, opportunitiesCreated: created };
}
