import { createDb } from "../db.js";
import { verifyDealStillActive } from "../adapters/claudeSearchAdapter.js";

/**
 * Steven's ask, verbatim: a cheap opportunity that gets zero bids ("lapsed"
 * in closeExpiredAuctions.ts) shouldn't just disappear — check the next day
 * whether the underlying retailer deal is still active, and if so run the
 * auction again. Three consecutive no-bid days in a row rests it for a
 * week rather than repeating forever.
 *
 * closeExpiredAuctions.ts is what sets lapse_streak_days and next_recheck_at
 * (24h out) the moment something lapses — this job only ever looks at rows
 * that are actually due.
 */
export async function relistLapsedOpportunities() {
  const db = createDb();
  const nowIso = new Date().toISOString();

  const { data: due } = await db
    .from("opportunities")
    .select("id, source_retailer, source_url, source_price_gbp, action_clock_seconds, lapse_streak_days, suppressed_until")
    .eq("status", "lapsed")
    .lte("next_recheck_at", nowIso);

  let relisted = 0;
  let suppressed = 0;
  let retired = 0;

  for (const opp of due ?? []) {
    // Still resting from an earlier 3-in-a-row streak — leave it alone.
    if (opp.suppressed_until && new Date(opp.suppressed_until) > new Date()) continue;

    if ((opp.lapse_streak_days ?? 0) >= 3) {
      // Three consecutive no-bid days — rest it a week, then give it a
      // fresh 3-strike allowance rather than suppressing it forever.
      await db
        .from("opportunities")
        .update({
          suppressed_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          lapse_streak_days: 0,
          next_recheck_at: null,
        })
        .eq("id", opp.id);
      suppressed++;
      continue;
    }

    const stillActive = await verifyDealStillActive({
      sourceRetailer: opp.source_retailer ?? "",
      sourceUrl: opp.source_url ?? "",
      sourcePriceGBP: opp.source_price_gbp ?? 0,
    });

    if (!stillActive) {
      // Retailer deal is confirmed gone — no point re-checking this one
      // again, unlike a plain no-bid lapse.
      await db.from("opportunities").update({ status: "cancelled", next_recheck_at: null }).eq("id", opp.id);
      retired++;
      continue;
    }

    const expiresIso = new Date(Date.now() + (opp.action_clock_seconds ?? 30 * 60) * 1000).toISOString();
    await db
      .from("opportunities")
      .update({ status: "live", live_at: nowIso, action_clock_expires_at: expiresIso, next_recheck_at: null })
      .eq("id", opp.id)
      .eq("status", "lapsed");
    relisted++;
  }

  return { checked: due?.length ?? 0, relisted, suppressed, retired };
}
