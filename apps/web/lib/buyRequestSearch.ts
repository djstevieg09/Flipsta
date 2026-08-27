import Anthropic from "@anthropic-ai/sdk";

/**
 * 26 Aug 2026, Steven's "Flipsta It!" feature: "Need a button that says
 * Flipsta It! that when pressed it then take the user to another page which
 * will ask for as much info as possible. like description and then ask for
 * a photo, give the user some google images to choose from... Then admin
 * click a button AI then goes out and finds the deal that is under what the
 * user is looking to pay." Two AI-backed pieces, both live in the web app
 * (not the worker) since they're triggered synchronously by a person
 * clicking a button, not on a schedule: findCandidatePhotos (shopper-facing,
 * while filling in the request) and searchForBuyRequest (admin-triggered,
 * after approval).
 *
 * Confirmed via a clarifying question: "AI finds candidate images" — no new
 * image-search API, reuses the same Claude web_search capability
 * claudeSearchAdapter.ts (apps/worker) already uses for deal discovery.
 * Same stub-until-configured pattern as everywhere else ANTHROPIC_API_KEY
 * gates a feature; see render.yaml for the env var this needs on
 * flipsta-web specifically (it's already set on flipsta-worker, but
 * Render env vars are per-service).
 *
 * Model choice: claude-sonnet-5 for both — same reasoning as tonight's cost
 * round in claudeSearchAdapter.ts (same quality tier as claude-sonnet-4-5,
 * ~33% cheaper). Both calls here are rare/user-triggered (not a scheduled
 * job hitting this repeatedly), so cost is a smaller concern than
 * discovery, but there's no reason to pay more for the same result.
 */
const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

export function isBuyRequestSearchConfigured(): boolean {
  return Boolean(client);
}

export type PhotoCandidate = {
  imageUrl: string;
  sourceUrl: string;
  label: string;
};

const FIND_PHOTOS_TOOL = {
  name: "report_photo_candidates",
  description: "Report real product photo URLs found for this item description.",
  input_schema: {
    type: "object" as const,
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            image_url: { type: "string", description: "A real, directly-loadable image URL for this product (an <img> src, an og:image, etc.) — never invented." },
            source_url: { type: "string", description: "The real page you found this image on." },
            label: { type: "string", description: "A short label for this photo, e.g. the retailer/site name or product variant, so the shopper can tell the options apart." },
          },
          required: ["image_url", "source_url", "label"],
        },
      },
    },
    required: ["candidates"],
  },
};

/**
 * Shopper-facing: while filling in a "Flipsta It!" request, they get a
 * handful of real candidate photos to pick from instead of having to find
 * and upload their own. Returns an empty array (never throws to the caller)
 * on any failure or when unconfigured — the request page treats that as
 * "no photo suggestions available, continue without one," never a hard
 * error that blocks submitting the request.
 */
export async function findCandidatePhotos(description: string): Promise<PhotoCandidate[]> {
  if (!client) return [];

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 4 },
        FIND_PHOTOS_TOOL,
      ],
      messages: [
        {
          role: "user",
          content: `A shopper is describing an item they want to buy: "${description}". Search the web for this product and find 3-5 real photo URLs of it (retailer listing photos, official product pages, etc.) so the shopper can pick the one that actually matches what they mean. Only report real image URLs you actually found via search — never invent one. If you can't find any genuine photos after a couple of real attempts, report an empty candidates array rather than guessing. Report your findings with report_photo_candidates.`,
        },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "report_photo_candidates",
    );
    const raw = (toolUse?.input as { candidates?: unknown[] } | undefined)?.candidates;
    if (!Array.isArray(raw)) return [];

    const candidates: PhotoCandidate[] = [];
    for (const item of raw) {
      const c = item as Record<string, unknown>;
      if (typeof c.image_url === "string" && c.image_url && typeof c.source_url === "string" && c.source_url) {
        candidates.push({
          imageUrl: c.image_url,
          sourceUrl: c.source_url,
          label: typeof c.label === "string" && c.label ? c.label : "Photo",
        });
      }
    }
    return candidates.slice(0, 5);
  } catch (err) {
    console.error("[buyRequestSearch] findCandidatePhotos failed:", err);
    return [];
  }
}

export type BuyRequestFound = {
  productName: string;
  sourceRetailer: string;
  sourceUrl: string;
  priceGBP: number;
  imageUrl: string | null;
};

const FOUND_ITEM_TOOL = {
  name: "report_found_item",
  description: "Report whether a real, currently-purchasable match for this specific request was found.",
  input_schema: {
    type: "object" as const,
    properties: {
      found: { type: "boolean" },
      product_name: { type: "string" },
      source_retailer: { type: "string" },
      source_url: { type: "string" },
      price_gbp: { type: "number", minimum: 0.01 },
      image_url: { type: ["string", "null"] },
      reason: { type: "string", description: "Brief note on why this does (or doesn't) match, for the admin reviewing it." },
    },
    required: ["found"],
  },
};

/**
 * Admin-triggered: after a "Flipsta It!" request is approved, an admin
 * clicks "Search now" and this looks for one real, currently-purchasable
 * match at or under the shopper's target price. Deliberately a single
 * attempt, not a retry loop — Steven: "for now just add the button and the
 * UI" (the eventual "keep watching and text the shopper when found" version
 * is a later round, not this one). Returns null on no match found, on any
 * API failure, or when unconfigured — the caller (the admin search route)
 * treats null as "not found" and records that plainly rather than guessing.
 */
export async function searchForBuyRequest(description: string, targetPriceGBP: number): Promise<BuyRequestFound | null> {
  if (!client) return null;

  try {
    const response = await client.messages
      .stream({
        model: "claude-sonnet-5",
        max_tokens: 4000,
        tools: [
          { type: "web_search_20250305", name: "web_search", max_uses: 8 },
          { type: "web_fetch_20250910", name: "web_fetch", max_uses: 4, max_content_tokens: 30000 },
          FOUND_ITEM_TOOL,
        ],
        messages: [
          {
            role: "user",
            content: `A Flipsta shopper wants this specific item: "${description}", at or under £${targetPriceGBP.toFixed(2)} including whatever the retailer charges (don't assume free shipping unless the listing says so).

Search the web for a real, currently in-stock, purchasable listing that genuinely matches the description at or under that price. Prefer a well-known UK retailer or a reputable marketplace listing over an obscure or unverifiable one. Check the price is real and current — don't rely on a stale cached price. If you find more than one match, report the cheapest genuinely available one.

If nothing at or under £${targetPriceGBP.toFixed(2)} genuinely matches after real search attempts, report found: false rather than stretching the description or the price to make something fit. Report your finding with report_found_item.`,
          },
        ],
      })
      .finalMessage();

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "report_found_item",
    );
    const input = toolUse?.input as
      | {
          found?: unknown;
          product_name?: unknown;
          source_retailer?: unknown;
          source_url?: unknown;
          price_gbp?: unknown;
          image_url?: unknown;
        }
      | undefined;
    if (!input || input.found !== true) return null;

    const priceGBP = Number(input.price_gbp);
    if (!(priceGBP > 0) || priceGBP > targetPriceGBP) {
      console.warn("[buyRequestSearch] Model reported found:true but price was missing or over budget — treating as not found.", input);
      return null;
    }
    if (typeof input.source_url !== "string" || !input.source_url || typeof input.product_name !== "string" || !input.product_name.trim()) {
      console.warn("[buyRequestSearch] Model reported found:true but missing source_url/product_name — treating as not found.", input);
      return null;
    }

    return {
      productName: input.product_name.trim(),
      sourceRetailer: typeof input.source_retailer === "string" && input.source_retailer ? input.source_retailer : "Unknown retailer",
      sourceUrl: input.source_url,
      priceGBP,
      imageUrl: typeof input.image_url === "string" && input.image_url ? input.image_url : null,
    };
  } catch (err) {
    console.error("[buyRequestSearch] searchForBuyRequest failed:", err);
    return null;
  }
}
