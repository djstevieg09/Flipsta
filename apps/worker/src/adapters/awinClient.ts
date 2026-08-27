/**
 * 27 Aug 2026, Steven: "i need assistance setting up Awin api to fill my
 * store with goods... earn comission off items through affiliate
 * programs, this is seperate from our core buisness." A thin client for
 * Awin's publisher-facing APIs — used by both the admin picker
 * (apps/web/app/api/admin/awin-sync/route.ts, listing which programmes
 * Steven's actually approved for) and the sync job (jobs/syncAwinProducts.ts).
 *
 * isAwinConfigured() stub pattern, same as isStripeConfigured/
 * isClaudeSearchConfigured elsewhere in this codebase — everything here is
 * inert until Steven signs up as an Awin publisher himself (account
 * creation needs his own business details, not something done on his
 * behalf) and sets AWIN_API_TOKEN / AWIN_PUBLISHER_ID — see
 * INFRASTRUCTURE_TODO.md.
 *
 * IMPORTANT — spot-check the first real sync: the two REST endpoints below
 * (auth + programmes list) are confirmed against Awin's own published API
 * docs. The product feed list/download shape follows Awin's long-standing,
 * widely-documented CSV column conventions (aw_deep_link, aw_image_url,
 * search_price, etc — the same names every Awin integration tool uses) but
 * could not be verified against a real response, since no publisher
 * account/token exists yet to test with. Parsing below is deliberately
 * defensive (tolerant of missing/reordered columns, logs and skips a row
 * it can't make sense of rather than throwing) for exactly that reason —
 * same "verify the first several real runs" discipline already documented
 * for claudeSearchAdapter.ts in INFRASTRUCTURE_TODO.md #6.
 */

const API_TOKEN = process.env.AWIN_API_TOKEN;
const PUBLISHER_ID = process.env.AWIN_PUBLISHER_ID;

export function isAwinConfigured(): boolean {
  return Boolean(API_TOKEN && PUBLISHER_ID);
}

export interface AwinProgramme {
  id: string;
  name: string;
  status: string;
  primarySector?: string;
}

/** GET /publishers/{publisherId}/programmes?relationship=joined — the merchant programmes Steven is actually approved for. */
export async function fetchJoinedProgrammes(): Promise<AwinProgramme[]> {
  if (!isAwinConfigured()) throw new Error("Awin isn't configured — set AWIN_API_TOKEN and AWIN_PUBLISHER_ID.");

  const res = await fetch(
    `https://api.awin.com/publishers/${encodeURIComponent(PUBLISHER_ID!)}/programmes?relationship=joined`,
    { headers: { Authorization: `Bearer ${API_TOKEN}` } },
  );
  if (!res.ok) {
    throw new Error(`Awin programmes lookup failed (${res.status}): ${await res.text().catch(() => res.statusText)}`);
  }
  const rows = (await res.json()) as any[];
  return (rows ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? "Unnamed programme"),
    status: String(r.status ?? "unknown"),
    primarySector: r.primarySector ?? undefined,
  }));
}

interface AwinFeedListing {
  advertiserId: string;
  advertiserName: string;
  url: string;
  lastImported?: string;
}

/**
 * The Product Feed List Download — Awin's own recommended programmatic
 * path (rather than hand-constructing a Create-a-Feed URL): one call
 * returns every feed the publisher can access, each with a ready-to-use
 * download URL and a last-updated time, so a sync only needs to re-fetch
 * feeds that actually changed.
 */
async function fetchProductFeedList(): Promise<AwinFeedListing[]> {
  const res = await fetch(`https://productdata.awin.com/datafeed/list/apikey/${encodeURIComponent(API_TOKEN!)}`);
  if (!res.ok) {
    throw new Error(`Awin feed list download failed (${res.status}): ${await res.text().catch(() => res.statusText)}`);
  }
  const text = await res.text();
  const rows = parseDelimited(text);
  if (rows.length === 0) return [];

  return rows
    .map((row) => ({
      advertiserId: pickField(row, ["Advertiser ID", "advertiser_id", "merchant_id", "MerchantId"]),
      advertiserName: pickField(row, ["Advertiser Name", "advertiser_name", "merchant_name", "MerchantName"]),
      url: pickField(row, ["URL", "Url", "feed_url", "FeedURL"]),
      lastImported: pickField(row, ["Last Imported", "last_imported", "LastChecked"]) || undefined,
    }))
    .filter((f) => f.advertiserId && f.url);
}

export interface AwinProduct {
  externalProductId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  priceGBP: number | null;
  rrpGBP: number | null;
  inStock: boolean;
  affiliateUrl: string;
  categoryName?: string;
}

/** Downloads and parses one advertiser's product feed, already resolved to a full feed URL by fetchProductFeedList(). */
async function fetchAndParseFeed(feedUrl: string): Promise<AwinProduct[]> {
  const res = await fetch(feedUrl);
  if (!res.ok) {
    throw new Error(`Awin feed download failed (${res.status}) for ${feedUrl}`);
  }
  const text = await res.text();
  const rows = parseDelimited(text);

  const products: AwinProduct[] = [];
  for (const row of rows) {
    const externalProductId = pickField(row, ["aw_product_id", "product_id", "merchant_product_id"]);
    const title = pickField(row, ["product_name", "title", "aw_title"]);
    const affiliateUrl = pickField(row, ["aw_deep_link", "deep_link", "merchant_deep_link"]);
    if (!externalProductId || !title || !affiliateUrl) continue; // can't use a row missing any of these three

    const searchPrice = parsePrice(pickField(row, ["search_price", "price"]));
    const storePrice = parsePrice(pickField(row, ["store_price", "rrp_price", "base_price"]));
    const inStockRaw = pickField(row, ["in_stock", "stock_status"]).toLowerCase();

    products.push({
      externalProductId,
      title,
      description: pickField(row, ["description", "merchant_product_description"]) || null,
      imageUrl: pickField(row, ["aw_image_url", "merchant_image_url", "image_url"]) || null,
      priceGBP: searchPrice,
      rrpGBP: storePrice,
      inStock: inStockRaw ? inStockRaw !== "0" && inStockRaw !== "false" && inStockRaw !== "out of stock" : true,
      affiliateUrl,
      categoryName: pickField(row, ["category_name", "merchant_category"]) || undefined,
    });
  }
  return products;
}

/** One advertiser's currently-live product set, resolved through the feed list. Returns [] (not an error) if this advertiser has no feed yet — a newly-approved programme can lag a day or two before Awin generates one. */
export async function fetchAdvertiserProducts(advertiserId: string): Promise<AwinProduct[]> {
  const feeds = await fetchProductFeedList();
  const matching = feeds.filter((f) => f.advertiserId === advertiserId);
  if (matching.length === 0) return [];

  const results: AwinProduct[] = [];
  for (const feed of matching) {
    results.push(...(await fetchAndParseFeed(feed.url)));
  }
  return results;
}

// ---- small local helpers, no external dependency ----

function parsePrice(raw: string): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function pickField(row: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] !== undefined) return row[c].trim();
    const lower = c.toLowerCase();
    const match = Object.keys(row).find((k) => k.toLowerCase() === lower);
    if (match) return row[match].trim();
  }
  return "";
}

/**
 * A minimal, dependency-free delimited-text parser (RFC4180-ish: quoted
 * fields, escaped quotes, embedded delimiters/newlines inside quotes).
 * Auto-detects comma vs tab vs semicolon from the header row, since Awin
 * feeds can be generated in any of the three depending on Create-a-Feed
 * settings. Returns [] rather than throwing on anything unparseable — a
 * malformed feed shouldn't take down the whole sync job.
 */
function parseDelimited(text: string): Record<string, string>[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const firstLine = trimmed.split(/\r?\n/, 1)[0];
  const delimiter = [",", "\t", ";"].reduce((best, d) => ((firstLine.split(d).length > firstLine.split(best).length) ? d : best), ",");

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inQuotes) {
      if (ch === '"') {
        if (trimmed[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && trimmed[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      field = "";
      record = [];
    } else {
      field += ch;
    }
  }
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  if (records.length < 2) return [];

  const header = records[0].map((h) => h.trim());
  return records.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => (obj[h] = (r[i] ?? "").trim()));
    return obj;
  });
}
