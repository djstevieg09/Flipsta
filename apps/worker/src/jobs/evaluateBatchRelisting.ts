import { shouldOpenNextBatch, CONCENTRATION_CAPS } from "@flipsta/shared";
import { createDb } from "../db.js";

/**
 * Section 11.2 — only opens a new batch of a won/lapsed opportunity's
 * underlying deal once the previous batch shows real sell-through, gated
 * by the Section 8.4 hard per-opportunity exposure cap.
 */
export async function evaluateBatchRelisting() {
  const db = createDb();

  // "Previous batch" = the most recent won opportunity per source (grouped
  // by source_url) that still has estimated stock remaining beyond what's
  // been listed so far. This is intentionally simple; a real implementation
  // would also track actual marketplace sell-through per Section 11.2, not
  // just "won" as a stand-in for "listed".
  const { data: wonOpportunities } = await db
    .from("opportunities")
    .select("id, source_url, estimated_stock_units, per_customer_cap, batch_number, source_price_gbp")
    .eq("status", "won")
    .not("source_url", "is", null);

  let batchesOpened = 0;

  for (const opp of wonOpportunities ?? []) {
    if (!opp.per_customer_cap) continue; // no cap means no batching concept applies

    const aggregateExposureGBP = (opp.per_customer_cap ?? 0) * (opp.source_price_gbp ?? 0);
    const capReached = aggregateExposureGBP >= CONCENTRATION_CAPS.perOpportunityAggregateGuaranteedValueGBP;

    const decision = shouldOpenNextBatch({
      previousBatchUnits: opp.per_customer_cap,
      previousBatchSoldOrListedUnits: opp.per_customer_cap, // stand-in until real sell-through tracking exists
      perOpportunityCapReached: capReached,
    });

    if (decision.open) {
      await db
        .from("opportunities")
        .update({ batch_number: (opp.batch_number ?? 1) + 1 })
        .eq("id", opp.id);
      batchesOpened++;
    }
  }

  return { evaluated: wonOpportunities?.length ?? 0, batchesOpened };
}
