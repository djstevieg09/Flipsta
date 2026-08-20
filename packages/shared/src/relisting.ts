import { BATCH_RELIST_SELLTHROUGH_THRESHOLD } from "./constants.js";

/**
 * Section 11.2 — Batch Relisting & Market Depth Risk.
 * A new batch only opens once the previous one shows real sell-through
 * evidence — never on a fixed timer, and never just because the estimated
 * total market depth hasn't been reached yet.
 */
export function shouldOpenNextBatch(params: {
  previousBatchUnits: number;
  previousBatchSoldOrListedUnits: number;
  perOpportunityCapReached: boolean;
  threshold?: number;
}): { open: boolean; reason: string } {
  if (params.perOpportunityCapReached) {
    return { open: false, reason: "Section 8.4 hard exposure cap reached for this opportunity." };
  }
  if (params.previousBatchUnits <= 0) {
    return { open: false, reason: "No previous batch to evaluate." };
  }
  const sellThrough = params.previousBatchSoldOrListedUnits / params.previousBatchUnits;
  const threshold = params.threshold ?? BATCH_RELIST_SELLTHROUGH_THRESHOLD;
  if (sellThrough >= threshold) {
    return { open: true, reason: `Previous batch sell-through ${Math.round(sellThrough * 100)}% >= ${Math.round(threshold * 100)}% threshold.` };
  }
  return { open: false, reason: `Previous batch sell-through ${Math.round(sellThrough * 100)}% below ${Math.round(threshold * 100)}% threshold — no new batch yet.` };
}
