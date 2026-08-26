import { createDb } from "../db.js";

/**
 * 26 Aug 2026, Steven, "tonight's list": "also needs to remove Halloween
 * stuff after its past and then start looking for the next big holiday."
 * The other half of the "Full calendar" seasonal feature — discoverOpportunities.ts
 * tags a shop_item with seasonal_event_id when the AI matches it to an
 * active seasonal_events row (migration 0019); this job is what actually
 * clears it back off the shop once that event's expire_stock_after date has
 * passed, same "gone from the shop, doesn't just sit there stale" behaviour
 * Steven asked for.
 *
 * Only ever touches 'available' stock — anything already sold, claimed for
 * fulfillment, shipped, or delivered is a real transaction in progress and
 * must never be silently cancelled out from under a buyer or fulfiller just
 * because the season moved on. A still-unsold unit past its window becomes
 * 'cancelled', the same status releaseExpiredFulfillmentClaims.ts and the
 * rest of the shop lifecycle already use for "no longer available."
 */
export async function expireSeasonalStock() {
  const db = createDb();
  const todayIso = new Date().toISOString().slice(0, 10);

  const { data: expiredEvents } = await db
    .from("seasonal_events")
    .select("id, name")
    .lt("expire_stock_after", todayIso);

  if (!expiredEvents || expiredEvents.length === 0) {
    return { expiredEventsChecked: 0, itemsCancelled: 0 };
  }

  let itemsCancelled = 0;
  for (const event of expiredEvents) {
    const { data: updated, error } = await db
      .from("shop_items")
      .update({ status: "cancelled" })
      .eq("seasonal_event_id", event.id)
      .eq("status", "available")
      .select("id");
    if (error) {
      console.error(`[expireSeasonalStock] Failed clearing stock for "${event.name}": ${error.message}`);
      continue;
    }
    const count = updated?.length ?? 0;
    if (count > 0) {
      console.log(`[expireSeasonalStock] Cleared ${count} unsold unit(s) for expired seasonal event "${event.name}".`);
    }
    itemsCancelled += count;
  }

  return { expiredEventsChecked: expiredEvents.length, itemsCancelled };
}
