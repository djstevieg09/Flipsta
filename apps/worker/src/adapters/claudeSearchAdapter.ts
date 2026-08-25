import Anthropic from "@anthropic-ai/sdk";
import { SourceAdapter, CandidateDeal } from "./sourceAdapter.js";

/**
 * Real deal discovery via Claude's own web search — the alternative to
 * Keepa (INFRASTRUCTURE_TODO.md #6) Steven asked for: "search the web for
 * a product that is currently on offer and then also search selling sites
 * for the selling price". This uses Anthropic's server-side web_search
 * tool — the same mechanism as an ordinary Claude web search — run against
 * public retailer and marketplace pages. It is not scraping and does not
 * attempt to defeat any site's bot-detection; it only ever reads what a
 * normal web search already surfaces.
 *
 * Reuses ANTHROPIC_API_KEY, the same key that already powers aiScoring.ts
 * — no new env var. index.ts picks this adapter automatically the moment
 * that key is set, falling back to mockAdapter otherwise, same "stub until
 * configured" pattern as every other integration in this codebase.
 *
 * Cost note: unlike the free mock adapter, every run here does real,
 * billed web searches (~$10 per 1,000 searches, plus normal token cost for
 * a capable model) — see the discovery interval logic in index.ts, which
 * runs this far less often than the mock path for exactly that reason.
 */
const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

export function isClaudeSearchConfigured(): boolean {
  return Boolean(client);
}

// Must match supabase/seed.sql's categories exactly — discoverOpportunities.ts
// silently drops any candidate whose category_slug doesn't match a row in
// the categories table, so keep this list in sync if categories change.
const VALID_CATEGORY_SLUGS = ["collectibles", "footwear", "tech", "home-kitchen", "beauty"] as const;

const REPORT_TOOL = {
  name: "report_candidate_deals",
  description:
    "Report the resale opportunities found by web search this run. Only include deals with real, currently-live evidence for both the source listing and a comparable resale price elsewhere — omit anything you couldn't verify with an actual search result.",
  input_schema: {
    type: "object" as const,
    properties: {
      deals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category_slug: { type: "string", enum: [...VALID_CATEGORY_SLUGS] },
            source_tier: {
              type: "string",
              description: "Short description of the source, e.g. 'Major UK high-street clearance', 'Independent retailer clearance'.",
            },
            source_retailer: { type: "string", description: "The retailer's name, e.g. 'Argos', 'Currys'." },
            source_url: { type: "string", description: "The real product/listing URL you found this deal at." },
            source_price_gbp: { type: "number", minimum: 0.01 },
            estimated_resale_price_gbp: { type: "number", minimum: 0.01 },
            resale_evidence_url: {
              type: "string",
              description: "The real URL you checked (eBay sold listings, another marketplace, etc.) to justify the resale price estimate.",
            },
            estimated_stock_units: { type: "integer", minimum: 1 },
            per_customer_cap: {
              type: ["integer", "null"],
              description: "Per-customer purchase limit if the retailer states one, else null.",
            },
            price_volatility: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "0 = very stable price, 1 = highly volatile/likely to change fast.",
            },
          },
          required: [
            "category_slug",
            "source_tier",
            "source_retailer",
            "source_url",
            "source_price_gbp",
            "estimated_resale_price_gbp",
            "resale_evidence_url",
            "estimated_stock_units",
            "price_volatility",
          ],
        },
      },
    },
    required: ["deals"],
  },
};

const PROMPT = `You're sourcing real resale opportunities for a UK reselling marketplace. Use web search to find products that are:

1. Currently on genuine discount/clearance/overstock at a real UK (or reputable online) retailer right now — not a general "best deals" listicle, an actual specific product with a specific current price.
2. Resellable at a real profit — search a second-hand or marketplace site (eBay sold listings, Vinted, etc.) for what the same or equivalent item is actually selling for, so the margin is based on real evidence, not a guess. Amazon is NOT always the cheapest source — check independent retailers and other marketplaces too, not just Amazon.
3. In one of these categories only: collectibles, footwear, tech, home-kitchen, beauty.

Find up to 5 genuine candidates this run — fewer is fine and better than making anything up. For each, you must have an actual source URL for the current offer and an actual URL you checked for the resale price evidence. If you can't find enough real evidence for a category, skip it rather than estimate.

Call report_candidate_deals with what you found once you're done searching. If you find nothing real, call it with an empty deals array.`;

export const claudeSearchAdapter: SourceAdapter = {
  name: "claude-search",
  async findCandidates(): Promise<CandidateDeal[]> {
    if (!client) {
      throw new Error("claudeSearchAdapter needs ANTHROPIC_API_KEY set — see INFRASTRUCTURE_TODO.md #6.");
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }, REPORT_TOOL],
      messages: [{ role: "user", content: PROMPT }],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "report_candidate_deals",
    );
    const deals = (toolUse?.input as { deals?: unknown[] } | undefined)?.deals;
    if (!Array.isArray(deals)) {
      console.warn("[claudeSearchAdapter] No report_candidate_deals call in the response — treating as zero candidates this run.");
      return [];
    }

    const candidates: CandidateDeal[] = [];
    for (const raw of deals) {
      const d = raw as Record<string, unknown>;
      const categorySlug = typeof d.category_slug === "string" ? d.category_slug : "";
      if (!(VALID_CATEGORY_SLUGS as readonly string[]).includes(categorySlug)) continue;

      const sourcePriceGBP = Number(d.source_price_gbp);
      const estimatedResalePriceGBP = Number(d.estimated_resale_price_gbp);
      if (!(sourcePriceGBP > 0) || !(estimatedResalePriceGBP > 0)) continue;
      if (typeof d.source_url !== "string" || !d.source_url) continue;

      // Not persisted (no DB column for it yet) but logged so an admin can
      // spot-check early real runs against what Claude actually found —
      // worth reading Render's worker logs for the first few live runs.
      if (typeof d.resale_evidence_url === "string" && d.resale_evidence_url) {
        console.log(`[claudeSearchAdapter] ${d.source_retailer ?? "?"} £${sourcePriceGBP} -> resale evidence: ${d.resale_evidence_url}`);
      }

      candidates.push({
        categorySlug,
        sourceTier: typeof d.source_tier === "string" ? d.source_tier : "Web-sourced",
        sourceRetailer: typeof d.source_retailer === "string" ? d.source_retailer : "Unknown retailer",
        sourceUrl: d.source_url,
        sourcePriceGBP,
        estimatedResalePriceGBP,
        estimatedStockUnits: Math.max(1, Math.round(Number(d.estimated_stock_units) || 1)),
        perCustomerCap:
          typeof d.per_customer_cap === "number" && Number.isFinite(d.per_customer_cap) ? Math.round(d.per_customer_cap) : null,
        priceVolatility: Math.max(0, Math.min(1, Number(d.price_volatility) || 0.5)),
      });
    }

    return candidates;
  },
};
