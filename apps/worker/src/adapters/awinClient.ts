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
 * 1 Sept 2026, Steven — REVISED after the first real sync attempt failed:
 * the original assumption below (that the OAuth2 token from
 * ui.awin.com/awin-api could also list every approved advertiser's product
 * feed via productdata.awin.com/datafeed/list/apikey/{OAUTH2_TOKEN}) was
 * wrong. That endpoint kept 500ing. What actually works is Awin's older,
 * separate "Create a Feed" tool (in Awin's UI: Tools -> Create a Feed ->
 * "Configure an advertiser-based feed") — Steven manually adds whichever
 * merchants he wants synced to ONE feed there, and Awin hands back a single
 * download URL with its own distinct API key baked in (nothing to do with
 * the OAuth2 token). That URL is what AWIN_FEED_URL below is. Confirmed
 * against Steven's real account: it's a gzip-compressed CSV
 * (compression/gzip in the URL) whose header/columns exactly match what
 * was originally guessed here (aw_deep_link, search_price, merchant_id,
 * etc) — so the column-parsing logic itself was right, only the discovery
 * mechanism was wrong.
 *
 * Two-step process any time Steven wants to add or remove a synced
 * merchant:
 *   1. In Awin's own "Create a Feed" tool, add/remove the merchant from
 *      that same feed configuration (the feed URL/key stays the same —
 *      only which merchants' rows come back in the download changes).
 *   2. In Flipsta's own /admin/partner-deals, add/remove that merchant
 *      from the pilot list (awin_sync_config) so the sync job knows to
 *      keep (or filter out) that merchant's rows from the shared feed.
 * Forgetting step 1 shows up in the worker logs as
 * `advertisersMissingFromFeed` — a merchant Flipsta is watching for that
 * never showed up in the downloaded feed, rather than a silent 0.
 *
 * 1 Sept 2026, Steven — a second feed URL, same day: Awin's "Create a
 * Feed" tool refuses to combine advertisers of different "datafeed
 * formats" into one feed ("You can only select advertisers that use the
 * same datafeed format") — MALOA (UK) is on what Awin calls an "Enhanced"
 * feed (their term for a merchant that supplies Awin their catalogue in
 * Google Shopping feed format), while Al Jazeera Perfumes/Modmo are on
 * the standard "Legacy" Awin format. Steven has to build a SECOND,
 * separate feed in Awin's tool for Enhanced-format merchants, with its
 * own distinct download URL — hence `AWIN_FEED_URL_2` below, optional,
 * fetched and merged in with the first. Both feeds are parsed with the
 * exact same column logic — the `columns=...` list in each feed's URL is
 * something Steven picks himself in Awin's tool and should normalise
 * either advertiser format into the same output columns, but this is
 * unverified for a real Enhanced-format feed the way the first one was
 * verified against Al Jazeera's real data — spot-check the worker logs
 * once MALOA is wired in the same way.
 */

import { gunzipSync } from "node:zlib";

const API_TOKEN = process.env.AWIN_API_TOKEN;
const PUBLISHER_ID = process.env.AWIN_PUBLISHER_ID;
const FEED_URLS = [process.env.AWIN_FEED_URL, process.env.AWIN_FEED_URL_2].filter(
  (u): u is string => Boolean(u),
);

/** Governs the admin programme-picker (OAuth2 Publisher API — separate system from the feed download below). */
export function isAwinConfigured(): boolean {
  return Boolean(API_TOKEN && PUBLISHER_ID);
}

/** Governs the actual product sync — needs at least one feed URL Steven builds himself in Awin's "Create a Feed" tool. */
export function isAwinFeedConfigured(): boolean {
  return FEED_URLS.length > 0;
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

export interface AwinProduct {
  externalProductId: string;
  /** Awin's merchant_id — matched against awin_sync_config.advertiser_id to decide which merchants' rows to keep. */
  advertiserId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  priceGBP: number | null;
  rrpGBP: number | null;
  inStock: boolean;
  affiliateUrl: string;
  categoryName?: string;
}

/**
 * Downloads and parses every configured feed URL (AWIN_FEED_URL, plus the
 * optional AWIN_FEED_URL_2 for a second, differently-formatted feed — see
 * the file-level comment above), merging every merchant's rows found
 * across all of them. The caller (syncAwinProducts.ts) filters down to
 * whichever merchants are actually active in awin_sync_config, so
 * removing a merchant from the pilot list doesn't require touching the
 * Awin-side feed at all. One feed URL failing doesn't lose the other's
 * products — each is fetched independently, and `feedErrors` reports
 * which (if any) failed so the caller can log it without losing the rest.
 */
export async function fetchConfiguredFeedProducts(): Promise<{ products: AwinProduct[]; feedErrors: string[] }> {
  if (!isAwinFeedConfigured()) throw new Error("Awin product feed isn't configured — set AWIN_FEED_URL.");

  const results = await Promise.allSettled(FEED_URLS.map((url) => fetchAndParseOneFeed(url)));

  const products: AwinProduct[] = [];
  const feedErrors: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      products.push(...result.value);
    } else {
      feedErrors.push(`feed #${i + 1}: ${(result.reason as Error).message}`);
    }
  });

  if (products.length === 0 && feedErrors.length === FEED_URLS.length) {
    // Every configured feed failed outright — surface as a real error
    // rather than a quiet empty result, same as the single-feed behaviour
    // this replaced.
    throw new Error(feedErrors.join("; "));
  }

  return { products, feedErrors };
}

async function fetchAndParseOneFeed(url: string): Promise<AwinProduct[]> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Awin feed download failed (${res.status}): ${await res.text().catch(() => res.statusText)}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  // The feed URL requests gzip compression explicitly (compression/gzip),
  // but that's Awin packaging the file itself as gzip, not an HTTP
  // Content-Encoding — fetch won't auto-decompress it. Detect the gzip
  // magic bytes ourselves rather than trusting a header, since a future
  // feed URL built without compression/gzip would come back as plain text.
  let text = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
    ? gunzipSync(bytes).toString("utf-8")
    : bytes.toString("utf-8");
  // 1 Sept 2026 — the Enhanced/Google-format single-advertiser download
  // (MALOA's real file) starts with a UTF-8 BOM directly glued onto the
  // first header cell ("﻿advertiser_id"), which silently broke every
  // exact/case-insensitive column match below until this was stripped —
  // confirmed by inspecting the real downloaded bytes. The first Legacy
  // feed didn't have one, but stripping it unconditionally is harmless
  // either way.
  text = text.replace(/^\uFEFF/, "");

  const rows = parseDelimited(text);
  const products: AwinProduct[] = [];
  for (const row of rows) {
    // Candidate lists cover both feed formats Steven's account actually
    // uses: Awin's own "Legacy" column names, and the "Enhanced"/Google
    // Shopping format (advertiser_id/id/link/image_link/availability/
    // google_product_category) confirmed 1 Sept 2026 against MALOA's real
    // downloaded file — not guessed from Google's public spec alone.
    const externalProductId = pickField(row, ["aw_product_id", "product_id", "merchant_product_id", "id"]);
    const advertiserId = pickField(row, ["merchant_id", "advertiser_id", "merchantId"]);
    const title = pickField(row, ["product_name", "title", "aw_title"]);
    const affiliateUrl = pickField(row, ["aw_deep_link", "deep_link", "merchant_deep_link"]);
    if (!externalProductId || !advertiserId || !title || !affiliateUrl) continue; // can't use a row missing any of these four — deliberately NOT falling back to a plain (untracked) product URL (e.g. Google format's own "link" field) here, since that would silently ship a link Flipsta earns no commission on

    const searchPrice = parsePrice(pickField(row, ["search_price", "price"]));
    const storePrice = parsePrice(pickField(row, ["store_price", "rrp_price", "base_price"]));
    // Google format has no direct "was price" field of its own — its
    // `sale_price` is the opposite direction (a discount off `price`), not
    // a higher original price, so it's deliberately not treated as rrp.
    const stockRaw = pickField(row, ["stock_status", "in_stock", "availability"]).toLowerCase();

    products.push({
      externalProductId,
      advertiserId,
      title,
      description: pickField(row, ["description", "merchant_product_description"]) || null,
      imageUrl: pickField(row, ["aw_image_url", "merchant_image_url", "image_url", "image_link"]) || null,
      priceGBP: searchPrice,
      rrpGBP: storePrice,
      inStock: stockRaw ? stockRaw !== "0" && stockRaw !== "false" && stockRaw !== "out_of_stock" && stockRaw !== "out of stock" : true,
      affiliateUrl,
      categoryName: pickField(row, ["category_name", "merchant_category", "google_product_category"]) || undefined,
    });
  }
  return products;
}

// ---- small local helpers, no external dependency ----

function parsePrice(raw: string): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * Returns the first candidate field with an actual (non-empty) value,
 * rather than stopping at the first candidate whose column merely exists
 * in the header — Awin's real feed has plenty of columns present but
 * blank (e.g. an empty `in_stock` column sitting alongside a populated
 * `stock_status` one), and stopping on "exists" rather than "has a value"
 * silently loses the real data behind it.
 */
function pickField(row: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== "") return row[c].trim();
    const lower = c.toLowerCase();
    const match = Object.keys(row).find((k) => k.toLowerCase() === lower);
    if (match && row[match] !== "") return row[match].trim();
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
