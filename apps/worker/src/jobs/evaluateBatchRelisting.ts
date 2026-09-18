import { CONCENTRATION_CAPS, DEAL_DEFAULT_BATCH_SIZE, shouldOpenNextBatch } from "@flipsta/shared";
import { createDb } from "../db.js";

/**
 * Section 11.2 — only opens a new batch of slots on a fixed-price deal
 * once the previous batch shows real sell-through, gated by the Section
 * 8.4 hard per-opportunity exposure cap. Steven, 18 Sept 2026, verbatim:
 * "say 10 and then if sales are booming then release to another 10."
 *
 * 18 Sept 2026 — this used to be a stand-in (see git history): it bumped
 * batch_number on a 'won' auction opportunity without actually creating
 * any new sellable capacity, because there was no real per-batch
 * sell-through to check yet. Migration 0034's opportunity_slot_purchases
 * table (one row per person who's bought a slot on a fixed-price deal)
 * finally gives this a real signal to run on, so this is now the genuine
 * implementation Section 11.2 always described: raising
 * estimated_stock_units (the running total of slots ever released) and
 * flipping a 'sold_out' deal back to 'live' once enough of the current
 * batch has actually sold.
 */
export async function evaluateBatchRelisting() {
  const db = createDb();

  const { data: deals } = await db
    .from("opportunities")
    .select("id, estimated_stock_units, batch_number, fixed_price_coins")
    .eq("pricing_mode", "fixed_price")
    .in("status", ["live", "sold_out"]);

  let batchesOpened = 0;

  for (const deal of deals ?? []) {
    const { count: soldCount } = await db
      .from("opportunity_slot_purchases")
      .select("id", { count: "exact", head: true })
      .eq("opportunity_id", deal.id);

    const previousBatchUnits = deal.estimated_stock_units;
    const previousBatchSoldOrListedUnits = soldCount ?? 0;

    // Aggregate guaranteed value if another batch opens — Section 8.4's
    // hard cap, checked BEFORE growing rather than after, so a deal simply
    // stops growing once it would cross the ceiling rather than briefly
    // exceeding it.
    const nextTotalUnits = previousBatchUnits + DEAL_DEFAULT_BATCH_SIZE;
    const projectedExposureGBP = (deal.fixed_price_coins ?? 0) * nextTotalUnits;
    const capReached = projectedExposureGBP >= CONCENTRATION_CAPS.perOpportunityAggregateGuaranteedValueGBP;

    const decision = shouldOpenNextBatch({
      previousBatchUnits,
      previousBatchSoldOrListedUnits,
      perOpportunityCapReached: capReached,
    });

    if (decision.open) {
      await db
        .from("opportunities")
        .update({
          estimated_stock_units: nextTotalUnits,
          batch_number: (deal.batch_number ?? 1) + 1,
          status: "live",
        })
        .eq("id", deal.id);
      batchesOpened++;
      console.log(`[evaluateBatchRelisting] Opened batch ${(deal.batch_number ?? 1) + 1} for deal ${deal.id}: ${decision.reason}`);
    }
  }

  return { evaluated: deals?.length ?? 0, batchesOpened };
}
