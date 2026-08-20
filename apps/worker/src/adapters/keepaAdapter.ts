import { SourceAdapter } from "./sourceAdapter.js";

/**
 * STUB — not implemented. Section 9.1 costs this at ~£25-45+/month for a
 * Keepa API plan. Once INFRASTRUCTURE_TODO.md's "data access" step is done
 * and KEEPA_API_KEY is set, implement findCandidates() to call Keepa's
 * product/price-history endpoints, apply the same margin-band filter the
 * mock adapter fakes, and return CandidateDeal[] in the same shape.
 *
 * Wire it in by swapping the adapter passed to runDiscovery() in
 * apps/worker/src/index.ts.
 */
export const keepaAdapter: SourceAdapter = {
  name: "keepa",
  async findCandidates() {
    throw new Error(
      "keepaAdapter is not implemented yet — set KEEPA_API_KEY and fill in the Keepa API calls here, or keep using mockAdapter for now.",
    );
  },
};
