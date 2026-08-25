import Anthropic from "@anthropic-ai/sdk";
import { SourceAdapter, CandidateDeal } from "./sourceAdapter.js";

/**
 * Real deal discovery via Claude's own web search — the alternative to
 * Keepa (INFRASTRUCTURE_TODO.md #6) Steven asked for: "search the web for
 * a product that is currently on offer and then also search selling sites
 * for the selling price". It is not scraping and does not attempt to
 * defeat any site's bot-detection; it only ever reads what a normal web
 * fetch/search already surfaces.
 *
 * 25 Aug 2026 redesign: Steven, after 6 rounds of patching an open-ended
 * "go search the whole internet" prompt (it kept fixating on LEGO,
 * reasoning about collectible appreciation instead of resale value,
 * quitting early, spreading across categories instead of committing) —
 * "is this realy the best way to do this, the Bot is way too cautious."
 * Fair challenge. Leaving discovery itself (which page to even look at) up
 * to the model was the actual root cause underneath every one of those
 * bugs: an open-ended task gives it endless room to hedge, second-guess,
 * and default to whatever's most familiar. So the "where do I look"
 * decision has been taken out of its hands entirely — CURATED_SOURCES
 * below is a fixed, hand-picked list of real, currently-live UK retailer
 * clearance/outlet pages, one per category, verified by direct web search
 * on 25 Aug 2026. Each run is handed one exact URL and told to fetch it
 * directly (web_fetch — see focusSourceForRun) rather than going and
 * finding a page itself. Much less room to be "cautious" about, because
 * there's much less left to decide.
 *
 * Reuses ANTHROPIC_API_KEY, the same key that already powers aiScoring.ts
 * — no new env var. index.ts picks this adapter automatically the moment
 * that key is set, falling back to mockAdapter otherwise, same "stub until
 * configured" pattern as every other integration in this codebase.
 *
 * Cost note: web_fetch (used to read the curated clearance page itself)
 * has NO per-fetch charge on the Claude API — only standard token cost
 * for the page content that gets pulled into context, capped further by
 * max_content_tokens below. web_search (used only afterwards, to check
 * resale evidence for a specific candidate) is the billed piece, ~$10 per
 * 1,000 searches — its budget has been cut from 32 to 10 per run now that
 * it's no longer doing the discovery work too.
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

interface CuratedSource {
  category: (typeof VALID_CATEGORY_SLUGS)[number];
  retailer: string;
  url: string;
  domain: string; // used to scope web_fetch's allowed_domains for this run
}

// One real, currently-live UK retailer clearance/outlet page per category —
// every URL below was confirmed by direct web search on 25 Aug 2026, not
// guessed. This replaces "go find a clearance page" with "here's the exact
// page" — the actual fix for the LEGO fixation (LEGO was never a rule the
// model was following, it was the one thing it knew how to find under an
// open-ended search task) and for the general over-caution Steven flagged:
// there's no longer a "which page should I even look at" decision to hedge
// over. If a retailer changes its clearance URL structure, update the
// affected row here — nothing else needs to change.
const CURATED_SOURCES: CuratedSource[] = [
  { category: "collectibles", retailer: "Zavvi", url: "https://www.zavvi.com/c/offers/clearance/all/", domain: "zavvi.com" },
  { category: "footwear", retailer: "Clarks Outlet", url: "https://www.clarksoutlet.co.uk/clearance/clearance_uko-c", domain: "clarksoutlet.co.uk" },
  { category: "tech", retailer: "Currys", url: "https://www.currys.co.uk/clearance", domain: "currys.co.uk" },
  { category: "home-kitchen", retailer: "The Range", url: "https://www.therange.co.uk/clearance/kitchen-and-household-clearance/", domain: "therange.co.uk" },
  { category: "beauty", retailer: "Boots", url: "https://www.boots.com/all-clearance", domain: "boots.com" },
  { category: "toys-games", retailer: "Smyths Toys", url: "https://www.smythstoys.com/uk/en-gb/toys/clearance/c/SM060109", domain: "smythstoys.com" },
  { category: "fashion-accessories", retailer: "ASOS", url: "https://www.asos.com/discover/asos-outlet/", domain: "asos.com" },
  { category: "sports-outdoors", retailer: "Decathlon", url: "https://www.decathlon.co.uk/deals", domain: "decathlon.co.uk" },
  { category: "baby-kids", retailer: "Mamas & Papas", url: "https://www.mamasandpapas.com/collections/baby-sale-clearance", domain: "mamasandpapas.com" },
  { category: "gaming", retailer: "GAME", url: "https://www.game.co.uk/deals/clearance", domain: "game.co.uk" },
];

const RESALE_EVIDENCE_HINTS: Record<(typeof VALID_CATEGORY_SLUGS)[number], string> = {
  collectibles: "eBay UK sold listings — that's the real near-term resale price. A collector tracker like BrickEconomy is fine as a secondary GBP-only sanity check, never a USD price and never an 'investment growth' figure — see the note below on why.",
  footwear: "eBay sold listings, StockX, or GOAT",
  tech: "eBay sold listings, or CeX's own trade-in/resale pricing",
  "home-kitchen": "eBay sold listings or Vinted",
  beauty: "eBay sold listings or Vinted — check it's sealed/unused, resale value collapses fast on opened beauty items",
  "toys-games": "eBay UK sold listings — that's the real near-term resale price. A collector tracker like BrickEconomy is fine as a secondary GBP-only sanity check, never a USD price and never an 'investment growth' figure — see the note below on why.",
  "fashion-accessories": "eBay sold listings, Vinted, or Depop",
  "sports-outdoors": "eBay sold listings or Vinted",
  "baby-kids": "eBay sold listings or Vinted",
  gaming: "eBay sold listings, CeX, or PriceCharting for game/console resale value",
};

// Deterministic rotation, not random or model-chosen — advances to the next
// source roughly every 12h (matching the twice-a-day interval in index.ts)
// purely from wall-clock time, so it needs no stored state and naturally
// cycles through all 10 sources over 5 days regardless of how many times
// the worker gets restarted in between.
function focusSourceForRun(): CuratedSource {
  const twelveHourBuckets = Math.floor(Date.now() / (12 * 60 * 60 * 1000));
  return CURATED_SOURCES[twelveHourBuckets % CURATED_SOURCES.length];
}

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

function buildPrompt(source: CuratedSource): string {
  return `You're sourcing real resale opportunities for a UK reselling marketplace. The discovery step is already done for you — don't go searching for a clearance page, use this exact one:

FETCH THIS URL FIRST, using web_fetch: ${source.url}
That's ${source.retailer}'s real, live "${source.category}" clearance/outlet page. It'll show several products with a current price and usually a was/RRP price right on the page — that's your discount evidence, already real, no need to re-verify it exists.

From what you see there:
1. Pick 1-2 products with a genuine, clearly-marked discount and (if shown) in-stock availability. If the page looks thin on real content (some retailer sites don't render properly for a plain fetch), use web_search restricted to ${source.domain} instead, e.g. "site:${source.domain} clearance" — don't burn time on that fallback if the fetch worked.
2. For each one, use web_search to find real resale evidence — what the same or equivalent item is actually selling for right now. Good sources for this category: ${RESALE_EVIDENCE_HINTS[source.category]}.

ON RESALE EVIDENCE — a true "sold/completed" eBay listing is the gold standard, but it's genuinely often invisible to a plain web search (eBay's own sold-items filter isn't reliably exposed to automated tools — this is a known limitation, not something to burn your whole search budget chasing). If you can't find one after 2-3 real attempts, it's fine to instead use several CURRENT live listings (eBay, Vinted, or another marketplace) clustering around a similar price as your evidence — that's a genuine, honest signal of real resale value even without a confirmed completed sale, and is a completely acceptable substitute. What's NOT acceptable: a single unrelated price you happened to notice (e.g. a different current offer on the SAME retailer site you're sourcing from — that's not independent resale evidence, don't use it), or inventing a plausible-sounding number with no real URL behind it.

THIS IS RETAIL ARBITRAGE, NOT COLLECTIBLE INVESTING. Profit comes from buying BELOW an item's normal price and reselling AT OR NEAR that normal price, soon (days to weeks) — not from it appreciating over months/years like a collector holding it. A £120 item with a ~£200+ normal price is a good candidate even if some tracker site says it "hasn't appreciated" — that phrase is about long-term collectible growth and is irrelevant here; never use it as a reason to drop a candidate, and never use it as your resale evidence. Check currency too — if a site shows USD or another non-GBP currency, convert explicitly or find a GBP source instead.

Report what you find with report_candidate_deals — category_slug should be "${source.category}". An empty deals array is a completely fine outcome if nothing on the page genuinely clears a real margin; don't invent a candidate to avoid reporting zero.`;
}

export const claudeSearchAdapter: SourceAdapter = {
  name: "claude-search",
  async findCandidates(): Promise<CandidateDeal[]> {
    if (!client) {
      throw new Error("claudeSearchAdapter needs ANTHROPIC_API_KEY set — see INFRASTRUCTURE_TODO.md #6.");
    }

    // Streaming, not .create() — the Anthropic SDK refuses to run a
    // non-streaming request that it estimates could take longer than 10
    // minutes, and throws client-side before ever calling the API at all.
    // .stream().finalMessage() waits for the same complete response with
    // no such cap. Less of a real risk now than when this budget was 32
    // searches for open-ended discovery, but cheap insurance to keep.
    // 25 Aug real run: a genuinely good run (4 real candidates found from
    // one clean web_fetch) still came back with candidatesFound: 0 because
    // it used 7 of 10 searches hunting for true "sold" eBay evidence — hard
    // to find for any automated tool, eBay's sold-items filter especially —
    // and correctly refused to invent evidence rather than report nothing.
    // Raised the budget a bit so a genuinely hard resale-evidence search
    // isn't cut short by budget alone, alongside relaxing what counts as
    // acceptable evidence (see buildPrompt's "ON RESALE EVIDENCE" note).
    const WEB_SEARCH_MAX_USES = 14; // resale-evidence checks only now, not discovery — see file header
    const WEB_FETCH_MAX_USES = 4; // the curated page itself, plus room for a product page or a fallback fetch

    // Computed once per run (not per continuation) so a paused-and-resumed
    // run stays on the same source throughout — see focusSourceForRun.
    const source = focusSourceForRun();
    const tools: Anthropic.Messages.MessageCreateParams["tools"] = [
      {
        type: "web_fetch_20250910",
        name: "web_fetch",
        max_uses: WEB_FETCH_MAX_USES,
        allowed_domains: [source.domain, `www.${source.domain}`],
        max_content_tokens: 50000,
      },
      { type: "web_search_20250305", name: "web_search", max_uses: WEB_SEARCH_MAX_USES },
      REPORT_TOOL,
    ];
    const prompt = buildPrompt(source);
    console.log(`[claudeSearchAdapter] This run's source: ${source.retailer} (${source.category}) — ${source.url}`);
    let messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: prompt }];
    let response = await client.messages.stream({ model: "claude-sonnet-4-5", max_tokens: 24000, tools, messages }).finalMessage();

    // stop_reason "pause_turn" is Anthropic's server-side sampling loop
    // hitting its own internal iteration cap mid-way through a server tool
    // (web_search) — it's not finished, just paused, and the documented fix
    // is to send the assistant's partial response straight back and let it
    // continue (server tools keep their state across the pause; no
    // tool_result needed). Seen for real on this account: it had committed
    // to one specific lead (an Argos LEGO clearance set), confirmed the
    // product and price, and was mid-way through checking stock when it got
    // paused — exactly the kind of thorough, depth-first search this
    // adapter is now supposed to do, so finishing the turn matters more
    // than ever rather than treating a pause as "found nothing."
    let continuations = 0;
    const MAX_CONTINUATIONS = 6;
    while (response.stop_reason === "pause_turn" && continuations < MAX_CONTINUATIONS) {
      continuations++;
      console.log(`[claudeSearchAdapter] stop_reason=pause_turn — continuing (${continuations}/${MAX_CONTINUATIONS})`);
      messages = [{ role: "user", content: prompt }, { role: "assistant", content: response.content }];
      response = await client.messages.stream({ model: "claude-sonnet-4-5", max_tokens: 24000, tools, messages }).finalMessage();
    }
    if (response.stop_reason === "pause_turn") {
      console.warn(`[claudeSearchAdapter] Still paused after ${MAX_CONTINUATIONS} continuations — giving up on this run.`);
    }

    // Diagnostic logging — kept from the earlier debugging rounds since it's
    // what actually found every bug fixed today. Now also tracks web_fetch
    // usage (free, but worth seeing whether the curated-page fetch actually
    // worked or fell back to search every time).
    const searchesUsed = response.content.filter((b: any) => b.type === "server_tool_use" && b.name === "web_search").length;
    const fetchesUsed = response.content.filter((b: any) => b.type === "server_tool_use" && b.name === "web_fetch").length;
    const toolCallNames = response.content.filter((b: any) => b.type === "tool_use").map((b: any) => b.name);
    const textPreview = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join(" ")
      .slice(0, 800);
    console.log(
      `[claudeSearchAdapter] stop_reason=${response.stop_reason} fetches_used=${fetchesUsed}/${WEB_FETCH_MAX_USES} searches_used=${searchesUsed}/${WEB_SEARCH_MAX_USES} output_tokens=${response.usage?.output_tokens} tool_calls=[${toolCallNames.join(", ")}] text_preview=${JSON.stringify(textPreview)}`,
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
 * re-listed if the underlying retailer deal still looks real.
 *
 * Unlike findCandidates() above, this already has an exact known URL to
 * check — no discovery step needed — so web_fetch (free, direct) is a
 * better fit than a web_search re-lookup, with web_search kept as a small
 * fallback for the rare case the fetch fails (page moved, blocks plain
 * fetches, etc.).
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

  let allowedDomains: string[] | undefined;
  try {
    const host = new URL(deal.sourceUrl).hostname;
    allowedDomains = [host, host.replace(/^www\./, "")];
  } catch {
    allowedDomains = undefined; // malformed URL — let web_fetch's own validation handle it
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 512,
      tools: [
        { type: "web_fetch_20250910", name: "web_fetch", max_uses: 2, allowed_domains: allowedDomains, max_content_tokens: 20000 },
        { type: "web_search_20250305", name: "web_search", max_uses: 1 },
        VERIFY_TOOL,
      ],
      messages: [
        {
          role: "user",
          content: `Check whether this specific resale deal is still live and purchasable right now: retailer "${deal.sourceRetailer}", approx £${deal.sourcePriceGBP}, listing at ${deal.sourceUrl}. Fetch that exact URL directly with web_fetch first — only fall back to web_search if the fetch fails or the page has clearly moved. Then call confirm_deal_status with your finding.`,
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
