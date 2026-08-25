import { createDb } from "../db.js";

/**
 * Design decision worth flagging (see STATUS.md): the business doc describes
 * both a live ascending/decaying auction (Section 11.3: "instant-win sits
 * alongside the live auction, not instead of it") and a worked example that
 * reads more like first-bid-wins (Section 3.2). This implementation treats
 * it as a genuine ascending auction — the action clock is the opportunity's
 * live-bidding window, and whoever holds the highest bid when it expires
 * wins. Confirm this matches intent before relying on it for real money.
 */
export async function closeExpiredAuctions() {
  const db = createDb();
  const nowIso = new Date().toISOString();

  const { data: expired } = await db
    .from("opportunities")
    .select("id, lapse_streak_days")
    .eq("status", "live")
    .lt("action_clock_expires_at", nowIso);

  let won = 0;
  let lapsed = 0;

  for (const opp of expired ?? []) {
    const { data: highBid } = await db
      .from("bids")
      .select("bidder_id, amount_gbp")
      .eq("opportunity_id", opp.id)
      .order("amount_gbp", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (highBid) {
      await db.from("opportunities").update({ status: "won", won_by: highBid.bidder_id }).eq("id", opp.id).eq("status", "live");
      won++;
    } else {
      // No bids at all — rather than dying here, this gets one more look
      // tomorrow (Steven's ask). See relistLapsedOpportunities.ts, which
      // reads lapse_streak_days / next_recheck_at set here.
      const nextRecheckIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await db
        .from("opportunities")
        .update({
          status: "lapsed",
          lapse_streak_days: (opp.lapse_streak_days ?? 0) + 1,
          next_recheck_at: nextRecheckIso,
        })
        .eq("id", opp.id)
        .eq("status", "live");
      lapsed++;
    }
  }

  return { checked: expired?.length ?? 0, won, lapsed };
}
