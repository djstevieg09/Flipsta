import { createDb } from "../db.js";
import { isAwinConfigured, fetchAdvertiserProducts } from "../adapters/awinClient.js";

/**
 * 27 Aug 2026, Steven: "i need assistance setting up Awin api to fill my
 * store with goods... earn comission off items through affiliate
 * programs." Syncs every active `awin_sync_config` row (the admin-picked
 * pilot list — see api/admin/awin-sync/route.ts) into `affiliate_products`
 * (migration 0025). Deliberately a no-op, not an error, until Steven has
 * actually set AWIN_API_TOKEN/AWIN_PUBLISHER_ID — same pattern as
 * discovery being skipped while DISCOVERY_PAUSED is set.
 *
 * One advertiser's feed failing (a transient Awin outage, a programme with
 * no feed generated yet) shouldn't block every other advertiser's sync in
 * the same run — each is wrapped individually so a bad one is logged and
 * skipped rather than aborting the whole tick.
 */
export async function syncAwinProducts() {
  if (!isAwinConfigured()) {
    return { skipped: true, reason: "AWIN_API_TOKEN/AWIN_PUBLISHER_ID not set" };
  }

  const db = createDb();
  const { data: activeConfigs } = await db
    .from("awin_sync_config")
    .select("advertiser_id, advertiser_name, category_id")
    .eq("active", true);

  if (!activeConfigs || activeConfigs.length === 0) {
    return { skipped: false, advertisersConfigured: 0, productsUpserted: 0 };
  }

  // categories fetched once, reused for every advertiser's best-effort
  // category-name match (see mapCategory below) rather than one query per
  // advertiser.
  const { data: categories } = await db.from("categories").select("id, name, slug");

  let productsUpserted = 0;
  let advertisersFailed = 0;

  for (const config of activeConfigs) {
    try {
      const products = await fetchAdvertiserProducts(config.advertiser_id);
      if (products.length === 0) continue;

      const rows = products.map((p) => ({
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

  return { skipped: false, advertisersConfigured: activeConfigs.length, advertisersFailed, productsUpserted };
}

/** Best-effort match of the feed's free-text category name onto one of Flipsta's own categories — falls back to the admin's configured default (or null) when nothing matches, rather than guessing wrong. */
function mapCategory(categoryName: string | undefined, categories: { id: string; name: string; slug: string }[]): string | null {
  if (!categoryName) return null;
  const normalized = categoryName.trim().toLowerCase();
  const match = categories.find((c) => c.name.toLowerCase() === normalized || normalized.includes(c.name.toLowerCase()));
  return match?.id ?? null;
}
