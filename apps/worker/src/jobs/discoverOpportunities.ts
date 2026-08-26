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
    //
    // 26 Aug 2026, Steven: a real candidate slipped through with a laptop
    // that, once he checked by hand, had NO real margin at all (eBay was
    // selling it cheaper than the "clearance" source price) — the AI's one
    // resale-evidence listing was misleading. buildPrompt()'s "ON RESALE
    // EVIDENCE" instructions now tell the model to actively check for a
    // cheaper price elsewhere before ever reporting a candidate, but as a
    // second, independent line of defence this bar is also raised from 10%
    // to 20% — real headroom for eBay/marketplace fees (~10-13%), shipping,
    // and plain estimation error, so a small mistake in the AI's resale
    // estimate doesn't turn into a loss. Trade-off: fewer candidates will
    // clear the bar. Revisit this number with Steven if that's a problem.
    if (marginPct < 0.2) return false;

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

    // 26 Aug 2026 real-run bug: this insert's result was never checked, so a
    // failed insert (e.g. the DB missing a column this row tries to write —
    // exactly what happened today: estimated_resale_price_gbp didn't exist
    // in production yet) was silently swallowed and this function still
    // returned true, incrementing `created` and making the run's log line
    // say "opportunitiesCreated: 2" when zero rows had actually been
    // written. Steven spent a long back-and-forth chasing a display bug
    // that didn't exist — the "opportunities" were never really created.
    // Now the insert's error is checked and logged loudly, and a failed
    // insert correctly counts as not-created so the caller keeps trying
    // instead of stopping early on a phantom success.
    const { error: insertError } = await db.from("opportunities").insert({
      category_id: category.id,
      product_name: c.productName,
      image_url: c.imageUrl,
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
    if (insertError) {
      console.error(
        `[discoverOpportunities] INSERT FAILED for ${c.sourceRetailer} (${c.sourceUrl}): ${insertError.message}`,
      );
      return false;
    }
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
  // means anything the callback already handled is skipped here.
  //
  // 26 Aug 2026 real-run bug: this used to run unconditionally, even when
  // the callback path had already hit the target and told the adapter to
  // stop. processBatch's own for-loop breaks the INSTANT it hits the
  // target, so a batch with 2+ candidates where the first one alone
  // satisfies the target leaves the second one never added to `processed`
  // — and this catch-all would then pick it up and create it anyway.
  // Real trigger: TARGET_OPPORTUNITIES_PER_RUN=1, a Zavvi batch reported 2
  // real candidates, and both got created instead of stopping at 1. Now
  // only runs the catch-all when the target genuinely hasn't been met yet
  // — which is also exactly the case mockAdapter needs it for, since it
  // never calls onBatch at all and `created` stays 0.
  if (created < targetOpportunities) {
    await processBatch(candidates);
  }

  if (run) {
    await db
      .from("discovery_runs")
      .update({ candidates_found: candidates.length, opportunities_created: created, finished_at: new Date().toISOString() })
      .eq("id", run.id);
  }

  return { candidatesFound: candidates.length, opportunitiesCreated: created };
}
