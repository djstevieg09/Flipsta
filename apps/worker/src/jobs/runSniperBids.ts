import { createDb } from "../db.js";

/**
 * 27 Aug 2026, Steven: "Sniper mode needs setting up with its own tab."
 * sniper_rules (migration 0001) has existed since day one with real RLS,
 * but nothing ever read it — no API, no UI, and critically, nothing ever
 * actually placed a bid on a Pro/Elite user's behalf. This is that last
 * piece: the actual automatic bidding.
 *
 * Deliberately only acts within the last SNIPER_WINDOW_MINUTES of an
 * opportunity's action clock — real sniping (in trading and in auction
 * sites like eBay) means waiting until the last moment rather than
 * signalling your interest early and starting a bidding war sooner than
 * necessary. Runs on the same 30-second cadence as closeExpiredAuctions
 * (see index.ts) since the window this needs to react within is just as
 * tight.
 *
 * Within one opportunity, rules are processed sequentially (not all at
 * once) so each one reacts to the highest bid the previous one just
 * placed — the same dynamic a room full of real snipers would create,
 * bounded by MAX_ROUNDS so a misconfigured pair of rules with huge
 * budgets can't loop forever in a single tick.
 */
const SNIPER_WINDOW_MINUTES = 5;
const BID_INCREMENT_GBP = 2; // matches the manual "Bid £X+2" convention on /opportunities
const MAX_ROUNDS_PER_OPPORTUNITY = 6;

function marginPct(opp: { expected_margin_gbp: number; estimated_resale_price_gbp: number | null; instant_win_price_gbp: number }): number {
  const base = opp.estimated_resale_price_gbp ?? opp.instant_win_price_gbp;
  if (!base || base <= 0) return 0;
  return opp.expected_margin_gbp / base;
}

export async function runSniperBids() {
  const db = createDb();
  const now = new Date();
  const windowEndIso = new Date(now.getTime() + SNIPER_WINDOW_MINUTES * 60 * 1000).toISOString();

  const { data: closingOpps } = await db
    .from("opportunities")
    .select("id, category_id, expected_margin_gbp, estimated_resale_price_gbp, instant_win_price_gbp, starting_bid_gbp, action_clock_expires_at")
    .eq("status", "live")
    .not("action_clock_expires_at", "is", null)
    .lte("action_clock_expires_at", windowEndIso)
    .gt("action_clock_expires_at", now.toISOString());

  if (!closingOpps || closingOpps.length === 0) {
    return { opportunitiesChecked: 0, bidsPlaced: 0 };
  }

  const { data: activeRules } = await db
    .from("sniper_rules")
    .select("id, profile_id, category_id, max_budget_gbp, min_margin_pct")
    .eq("active", true);

  let bidsPlaced = 0;

  for (const opp of closingOpps) {
    const matchingRules = (activeRules ?? []).filter(
      (r) => (r.category_id === null || r.category_id === opp.category_id) && marginPct(opp) >= r.min_margin_pct,
    );
    if (matchingRules.length === 0) continue;

    for (let round = 0; round < MAX_ROUNDS_PER_OPPORTUNITY; round++) {
      const { data: highBid } = await db
        .from("bids")
        .select("bidder_id, amount_gbp")
        .eq("opportunity_id", opp.id)
        .order("amount_gbp", { ascending: false })
        .limit(1)
        .maybeSingle();

      const floor = highBid?.amount_gbp ?? opp.starting_bid_gbp;
      const nextAmount = Math.round((floor + BID_INCREMENT_GBP) * 100) / 100;

      // The next rule (in budget order — whoever can actually afford to top
      // the current bid, highest budget first) that isn't already sat as
      // the current highest bidder.
      const contender = matchingRules
        .filter((r) => r.profile_id !== highBid?.bidder_id && r.max_budget_gbp >= nextAmount)
        .sort((a, b) => b.max_budget_gbp - a.max_budget_gbp)[0];

      if (!contender) break; // nobody left who both matches and can afford to go higher

      const { error } = await db.from("bids").insert({
        opportunity_id: opp.id,
        bidder_id: contender.profile_id,
        amount_gbp: nextAmount,
      });
      if (error) {
        console.error(`[runSniperBids] failed to place bid on ${opp.id}:`, error.message);
        break;
      }
      bidsPlaced++;
    }
  }

  return { opportunitiesChecked: closingOpps.length, bidsPlaced };
}
