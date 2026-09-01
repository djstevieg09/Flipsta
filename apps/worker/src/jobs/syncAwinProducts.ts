import { createDb } from "../db.js";
import { isAwinFeedConfigured, fetchConfiguredFeedProducts } from "../adapters/awinClient.js";

/**
 * 27 Aug 2026, Steven: "i need assistance setting up Awin api to fill my
 * store with goods... earn comission off items through affiliate
 * programs." Syncs every active `awin_sync_config` row (the admin-picked
 * pilot list — see api/admin/awin-sync/route.ts) into `affiliate_products`
 * (migration 0025). Deliberately a no-op, not an error, until
 * AWIN_FEED_URL is set — same pattern as discovery being skipped while
 * DISCOVERY_PAUSED is set.
 *
 * 1 Sept 2026, Steven — revised after the first real sync: there's no
 * per-advertiser feed lookup any more. Awin only gave us one working way
 * in ("Create a Feed", not the OAuth2-token-based list/download endpoint
 * this originally assumed — see awinClient.ts's comment for the full
 * story), so the whole shared feed is downloaded ONCE per tick and then
 * split by merchant_id in memory, rather than one network call per
 * advertiser. A merchant present in awin_sync_config but absent from the
 * downloaded feed (Steven forgot to add them on Awin's side, or Awin
 * hasn't regenerated the feed yet) is reported back as
 * advertisersMissingFromFeed instead of silently showing 0 — that's the
 * exact confusion that cost real debugging time the first time around.
 */
export async function syncAwinProducts() {
  if (!isAwinFeedConfigured()) {
    return { skipped: true, reason: "AWIN_FEED_URL not set" };
  }

  const db = createDb();
  const { data: activeConfigs } = await db
    .from("awin_sync_config")
    .select("advertiser_id, advertiser_name, category_id")
    .eq("active", true);

  if (!activeConfigs || activeConfigs.length === 0) {
    return { skipped: false, advertisersConfigured: 0, productsUpserted: 0 };
  }

  let products;
  try {
    products = await fetchConfiguredFeedProducts();
  } catch (err) {
    console.error("[syncAwinProducts] feed download failed:", (err as Error).message);
    return {
      skipped: false,
      advertisersConfigured: activeConfigs.length,
      advertisersFailed: activeConfigs.length,
      productsUpserted: 0,
      feedError: (err as Error).message,
    };
  }

  // categories fetched once, reused for every advertiser's best-effort
  // category-name match (see mapCategory below) rather than one query per
  // advertiser.
  const { data: categories } = await db.from("categories").select("id, name, slug");

  let productsUpserted = 0;
  let advertisersFailed = 0;
  const advertisersMissingFromFeed: string[] = [];

  for (const config of activeConfigs) {
    const merchantProducts = products.filter((p) => p.advertiserId === config.advertiser_id);
    if (merchantProducts.length === 0) {
      // Not an error — either Steven hasn't added this merchant into the
      // Awin-side feed yet, or Awin hasn't regenerated it. Flagged
      // separately from advertisersFailed so it's obvious in logs which
      // situation this is.
      advertisersMissingFromFeed.push(config.advertiser_name);
      continue;
    }

    try {
      const rows = merchantProducts.map((p) => ({
        network: "awin",
        advertiser_id: config.advertiser_id,
        advertiser_name: config.advertiser_name,
        external_product_id: p.externalProductId,
        title: p.title,
        description: p.description,
        image_url: p.imageUrl,
        category_id: mapCategory(p.categoryName, categories ?? []) ?? config.category_id ?? null,
        price_gbp: p.priceGBP,
        rrp_gbp: p.rrpGBP,
        in_stock: p.inStock,
        affiliate_url: p.affiliateUrl,
        last_synced_at: new Date().toISOString(),
      }));

      const { error } = await db.from("affiliate_products").upsert(rows, { onConflict: "network,advertiser_id,external_product_id" });
      if (error) {
        console.error(`[syncAwinProducts] upsert failed for advertiser ${config.advertiser_id}:`, error.message);
        advertisersFailed++;
        continue;
      }
      productsUpserted += rows.length;
    } catch (err) {
      console.error(`[syncAwinProducts] advertiser ${config.advertiser_id} (${config.advertiser_name}) failed:`, (err as Error).message);
      advertisersFailed++;
    }
  }

  return {
    skipped: false,
    advertisersConfigured: activeConfigs.length,
    advertisersFailed,
    advertisersMissingFromFeed,
    productsUpserted,
  };
}

/** Best-effort match of the feed's free-text category name onto one of Flipsta's own categories — falls back to the admin's configured default (or null) when nothing matches, rather than guessing wrong. */
function mapCategory(categoryName: string | undefined, categories: { id: string; name: string; slug: string }[]): string | null {
  if (!categoryName) return null;
  const normalized = categoryName.trim().toLowerCase();
  const match = categories.find((c) => c.name.toLowerCase() === normalized || normalized.includes(c.name.toLowerCase()));
  return match?.id ?? null;
}
