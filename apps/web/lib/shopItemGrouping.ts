/**
 * 26 Aug 2026: each shop_items row is one physical unit (see migration
 * 0013's comment), so a product with several units in stock comes back as
 * several rows — this groups them into one card per (product_name,
 * our_price_gbp) with a real unitsAvailable count and every row id
 * (itemIds), so the basket can request N distinct units without a second
 * round-trip. Originally inline in GET /api/shop-items; pulled out here
 * 27 Aug 2026 so GET /api/recommendations (same shop_items shape, a
 * different filter/sort in front of it) doesn't have to duplicate it.
 */
export function groupShopItemsByProduct<T extends { id: string; product_name: string; our_price_gbp: number }>(
  rows: T[],
): (T & { unitsAvailable: number; itemIds: string[] })[] {
  const groups = new Map<string, T & { unitsAvailable: number; itemIds: string[] }>();
  for (const row of rows) {
    const key = `${row.product_name}|${row.our_price_gbp}`;
    const existing = groups.get(key);
    if (existing) {
      existing.unitsAvailable++;
      existing.itemIds.push(row.id);
    } else {
      groups.set(key, { ...row, unitsAvailable: 1, itemIds: [row.id] });
    }
  }
  return Array.from(groups.values());
}
