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

// Must match a row in the categories table exactly — discoverOpportunities.ts
// silently drops any candidate whose category_slug doesn't match one, so
// keep this list in sync with supabase/migrations/0009_expand_categories.sql
// if categories change again. Broadened from the original 5 (Steven: "broadening
// the horizons") alongside moving discovery to twice a day instead of every
// 2 hours — roughly the same total daily search budget, spread across more
// categories rather than more frequent runs of a narrower set.
const VALID_CATEGORY_SLUGS = [
  "collectibles",
  "footwear",
  "tech",
  "home-kitchen",
  "beauty",
  "toys-games",
  "fashion-accessories",
  "sports-outdoors",
  "baby-kids",
  "gaming",
] as const;

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

1. Currently on genuine discount/clearance/overstock at a real UK (or reputable online) retailer right now, with a specific current price you can point to. A "best deals" roundup or clearance-page article is a GOOD place to START looking — it's an efficient way to surface leads — but don't report the roundup itself as the deal. Pick one specific product it names, then go confirm that product's own page: the exact current price, and ideally that it still shows as in stock/purchasable right now (deals do go out of stock — if the retailer's own page shows it unavailable, drop it and try another lead).
2. Resellable at a real profit — search a second-hand or marketplace site (eBay sold listings, Vinted, a collector price-tracker like BrickEconomy for LEGO, etc.) for what the same or equivalent item is actually selling for, so the margin is based on real evidence, not a guess. Amazon is NOT always the cheapest source — check independent retailers and other marketplaces too, not just Amazon. Note eBay's own search results sometimes fail to load for automated tools — if that happens, try a different resale evidence source rather than giving up on the candidate.
3. In one of these categories only: collectibles, footwear, tech, home-kitchen, beauty, toys-games, fashion-accessories, sports-outdoors, baby-kids, gaming.

This only runs twice a day, so this is the main chance to find the day's deals — spread your searching across a genuine mix of these categories rather than exhausting your budget on just one or two, but never lower the bar to fill a quota. Aim for 4-8 genuine, fully-verified candidates across the categories you check. Fewer real candidates is always better than making anything up. For each, you must have an actual source URL for the current offer and an actual URL you checked for the resale price evidence.

Call report_candidate_deals with what you found once you're done searching. If you find nothing real, call it with an empty deals array.`;

export const claudeSearchAdapter: SourceAdapter = {
  name: "claude-search",
  async findCandidates(): Promise<CandidateDeal[]> {
    if (!client) {
      throw new Error("claudeSearchAdapter needs ANTHROPIC_API_KEY set — see INFRASTRUCTURE_TODO.md #6.");
    }

    // Streaming, not .create() — the Anthropic SDK refuses to run a
    // non-streaming request that it estimates could take longer than 10
    // minutes (a real risk here: max_tokens 24000 + up to 32 web searches
    // to reason over), and throws client-side before ever calling the API
    // at all. That's the actual cause of the very last real run failing
    // outright ("Streaming is required for operations that may take longer
    // than 10 minutes") — not a bad prompt or a truncated response, an SDK
    // safety limit that has nothing to do with the account or the money
    // already spent on earlier runs. .stream().finalMessage() waits for
    // the same complete response with no such cap.
    const response = await client.messages
      .stream({
        model: "claude-sonnet-4-5",
        max_tokens: 24000,
        // Search budget raised alongside doubling the category count (5 -> 10)
        // so per-category coverage doesn't get thinner just because there's
        // more ground to cover in one run — this only runs twice a day
        // (index.ts), not every 2 hours, so each run matters more.
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 32 }, REPORT_TOOL],
        messages: [{ role: "user", content: PROMPT }],
      })
      .finalMessage();

    // Diagnostic logging — every real run so far has come back with zero
    // candidates despite genuinely spending money, which isn't normal even
    // for a strict "only report verified deals" instruction. This makes the
    // actual reason visible in Render's logs on the next run: did it hit
    // max_tokens mid-search (truncated before ever calling
    // report_candidate_deals), how many searches did it actually use out of
    // the 32 available, and what did it say in its own words.
    const searchesUsed = response.content.filter((b: any) => b.type === "server_tool_use" && b.name === "web_search").length;
    const toolCallNames = response.content.filter((b: any) => b.type === "tool_use").map((b: any) => b.name);
    const textPreview = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join(" ")
      .slice(0, 800);
    console.log(
      `[claudeSearchAdapter] stop_reason=${response.stop_reason} searches_used=${searchesUsed}/32 output_tokens=${response.usage?.output_tokens} tool_calls=[${toolCallNames.join(", ")}] text_preview=${JSON.stringify(textPreview)}`,
    );
    if (response.stop_reason === "max_tokens") {
      console.warn(
        "[claudeSearchAdapter] Response was CUT OFF by the max_tokens limit — it may never have reached report_candidate_deals. This is a strong candidate for why candidatesFound keeps coming back as 0.",
      );
    }

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

const VERIFY_TOOL = {
  name: "confirm_deal_status",
  description: "Report whether this specific deal is still a real, currently purchasable offer.",
  input_schema: {
    type: "object" as const,
    properties: {
      still_active: { type: "boolean", description: "true if the offer still appears live/purchasable, false if it's clearly gone (sold out, page removed, price changed a lot)." },
      reason: { type: "string" },
    },
    required: ["still_active"],
  },
};

/**
 * Steven's re-run ask: an opportunity that lapsed with zero bids gets
 * re-checked the next day rather than just discarded — but only actually
 * re-listed if the underlying retailer deal still looks real. Reuses the
 * same ANTHROPIC_API_KEY / web_search setup as findCandidates() above.
 *
 * Stub-until-configured, same as the rest of this file: with no key set,
 * this assumes "still active" so relistLapsedOpportunities.ts is
 * demonstrable without a paid key. On any API error it also assumes
 * "still active" (fails open) rather than silently killing a good deal
 * over a transient search failure.
 */
export async function verifyDealStillActive(deal: {
  sourceRetailer: string;
  sourceUrl: string;
  sourcePriceGBP: number;
}): Promise<boolean> {
  if (!client) return true;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 512,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }, VERIFY_TOOL],
      messages: [
        {
          role: "user",
          content: `Check whether this specific resale deal is still live and purchasable right now: retailer "${deal.sourceRetailer}", approx £${deal.sourcePriceGBP}, listing at ${deal.sourceUrl}. Use web search to check the actual page or a very recent reference to it, then call confirm_deal_status with your finding.`,
        },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "confirm_deal_status",
    );
    const stillActive = (toolUse?.input as { still_active?: unknown } | undefined)?.still_active;
    return stillActive !== false; // ambiguous/missing answer -> assume still active
  } catch (err) {
    console.error("[claudeSearchAdapter] verifyDealStillActive failed, assuming still active:", err);
    return true;
  }
}
