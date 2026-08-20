import { discoverOpportunities } from "./jobs/discoverOpportunities.js";
import { closeExpiredAuctions } from "./jobs/closeExpiredAuctions.js";
import { evaluateBatchRelisting } from "./jobs/evaluateBatchRelisting.js";
import { releaseEscrow } from "./jobs/releaseEscrow.js";
import { flagRiskSignals } from "./jobs/flagRiskSignals.js";
import { crossPostListings } from "./jobs/crossPostListings.js";
import { mockAdapter } from "./adapters/mockAdapter.js";

/**
 * Deliberately simple interval-based scheduler rather than a job queue
 * (pg-boss/BullMQ) — the right choice for launch volume. See
 * INFRASTRUCTURE_TODO.md for when/why to graduate to a real queue as
 * opportunity and order volume grows.
 *
 * Deploys as its own Render background worker service (render.yaml) so it
 * scales independently of the web app.
 */
const INTERVALS_MS = {
  discovery: 5 * 60 * 1000, // Section 9.2: start at 3-5 opportunities/day, so this can be infrequent
  closeAuctions: 30 * 1000, // action clocks are as short as 20 minutes (Section 11.1) — check often
  batchRelist: 10 * 60 * 1000,
  releaseEscrow: 60 * 60 * 1000,
  riskSignals: 15 * 60 * 1000, // Section 12.1 — feeds the admin dashboard's Risk & Fraud tab
  crossPost: 2 * 60 * 1000, // retry sweep for cross-posting that didn't succeed at submit time
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
  console.log("[worker] Flipsta worker starting. Source adapter: mock (see adapters/keepaAdapter.ts to go live).");

  await tick("discoverOpportunities", () => discoverOpportunities(mockAdapter));
  await tick("closeExpiredAuctions", closeExpiredAuctions);
  await tick("evaluateBatchRelisting", evaluateBatchRelisting);
  await tick("releaseEscrow", releaseEscrow);
  await tick("flagRiskSignals", flagRiskSignals);
  await tick("crossPostListings", crossPostListings);

  setInterval(() => tick("discoverOpportunities", () => discoverOpportunities(mockAdapter)), INTERVALS_MS.discovery);
  setInterval(() => tick("closeExpiredAuctions", closeExpiredAuctions), INTERVALS_MS.closeAuctions);
  setInterval(() => tick("evaluateBatchRelisting", evaluateBatchRelisting), INTERVALS_MS.batchRelist);
  setInterval(() => tick("releaseEscrow", releaseEscrow), INTERVALS_MS.releaseEscrow);
  setInterval(() => tick("flagRiskSignals", flagRiskSignals), INTERVALS_MS.riskSignals);
  setInterval(() => tick("crossPostListings", crossPostListings), INTERVALS_MS.crossPost);
}

main().catch((err) => {
  console.error("[worker] fatal error", err);
  process.exit(1);
});
