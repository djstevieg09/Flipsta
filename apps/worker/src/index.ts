import { discoverOpportunities } from "./jobs/discoverOpportunities.js";
import { closeExpiredAuctions } from "./jobs/closeExpiredAuctions.js";
import { relistLapsedOpportunities } from "./jobs/relistLapsedOpportunities.js";
import { evaluateBatchRelisting } from "./jobs/evaluateBatchRelisting.js";
import { releaseEscrow } from "./jobs/releaseEscrow.js";
import { flagRiskSignals } from "./jobs/flagRiskSignals.js";
import { crossPostListings } from "./jobs/crossPostListings.js";
import { releaseExpiredFulfillmentClaims } from "./jobs/releaseExpiredFulfillmentClaims.js";
import { expireSeasonalStock } from "./jobs/expireSeasonalStock.js";
import { notifyDealMatches } from "./jobs/notifyDealMatches.js";
import { runSniperBids } from "./jobs/runSniperBids.js";
import { mockAdapter } from "./adapters/mockAdapter.js";
import { claudeSearchAdapter, isClaudeSearchConfigured } from "./adapters/claudeSearchAdapter.js";

/**
 * Deliberately simple interval-based scheduler rather than a job queue
 * (pg-boss/BullMQ) — the right choice for launch volume. See
 * INFRASTRUCTURE_TODO.md for when/why to graduate to a real queue as
 * opportunity and order volume grows.
 *
 * Deploys as its own Render background worker service (render.yaml) so it
 * scales independently of the web app.
 */

// Section 9 / INFRASTRUCTURE_TODO.md #6 — real discovery via Claude's own
// web search (claudeSearchAdapter.ts) turns on automatically the moment
// ANTHROPIC_API_KEY is set, the same "stub until configured" pattern as
// aiScoring.ts (which reuses that same key). Falls back to the free mock
// adapter with no key set, so the pipeline is always runnable.
const discoveryAdapter = isClaudeSearchConfigured() ? claudeSearchAdapter : mockAdapter;

// Real discovery does billed web searches every run (~$10/1,000 searches +
// tokens — see claudeSearchAdapter.ts) — run it far less often than the
// free mock path. Steven: "twice a day" once the real cost of the old
// 2-hour cadence became clear (12 runs/day across 5 categories added up
// fast) — 720 minutes = twice a day, spread across the now-broadened
// 10-category list instead. Override with DISCOVERY_INTERVAL_MINUTES on
// Render any time you want a different cadence without a redeploy.
const DEFAULT_DISCOVERY_MINUTES = isClaudeSearchConfigured() ? 720 : 5; // Section 9.2: start at 3-5 opportunities/day
const discoveryIntervalMs = (Number(process.env.DISCOVERY_INTERVAL_MINUTES) || DEFAULT_DISCOVERY_MINUTES) * 60 * 1000;

// Kill switch for real discovery specifically — set DISCOVERY_PAUSED=true on
// Render to stop spending on search/scoring while diagnosing an issue,
// without having to unset ANTHROPIC_API_KEY (which would also turn off AI
// scoring and the lapsed-deal recheck). Every other job keeps running as
// normal. Remove the env var (or set it to anything else) to resume.
const discoveryPaused = process.env.DISCOVERY_PAUSED === "true";

const INTERVALS_MS = {
  discovery: discoveryIntervalMs,
  closeAuctions: 30 * 1000, // action clocks are as short as 20 minutes (Section 11.1) — check often
  sniperBids: 30 * 1000, // 27 Aug 2026 — same cadence as closeAuctions; see runSniperBids.ts for the 5-min sniping window this checks against
  relistLapsed: 30 * 60 * 1000, // gated internally by next_recheck_at (24h), so this just needs to be "often enough"
  batchRelist: 10 * 60 * 1000,
  releaseEscrow: 60 * 60 * 1000,
  riskSignals: 15 * 60 * 1000, // Section 12.1 — feeds the admin dashboard's Risk & Fraud tab
  crossPost: 2 * 60 * 1000, // retry sweep for cross-posting that didn't succeed at submit time
  fulfillmentClaims: 15 * 60 * 1000, // fairness sweep — see releaseExpiredFulfillmentClaims.ts
  seasonalExpiry: 60 * 60 * 1000, // dates, not minutes, matter here — hourly is plenty; see expireSeasonalStock.ts
  dealMatchNotifications: 30 * 60 * 1000, // 27 Aug 2026 — real-time-ish without spamming; see notifyDealMatches.ts
};

async function tick(name: string, fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    console.log(`[worker] ${name} ->`, result);
  } catch (err) {
    console.error(`[worker] ${name} failed:`, err);
  }
}

async function main() {
  console.log(
    `[worker] Flipsta worker starting. Discovery source: ${discoveryAdapter.name}` +
      (discoveryAdapter === mockAdapter ? " (set ANTHROPIC_API_KEY for real Claude-web-search discovery)" : "") +
      `, every ${INTERVALS_MS.discovery / 60000}min.` +
      (discoveryPaused ? " DISCOVERY_PAUSED=true — discovery will NOT run until this is removed." : ""),
  );

  if (discoveryPaused) {
    console.log("[worker] discoverOpportunities skipped — DISCOVERY_PAUSED=true");
  } else {
    await tick("discoverOpportunities", () => discoverOpportunities(discoveryAdapter));
  }
  await tick("closeExpiredAuctions", closeExpiredAuctions);
  await tick("runSniperBids", runSniperBids);
  await tick("relistLapsedOpportunities", relistLapsedOpportunities);
  await tick("evaluateBatchRelisting", evaluateBatchRelisting);
  await tick("releaseEscrow", releaseEscrow);
  await tick("flagRiskSignals", flagRiskSignals);
  await tick("crossPostListings", crossPostListings);
  await tick("releaseExpiredFulfillmentClaims", releaseExpiredFulfillmentClaims);
  await tick("expireSeasonalStock", expireSeasonalStock);
  await tick("notifyDealMatches", notifyDealMatches);

  if (!discoveryPaused) {
    setInterval(() => tick("discoverOpportunities", () => discoverOpportunities(discoveryAdapter)), INTERVALS_MS.discovery);
  }
  setInterval(() => tick("closeExpiredAuctions", closeExpiredAuctions), INTERVALS_MS.closeAuctions);
  setInterval(() => tick("runSniperBids", runSniperBids), INTERVALS_MS.sniperBids);
  setInterval(() => tick("relistLapsedOpportunities", relistLapsedOpportunities), INTERVALS_MS.relistLapsed);
  setInterval(() => tick("evaluateBatchRelisting", evaluateBatchRelisting), INTERVALS_MS.batchRelist);
  setInterval(() => tick("releaseEscrow", releaseEscrow), INTERVALS_MS.releaseEscrow);
  setInterval(() => tick("flagRiskSignals", flagRiskSignals), INTERVALS_MS.riskSignals);
  setInterval(() => tick("crossPostListings", crossPostListings), INTERVALS_MS.crossPost);
  setInterval(() => tick("releaseExpiredFulfillmentClaims", releaseExpiredFulfillmentClaims), INTERVALS_MS.fulfillmentClaims);
  setInterval(() => tick("expireSeasonalStock", expireSeasonalStock), INTERVALS_MS.seasonalExpiry);
  setInterval(() => tick("notifyDealMatches", notifyDealMatches), INTERVALS_MS.dealMatchNotifications);
}

main().catch((err) => {
  console.error("[worker] fatal error", err);
  process.exit(1);
});
