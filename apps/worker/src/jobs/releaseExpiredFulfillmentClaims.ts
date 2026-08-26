import { createDb } from "../db.js";

/**
 * Steven's fairness ask for the crowd-fulfilled shop feature: "make sure
 * this is fair so one person isnt bashing all the orders as they come in.
 * maybe put a time delay or limit or something." The per-user concurrent
 * claim cap (canClaimAnotherFulfillmentJob, enforced in
 * apps/web/app/api/fulfillment/route.ts) stops one person hoarding jobs as
 * they arrive; this job is the other half — someone who claims a job and
 * then never ships it can't sit on it forever, either. Past
 * fulfillment_deadline_at (set at claim time via
 * fulfillmentClaimDeadline() in shopPricing.ts) with nothing shipped, the
 * claim is released back to the open pool for someone else to pick up.
 */
export async function releaseExpiredFulfillmentClaims() {
  const db = createDb();
  const nowIso = new Date().toISOString();

  const { data: expired } = await db
    .from("shop_items")
    .select("id, fulfiller_id")
    .eq("status", "fulfillment_claimed")
    .lt("fulfillment_deadline_at", nowIso);

  let released = 0;
  for (const item of expired ?? []) {
    // Guard the update on still being claimed by the same fulfiller who
    // held it when this job read the row, and on status still being
    // 'fulfillment_claimed' — the same optimistic-concurrency shape used
    // throughout this feature, so a fulfiller who ships in the exact
    // instant this job runs can't have their shipment silently reverted.
    const { error } = await db
      .from("shop_items")
      .update({
        status: "sold_awaiting_fulfillment",
        fulfiller_id: null,
        fulfillment_claimed_at: null,
        fulfillment_deadline_at: null,
      })
      .eq("id", item.id)
      .eq("status", "fulfillment_claimed")
      .eq("fulfiller_id", item.fulfiller_id);
    if (!error) released++;
  }

  return { checked: expired?.length ?? 0, released };
}
