/**
 * 26 Aug 2026, Steven: "i want a switch on the main shopping window to ask
 * who are you shopping for and then it will show items in their size."
 * Shared by GET /api/shop-items and GET /api/products — both read a
 * ?sizes= query param (comma-separated, from the selected shopper
 * profile's non-blank size fields — see ShopperSwitch.tsx) and apply the
 * same rule: an item with no size tag ALWAYS shows (products/shop_items
 * don't get size data from the AI yet — see migration 0018 — so treating
 * "no size set" as "hide it" would empty the store), an item WITH a size
 * tag only shows if it matches one of the requested sizes.
 */
export function parseSizesParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    // Keep the PostgREST .or() filter string this builds well-formed —
    // these are short size labels a user typed ("M", "8", "5-6 years"),
    // not free text, so stripping punctuation that could break the filter
    // syntax costs nothing real.
    .map((s) => s.replace(/[,"()]/g, ""))
    .filter(Boolean);
}

/** Builds the PostgREST .or() filter string: size IS NULL OR size matches one of the given values (case-insensitive). */
export function sizeOrFilter(sizes: string[]): string {
  const clauses = ["size.is.null", ...sizes.map((s) => `size.ilike.${s}`)];
  return clauses.join(",");
}
