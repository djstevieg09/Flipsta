import Anthropic from "@anthropic-ai/sdk";
import { SourceAdapter, CandidateDeal, ShopCandidate, DiscoveryBatch, DiscoveryResult, DiscoveryContext } from "./sourceAdapter.js";

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
 *
 * 26 Aug 2026, Steven: "tokens are burning way too fast... if you use a
 * slower engine will that save money per search?" Model speed itself
 * doesn't set the price — token count does — but a cheaper-per-token model
 * does, and there's genuinely no rush on this data (discovery already runs
 * twice a day on a schedule, nothing here is latency-sensitive). Two real
 * changes: every discovery call below now uses claude-sonnet-5 instead of
 * claude-sonnet-4-5 (same quality tier, ~33% cheaper per Anthropic's
 * published pricing: $2/$10 per MTok in/out vs $3/$15), and
 * verifyDealStillActive — a much simpler "is this still live" check, not
 * open-ended discovery — now uses claude-haiku-4-5 ($1/$5 per MTok), per
 * Steven's explicit "test Haiku on the re-verification step." WEB_SEARCH_MAX_USES
 * is also trimmed (see below) — real runs almost always stop after the
 * first source once one opportunity clears the bar, so most of that budget
 * was headroom that rarely got used.
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
  // "any" — Temu-style general marketplace sources sell across every
  // category on one page, so there's no single right answer to pin the
  // source to; the model picks the real category_slug per product instead
  // (see buildPrompt).
  category: (typeof VALID_CATEGORY_SLUGS)[number] | "any";
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
  // 26 Aug 2026, Steven: "What about alibaba and temu sites... These are
  // people looking to buy bulk items and reselling them?" Temu added —
  // it's individual consumer items at low prices, the same "buy one item,
  // resell it for more" shape as everything above, so it fits this
  // adapter as-is. Alibaba deliberately NOT added: it's wholesale/bulk-lot
  // buying (minimum order quantities, real capital tied up in stock,
  // splitting one bulk purchase into many resale listings) — a genuinely
  // different business model Flipsta's one-item-per-opportunity design
  // doesn't support today, not a same-day addition here. Real caveats on
  // Temu itself, worth knowing: shipping is typically 1-3 weeks (not
  // days), and quality/authenticity is less consistent than an
  // established UK retailer — both are on top of the usual verification
  // this file already does, not a reason to skip it. Its site is heavily
  // JS-rendered, so web_fetch will likely come back thin — the existing
  // "fall back to web_search" instruction in buildPrompt already covers
  // that, same as it does for The Range/Boots today.
  { category: "any", retailer: "Temu", url: "https://www.temu.com/uk/c.html", domain: "temu.com" },
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

// General-purpose fallback for a source (Temu) that isn't tied to one
// fixed category — the specific hint above is still better when a source
// has one, this is only used when source.category is "any".
const GENERAL_RESALE_EVIDENCE_HINT = "eBay sold listings, or Vinted/Depop/CeX depending on what kind of item it is";

// Deterministic rotation, not random or model-chosen — advances to the next
// source roughly every 12h (matching the twice-a-day interval in index.ts)
// purely from wall-clock time, so it needs no stored state and naturally
// cycles through all 10 sources over 5 days regardless of how many times
// the worker gets restarted in between.
function focusSourceForRun(sources: CuratedSource[] = CURATED_SOURCES): CuratedSource {
  const twelveHourBuckets = Math.floor(Date.now() / (12 * 60 * 60 * 1000));
  return sources[twelveHourBuckets % sources.length];
}

const REPORT_TOOL = {
  name: "report_candidate_deals",
  description:
    "Report what this run's web search found. Two different arrays for two different outcomes of the same search: `deals` for a genuine reseller opportunity with independent resale evidence, `shop_candidates` for a genuine retailer discount you couldn't find independent resale evidence for (see the instructions below for exactly which bucket a given find belongs in). Omit anything from both that you couldn't verify with an actual search result.",
  input_schema: {
    type: "object" as const,
    properties: {
      deals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category_slug: { type: "string", enum: [...VALID_CATEGORY_SLUGS] },
            product_name: {
              type: "string",
              description:
                "The specific product's real name, as it appears on the source page — e.g. 'Eaglemoss Star Trek Klingon Bird-of-Prey Die-Cast Model', not just its category. This becomes the listing title once someone wins it, so be specific and accurate — no invented model numbers or details you didn't actually see.",
            },
            image_url: {
              type: ["string", "null"],
              description:
                "A real product image URL for this exact item, if one is visible in the page content you fetched (an <img> src, an og:image, etc.). null if you didn't see one — don't guess or invent one.",
            },
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
            seasonal_event_name: {
              type: ["string", "null"],
              description:
                "If the prompt gave you a seasonal priority (a 'SEASONAL PRIORITY' section) and this product genuinely matches one, put that event's EXACT name here, character for character. Otherwise null — never invent an event name.",
            },
          },
          required: [
            "category_slug",
            "product_name",
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
      shop_candidates: {
        type: "array",
        description:
          "Items with a genuine, verifiable retailer discount (real was/RRP price vs current price, and you actively checked it's not cheaper elsewhere — same cheapest-price check as `deals`) but where you could NOT find independent resale evidence after real attempts. These get listed directly on Flipsta's own shop instead of discarded.",
        items: {
          type: "object",
          properties: {
            category_slug: { type: "string", enum: [...VALID_CATEGORY_SLUGS] },
            product_name: {
              type: "string",
              description: "The specific product's real name, as it appears on the source page — same bar as deals.product_name.",
            },
            description: {
              type: ["string", "null"],
              description: "A short, factual, customer-facing description built from what's actually on the page (key features, what's included) — null if the page didn't give you enough to write one honestly.",
            },
            image_url: {
              type: ["string", "null"],
              description: "A real product image URL for this exact item, if visible in the page content. null if you didn't see one.",
            },
            source_retailer: { type: "string" },
            source_url: { type: "string", description: "The real product/listing URL." },
            source_price_gbp: { type: "number", minimum: 0.01, description: "The current discounted price you'd actually pay at the retailer." },
            rrp_gbp: {
              type: "number",
              minimum: 0.01,
              description: "The retailer's own genuine RRP/was-price for this exact item, as shown on the page. Never invented or estimated — if the page doesn't show one, this item doesn't belong in shop_candidates at all.",
            },
            estimated_stock_units: { type: "integer", minimum: 1 },
            seasonal_event_name: {
              type: ["string", "null"],
              description:
                "Same as deals.seasonal_event_name — the exact matching seasonal event name from the prompt's 'SEASONAL PRIORITY' section if this product genuinely matches one, else null.",
            },
            sizes: {
              type: "array",
              items: { type: "string" },
              description:
                "Sizes actually shown as available on the source page for this exact product — UK shoe sizes (e.g. 'UK 7'), clothing sizes (e.g. 'M', 'UK 12'), etc. Read them off the page, don't invent a standard range. Empty array if this product has no size variants (electronics, homeware) or the page didn't show any.",
            },
          },
          required: ["category_slug", "product_name", "source_retailer", "source_url", "source_price_gbp", "rrp_gbp", "estimated_stock_units"],
        },
      },
    },
    required: ["deals", "shop_candidates"],
  },
};

// 26 Aug 2026, Steven: an admin-editable focus note and/or a currently-live
// seasonal event should actively steer what a run looks for, and recently
// found products should actively be avoided. Builds the extra prompt
// sections for whichever of those actually apply to this source — none of
// them add anything to the prompt when context is undefined/empty, so this
// stays a no-op for a run with no admin config set yet.
function buildContextSections(source: CuratedSource, context: DiscoveryContext | undefined): string {
  if (!context) return "";
  const sections: string[] = [];

  const focusNote = source.category !== "any" ? context.focusNotes[source.category] : undefined;
  if (focusNote) {
    sections.push(`ADMIN FOCUS NOTE for this category — an admin left this steering note, follow it as long as it doesn't conflict with the real-discount rules above: "${focusNote}"`);
  }

  // 26 Aug 2026, Steven: "leanr over time what sells well and not" —
  // computed automatically from real sell-through/win-rate data (see
  // discoverOpportunities.ts's loadDiscoveryContext), not set by a person.
  const performance = source.category !== "any" ? context.categoryPerformance[source.category] : undefined;
  if (performance) {
    sections.push(`RECENT PERFORMANCE for this category (computed from real Flipsta sales data, not an admin's opinion): ${performance.note}. Weight this like the admin focus note above — lean toward similar picks when it's been strong, be more selective when it's been weak, but never let it override the real-discount/margin/evidence rules.`);
  }

  const matchingEvents = context.seasonalGuidance.filter(
    (e) => source.category === "any" || e.categorySlugs.includes(source.category),
  );
  if (matchingEvents.length > 0) {
    const lines = matchingEvents.map((e) => `- "${e.name}" (search window ends ${e.searchEndsOn}) — actively favour genuine seasonal products for this if you see any on the page.`);
    sections.push(`SEASONAL PRIORITY — one or more seasonal events are currently active for this category:\n${lines.join("\n")}\nIf a product you report genuinely matches one of these, set seasonal_event_name to that event's exact name (character for character). This doesn't relax the real-discount/margin rules above — a seasonal item still needs a genuine discount and (for deals) real resale evidence.`);
  }

  if (context.recentProductNames.length > 0) {
    // Capped so the prompt doesn't balloon on a busy history — the most
    // recent ~40 names is plenty to steer away from near-term repeats
    // without meaningfully growing token cost.
    const recent = context.recentProductNames.slice(0, 40);
    sections.push(`ALREADY FOUND RECENTLY — Flipsta has sourced these products in roughly the last 30 days, don't report the same or a near-identical product again (a different colour/size of the exact same model still counts as the same product): ${recent.join("; ")}`);
  }

  return sections.length > 0 ? `\n\n${sections.join("\n\n")}` : "";
}

function buildPrompt(source: CuratedSource, context?: DiscoveryContext): string {
  const isGeneral = source.category === "any";
  const pageDescription = isGeneral
    ? `That's ${source.retailer}'s real, live deals page, selling across many categories at once — it'll show several products with a current price (may or may not show a "was" price on this kind of site) — that's your discount evidence where shown, already real, no need to re-verify it exists.`
    : `That's ${source.retailer}'s real, live "${source.category}" clearance/outlet page. It'll show several products with a current price and usually a was/RRP price right on the page — that's your discount evidence, already real, no need to re-verify it exists.`;
  const categoryInstruction = isGeneral
    ? `Pick whichever category_slug from this list actually fits each product you report: ${VALID_CATEGORY_SLUGS.join(", ")}.`
    : `category_slug should be "${source.category}".`;
  const resaleHint = source.category === "any" ? GENERAL_RESALE_EVIDENCE_HINT : RESALE_EVIDENCE_HINTS[source.category];
  const contextSections = buildContextSections(source, context);

  return `You're sourcing real resale opportunities for a UK reselling marketplace. The discovery step is already done for you — don't go searching for a clearance page, use this exact one:

FETCH THIS URL FIRST, using web_fetch: ${source.url}
${pageDescription}

From what you see there:
1. Pick 1-2 products with a genuine, clearly-marked discount and (if shown) in-stock availability. If the page looks thin on real content (some retailer sites don't render properly for a plain fetch), use web_search restricted to ${source.domain} instead, e.g. "site:${source.domain} clearance" — don't burn time on that fallback if the fetch worked.
2. For each one, use web_search to find real resale evidence — what the same or equivalent item is actually selling for right now. Good sources: ${resaleHint}.

ON RESALE EVIDENCE — a true "sold/completed" eBay listing is the gold standard, but it's genuinely often invisible to a plain web search (eBay's own sold-items filter isn't reliably exposed to automated tools — this is a known limitation, not something to burn your whole search budget chasing). If you can't find one after 2-3 real attempts, ONE current live listing (eBay, Vinted, or another marketplace) at a comparable price is an acceptable substitute — you don't need several. You always need at least one real URL, independent of the source retailer, backing a "deals" resale price — a single unrelated price on the SAME retailer site you're sourcing from doesn't count (not independent), and neither does inventing a plausible-sounding number with no real URL behind it.

TWO WAYS TO REPORT A GENUINE DISCOUNT, NOT ONE — don't just drop a candidate because independent resale evidence didn't turn up. If, after real attempts (2-3 searches), you still can't find any independent evidence of what the item resells for, but the retailer discount itself is real and verified (a real was/RRP price vs current price, right there on the page, and — same cheapest-price check as below — you've confirmed it's not available cheaper elsewhere right now), report it in shop_candidates instead of discarding it entirely: Flipsta lists items like this directly on its own shop, priced off the RRP, rather than needing an independent resale estimate. Only use "deals" when you DO have that independent resale evidence — reporting a candidate as a "deals" opportunity on the strength of the retailer's own "was £X" price alone, with no independent check, is never acceptable; retailers' own reference prices are sometimes inflated and aren't, on their own, evidence of resale value. And a candidate with no genuine, verifiable discount at all — not even a real RRP gap — doesn't belong in either array.

REAL FAILURE CASE, 26 Aug 2026 — a branded laptop sourced from a UK retailer's clearance page was reported as a margin opportunity on the strength of one eBay listing at a higher price. When Steven actually checked by hand, the retailer's clearance price turned out to be full retail (no real discount at all), AND eBay sellers were currently listing the same laptop for LESS than that "clearance" price. So: before reporting ANY candidate, actively check whether the item is available for the same price or cheaper somewhere else RIGHT NOW — search specifically for the cheapest current price (e.g. "[item name] cheapest price" or check 2-3 listings, not just the first one you find), not just evidence that a higher price also exists. A single live listing at a price that suits the story is not proof of the achievable resale value — a buyer always picks the cheapest genuine listing available, so that's the number that matters. If you find the item at or below your source price ANYWHERE (another retailer, a marketplace, a price-comparison site), that fully disqualifies the candidate — report zero, no matter how good the retailer's own discount claim looked. This check matters most for well-known branded electronics and other easily price-compared items, where a shopper can trivially find the true cheapest price in seconds — assume a savvy reseller would do that same check, and only report a candidate that would survive it.

THIS IS RETAIL ARBITRAGE, NOT COLLECTIBLE INVESTING. Profit comes from buying BELOW an item's normal price and reselling AT OR NEAR that normal price, soon (days to weeks) — not from it appreciating over months/years like a collector holding it. A £120 item with a ~£200+ normal price is a good candidate even if some tracker site says it "hasn't appreciated" — that phrase is about long-term collectible growth and is irrelevant here; never use it as a reason to drop a candidate, and never use it as your resale evidence. Check currency too — if a site shows USD or another non-GBP currency, convert explicitly or find a GBP source instead.${
    isGeneral
      ? `

COUNTERFEIT/REPLICA CHECK (this source specifically) — ${source.retailer} carries genuine branded items alongside generic/unbranded ones and, sometimes, unlicensed replicas of branded products (this is well documented for things like "LEGO-compatible" building sets, which are frequently unlicensed clones, not genuine LEGO). Never report a candidate where the product listing itself doesn't clearly claim to be the genuine branded item, and never resell-evidence a generic/clone product against a genuine brand's resale prices (e.g. don't price a "building block set" against real LEGO eBay sold prices unless the actual listing says LEGO). When genuinely unsure whether something is the real branded product, skip it rather than guess.`
      : ""
  }

SIZES — for footwear, clothing, or anything else that comes in sizes: if the page shows which sizes are currently available for a product, read them off and list them in shop_candidates' sizes field (e.g. ["UK 7", "UK 8", "UK 9"]). Don't invent a standard size range if the page doesn't actually show one — leave sizes empty in that case, and always leave it empty for products that don't come in sizes at all.

SELLING TECHNIQUE NOTES (from real retail-arbitrage/reselling practice, researched 26 Aug 2026, per Steven's ask to bring in real selling knowledge) — three habits worth applying on top of everything above: (1) EXACT MATCH DISCIPLINE — a retailer's clearance listing and the resale comp you check against must be the exact same product (model/size/colour/bundle), not just "close enough" — a near-miss match is worthless as evidence. (2) SUSTAINED DEMAND OVER A ONE-OFF SPIKE — when you have a choice between two otherwise-similar candidates, favour the one whose resale evidence looks like ongoing, steady demand (multiple recent comps over time) rather than a single isolated high sale that might not repeat. (3) PRICE IN THE REAL COST OF SELLING — a genuinely good buy price already has real headroom for marketplace fees (~10-13%), shipping, and the chance the resale estimate is a bit optimistic, not just a positive gap on paper; this is exactly why the 20% margin floor downstream of your report exists, so don't talk yourself into reporting something that only clears margin by a hair.${contextSections}

Report what you find with report_candidate_deals — ${categoryInstruction} Both deals and shop_candidates are required arrays; either or both can be empty. Empty is a completely fine outcome if nothing on the page genuinely clears a real discount; don't invent a candidate for either array to avoid reporting zero.`;
}

// 25-26 Aug 2026, Steven, while testing: a single run now tries multiple
// curated sources in sequence (starting from the normal 12h-rotation pick,
// then moving forward through the list) rather than giving up after just
// one page. The real stopping condition now comes from discoverOpportunities.ts
// via findCandidates's onBatch callback (see sourceAdapter.ts) — it stops
// the moment the caller says it has enough ACTUAL opportunities created
// (Steven, 26 Aug: "keep goint... until its got 1 oppotunity. then stop
// once its founfd one"), not just raw candidates reported. TARGET_CANDIDATES_PER_RUN
// below is only a fallback for a caller that doesn't pass onBatch at all.
// MAX_SOURCES_PER_RUN is always a hard safety cap either way — a run can
// never silently work through more than this many sources' full search
// budgets in one go, however far the real target is from being met.
//
// 26 Aug 2026: a real run tried all 5 (the cap at the time) and correctly
// found zero opportunities — every candidate it checked across Clarks,
// Currys, The Range, Boots, and Smyths turned out to already be priced at
// or near real resale value once actual market prices were checked, not a
// bug, just genuinely no margin that day. Steven, filling the dashboard
// for the first time: "keep goint to start with until its got 1
// oppotunity." Raised to all 10 curated sources so a run that comes up
// empty on the first few keeps going through the rest instead of
// stopping, since the whole curated list is still much cheaper than the
// old open-ended search approach either way.
const TARGET_CANDIDATES_PER_RUN = 3;
// Tied to CURATED_SOURCES.length rather than a hardcoded number — Steven
// wants a run to try the whole curated list before giving up, so as
// sources get added (Temu, 26 Aug) or removed, this stays "all of them"
// automatically instead of silently capping below the full list again.
const MAX_SOURCES_PER_RUN = CURATED_SOURCES.length;

async function discoverFromSource(source: CuratedSource, context?: DiscoveryContext): Promise<DiscoveryBatch> {
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
  // 26 Aug 2026, Steven: "tokens are burning way too fast." Trimmed from 14
  // — real runs almost always stop after the first source the moment one
  // opportunity clears verification (see onBatch/TARGET_OPPORTUNITIES_PER_RUN
  // in discoverOpportunities.ts), and a genuine resale-evidence search
  // rarely needs more than a handful of tries before either finding
  // evidence or correctly giving up. 8 keeps real headroom for a hard
  // search without paying for the old worst-case budget on every run. If
  // real runs start getting cut short mid-evidence-search, raise this back
  // up rather than guessing — check the logs' searches_used first.
  const WEB_SEARCH_MAX_USES = 8; // resale-evidence checks only now, not discovery — see file header
  const WEB_FETCH_MAX_USES = 4; // the curated page itself, plus room for a product page or a fallback fetch

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
    const prompt = buildPrompt(source, context);
    console.log(`[claudeSearchAdapter] Fetching from: ${source.retailer} (${source.category}) — ${source.url}`);
    let messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: prompt }];
    let response = await client.messages.stream({ model: "claude-sonnet-5", max_tokens: 24000, tools, messages }).finalMessage();

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
      response = await client.messages.stream({ model: "claude-sonnet-5", max_tokens: 24000, tools, messages }).finalMessage();
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

    // 26 Aug 2026: candidatesFound: 0 kept showing up with no way to tell
    // *why* — did the model genuinely decide nothing had a real margin, did
    // it report deals that then failed our own validation (bad price, no
    // URL, wrong category), or did it just never call the tool at all?
    // Those are three very different problems needing three different
    // fixes, but they all looked identical in the summary log line. The
    // 800-char text_preview above usually gets cut off mid-reasoning right
    // when the model explains its call — so on a zero-candidate outcome,
    // log the model's FULL final reasoning text (untruncated) plus exactly
    // what (if anything) it handed to report_candidate_deals, so the next
    // "found a real 71%-off deal but candidatesFound: 0" case is
    // diagnosable straight from the logs instead of guessing.
    const fullText = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join(" ");

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "report_candidate_deals",
    );
    const toolInput = toolUse?.input as { deals?: unknown[]; shop_candidates?: unknown[] } | undefined;
    const deals = toolInput?.deals;
    const shopCandidatesRaw = toolInput?.shop_candidates;
    if (!Array.isArray(deals) && !Array.isArray(shopCandidatesRaw)) {
      console.warn("[claudeSearchAdapter] No report_candidate_deals call in the response — treating as zero candidates this run.");
      console.warn(`[claudeSearchAdapter] Full reasoning text for this zero-candidate run: ${JSON.stringify(fullText)}`);
      return { deals: [], shopCandidates: [] };
    }

    const candidates: CandidateDeal[] = [];
    for (const raw of deals ?? []) {
      const d = raw as Record<string, unknown>;
      const categorySlug = typeof d.category_slug === "string" ? d.category_slug : "";
      if (!(VALID_CATEGORY_SLUGS as readonly string[]).includes(categorySlug)) {
        console.warn(`[claudeSearchAdapter] Dropped a reported deal — bad/missing category_slug: ${JSON.stringify(d)}`);
        continue;
      }

      const sourcePriceGBP = Number(d.source_price_gbp);
      const estimatedResalePriceGBP = Number(d.estimated_resale_price_gbp);
      if (!(sourcePriceGBP > 0) || !(estimatedResalePriceGBP > 0)) {
        console.warn(`[claudeSearchAdapter] Dropped a reported deal — invalid price(s): ${JSON.stringify(d)}`);
        continue;
      }
      if (typeof d.source_url !== "string" || !d.source_url) {
        console.warn(`[claudeSearchAdapter] Dropped a reported deal — missing source_url: ${JSON.stringify(d)}`);
        continue;
      }
      if (typeof d.product_name !== "string" || !d.product_name.trim()) {
        console.warn(`[claudeSearchAdapter] Dropped a reported deal — missing product_name: ${JSON.stringify(d)}`);
        continue;
      }

      // Not persisted (no DB column for it yet) but logged so an admin can
      // spot-check early real runs against what Claude actually found —
      // worth reading Render's worker logs for the first few live runs.
      if (typeof d.resale_evidence_url === "string" && d.resale_evidence_url) {
        console.log(`[claudeSearchAdapter] ${d.source_retailer ?? "?"} £${sourcePriceGBP} -> resale evidence: ${d.resale_evidence_url}`);
      }

      candidates.push({
        categorySlug,
        productName: d.product_name.trim(),
        imageUrl: typeof d.image_url === "string" && d.image_url ? d.image_url : null,
        sourceTier: typeof d.source_tier === "string" ? d.source_tier : "Web-sourced",
        sourceRetailer: typeof d.source_retailer === "string" ? d.source_retailer : "Unknown retailer",
        sourceUrl: d.source_url,
        sourcePriceGBP,
        estimatedResalePriceGBP,
        estimatedStockUnits: Math.max(1, Math.round(Number(d.estimated_stock_units) || 1)),
        perCustomerCap:
          typeof d.per_customer_cap === "number" && Number.isFinite(d.per_customer_cap) ? Math.round(d.per_customer_cap) : null,
        priceVolatility: Math.max(0, Math.min(1, Number(d.price_volatility) || 0.5)),
        seasonalEventName: typeof d.seasonal_event_name === "string" && d.seasonal_event_name.trim() ? d.seasonal_event_name.trim() : null,
      });
    }

    if (candidates.length === 0 && Array.isArray(deals) && deals.length > 0) {
      console.warn(
        `[claudeSearchAdapter] Model called report_candidate_deals with ${deals.length} deal(s), but none survived validation. Full reasoning text: ${JSON.stringify(fullText)}`,
      );
    }

    // shop_candidates: same real-info bar as deals (real product_name,
    // source_url, prices), but anchored on rrp_gbp instead of an
    // independent resale estimate — see sourceAdapter.ts's ShopCandidate
    // and shopPricing.ts for what happens to these downstream.
    const shopCandidates: ShopCandidate[] = [];
    for (const raw of shopCandidatesRaw ?? []) {
      const d = raw as Record<string, unknown>;
      const categorySlug = typeof d.category_slug === "string" ? d.category_slug : "";
      if (!(VALID_CATEGORY_SLUGS as readonly string[]).includes(categorySlug)) {
        console.warn(`[claudeSearchAdapter] Dropped a reported shop_candidate — bad/missing category_slug: ${JSON.stringify(d)}`);
        continue;
      }

      const sourcePriceGBP = Number(d.source_price_gbp);
      const rrpGBP = Number(d.rrp_gbp);
      if (!(sourcePriceGBP > 0) || !(rrpGBP > 0)) {
        console.warn(`[claudeSearchAdapter] Dropped a reported shop_candidate — invalid price(s): ${JSON.stringify(d)}`);
        continue;
      }
      if (rrpGBP <= sourcePriceGBP) {
        console.warn(`[claudeSearchAdapter] Dropped a reported shop_candidate — rrp_gbp not above source_price_gbp, no real discount: ${JSON.stringify(d)}`);
        continue;
      }
      if (typeof d.source_url !== "string" || !d.source_url) {
        console.warn(`[claudeSearchAdapter] Dropped a reported shop_candidate — missing source_url: ${JSON.stringify(d)}`);
        continue;
      }
      if (typeof d.product_name !== "string" || !d.product_name.trim()) {
        console.warn(`[claudeSearchAdapter] Dropped a reported shop_candidate — missing product_name: ${JSON.stringify(d)}`);
        continue;
      }

      shopCandidates.push({
        categorySlug,
        productName: d.product_name.trim(),
        description: typeof d.description === "string" && d.description.trim() ? d.description.trim() : null,
        imageUrl: typeof d.image_url === "string" && d.image_url ? d.image_url : null,
        sourceRetailer: typeof d.source_retailer === "string" ? d.source_retailer : "Unknown retailer",
        sourceUrl: d.source_url,
        sourcePriceGBP,
        rrpGBP,
        estimatedStockUnits: Math.max(1, Math.round(Number(d.estimated_stock_units) || 1)),
        seasonalEventName: typeof d.seasonal_event_name === "string" && d.seasonal_event_name.trim() ? d.seasonal_event_name.trim() : null,
        sizes: Array.isArray(d.sizes) ? d.sizes.filter((s): s is string => typeof s === "string" && Boolean(s.trim())).map((s) => s.trim()) : [],
      });
    }

    if (candidates.length === 0 && shopCandidates.length === 0 && ((deals?.length ?? 0) > 0 || (shopCandidatesRaw?.length ?? 0) > 0)) {
      console.warn(
        `[claudeSearchAdapter] Model reported ${deals?.length ?? 0} deal(s) and ${shopCandidatesRaw?.length ?? 0} shop_candidate(s), but none survived validation. Full reasoning text: ${JSON.stringify(fullText)}`,
      );
    }

    return { deals: candidates, shopCandidates };
}

export const claudeSearchAdapter: SourceAdapter = {
  name: "claude-search",
  async findCandidates(
    onBatch?: (batch: DiscoveryBatch) => Promise<boolean>,
    context?: DiscoveryContext,
  ): Promise<DiscoveryResult> {
    // 26 Aug 2026, Steven's admin-focus ask: a source whose category has
    // been paused from the admin dashboard is skipped entirely for this
    // run — no point spending search budget on a category an admin
    // deliberately turned off. "any"-category sources (Temu) are never
    // skipped this way since they aren't tied to one category. If pausing
    // would leave nothing to search at all (every real category paused),
    // fall back to the full list rather than running a dead adapter — that
    // combination is almost certainly a misconfiguration, not intent.
    const pausedSlugs = context?.pausedCategorySlugs ?? [];
    let activeSources = CURATED_SOURCES.filter((s) => s.category === "any" || !pausedSlugs.includes(s.category));
    if (activeSources.length === 0) {
      console.warn("[claudeSearchAdapter] Every curated category is paused — ignoring the pause for this run rather than searching nothing.");
      activeSources = CURATED_SOURCES;
    }

    // Starts at the normal 12h-rotation source, then walks forward through
    // activeSources (wrapping around) so repeated runs within the same 12h
    // window don't all hammer the exact same page — see
    // TARGET_CANDIDATES_PER_RUN / MAX_SOURCES_PER_RUN above.
    const startIndex = activeSources.indexOf(focusSourceForRun(activeSources));
    const allCandidates: CandidateDeal[] = [];
    const allShopCandidates: ShopCandidate[] = [];
    const maxSources = Math.min(MAX_SOURCES_PER_RUN, activeSources.length);
    let sourcesTried = 0;

    for (let i = 0; i < maxSources; i++) {
      const source = activeSources[(startIndex + i) % activeSources.length];
      sourcesTried++;
      console.log(
        `[claudeSearchAdapter] Source ${sourcesTried}/${maxSources}: ${source.retailer} (${source.category}) — ${source.url} — have ${allCandidates.length}/${TARGET_CANDIDATES_PER_RUN} deal candidates, ${allShopCandidates.length} shop candidates so far`,
      );
      const found = await discoverFromSource(source, context);
      allCandidates.push(...found.deals);
      allShopCandidates.push(...found.shopCandidates);

      // When the caller (discoverOpportunities.ts) hands us a real
      // verification callback, let IT decide when to stop — it knows
      // whether something has actually cleared the margin/confidence bar
      // and been created, which is the real "found 1" Steven means, not
      // just "the AI reported something." Without a callback (e.g. a
      // standalone test), fall back to the old raw-count heuristic — which,
      // same as onBatch, only ever counts deals; shop_candidates never
      // factor into the stop-early decision (see sourceAdapter.ts).
      if (onBatch) {
        const satisfied = await onBatch(found);
        if (satisfied) {
          console.log(`[claudeSearchAdapter] Caller signalled it has what it needs after source ${sourcesTried}/${MAX_SOURCES_PER_RUN} — stopping early.`);
          break;
        }
      } else if (allCandidates.length >= TARGET_CANDIDATES_PER_RUN) {
        break;
      }
    }

    console.log(
      `[claudeSearchAdapter] Run finished: ${allCandidates.length} deal candidate(s), ${allShopCandidates.length} shop candidate(s) from ${sourcesTried} source(s) (cap was ${maxSources} sources).`,
    );
    return { deals: allCandidates, shopCandidates: allShopCandidates };
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
    // 26 Aug 2026, Steven: "Also test Haiku on the re-verification step" —
    // this check is a narrow yes/no ("is this specific known URL still
    // live") not open-ended discovery, exactly the kind of task Haiku
    // handles fine at a fraction of Sonnet's cost ($1/$5 vs $2/$10 per
    // MTok). Discovery itself (discoverFromSource above) stays on Sonnet 5.
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
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
