import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { groupShopItemsByProduct } from "@/lib/shopItemGrouping";

export const dynamic = "force-dynamic";

const MAX_RESULTS = 8;

const PUBLIC_SHOP_ITEM_COLUMNS =
  "id, category_id, product_name, description, image_url, rrp_gbp, our_price_gbp, created_at, size, categories(name)";

type Row = {
  id: string;
  category_id: string;
  product_name: string;
  description: string | null;
  image_url: string | null;
  rrp_gbp: number;
  our_price_gbp: number;
  created_at: string;
  size: string | null;
  categories: { name: string } | { name: string }[] | null;
};

/**
 * GET /api/recommendations — 27 Aug 2026, the one candidate from the
 * conversion/retention research (see claude/deployment-checklist.md's #-5
 * section) not picked in the follow-up scoping round, built as its own
 * follow-on: "recommending items based on a shopper's own sizing profile /
 * past purchases."
 *
 * Deliberately returns an empty list rather than any kind of generic
 * "trending now" fallback when there's no real personalization signal —
 * signed out, or signed in with no purchase history and no shopper
 * profile sizes set. Same discipline as the rest of this round's
 * engagement work (real low-stock counts, real wishlist/size matches for
 * deal-drop emails): a "Recommended for you" section that isn't actually
 * personalised would be exactly the kind of invented signal the CMA/ICO
 * dark-patterns research warned against — better to show nothing than to
 * show something misleadingly labelled.
 *
 * Two real signals, scored and combined rather than either alone:
 * - Category history: categories the shopper has actually bought from
 *   before, across all three purchase surfaces (shop_items, won
 *   opportunities, peer-marketplace orders).
 * - Saved sizes: any non-blank size on one of their shopper_profiles
 *   (migration 0018) — the same data /shop's "who are you shopping for"
 *   switch already uses.
 * Scored in application code rather than a SQL query — the candidate pool
 * (available shop_items with a photo) is small at Flipsta's current scale,
 * same reasoning notifyDealMatches.ts uses for its own in-memory matching.
 */
export async function GET() {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ items: [] });

  const supabase = await createSupabaseServerClient();

  const [{ data: shopPurchases }, { data: wonOpportunities }, { data: ordersAsBuyer }, { data: shopperProfiles }] =
    await Promise.all([
      supabase.from("shop_items").select("category_id").eq("buyer_id", auth.userId),
      supabase.from("opportunities").select("category_id").eq("won_by", auth.userId),
      supabase.from("orders").select("listings(products(category_id))").eq("buyer_id", auth.userId),
      supabase
        .from("shopper_profiles")
        .select("shoe_size_uk, top_size, bottom_size, kids_shoe_size_uk, kids_clothing_size")
        .eq("profile_id", auth.userId),
    ]);

  const categoryIds = new Set<string>();
  for (const p of shopPurchases ?? []) if (p.category_id) categoryIds.add(p.category_id);
  for (const o of wonOpportunities ?? []) if (o.category_id) categoryIds.add(o.category_id);
  type NestedProduct = { category_id: string } | { category_id: string }[] | null | undefined;
  type NestedListing = { products: NestedProduct } | { products: NestedProduct }[] | null | undefined;
  for (const o of (ordersAsBuyer ?? []) as { listings: NestedListing }[]) {
    const listing = Array.isArray(o.listings) ? o.listings[0] : o.listings;
    const productField = listing?.products;
    const product = Array.isArray(productField) ? productField[0] : productField;
    if (product?.category_id) categoryIds.add(product.category_id);
  }

  const sizes = new Set<string>();
  for (const p of shopperProfiles ?? []) {
    for (const s of [p.shoe_size_uk, p.top_size, p.bottom_size, p.kids_shoe_size_uk, p.kids_clothing_size]) {
      if (s) sizes.add(s);
    }
  }

  if (categoryIds.size === 0 && sizes.size === 0) return NextResponse.json({ items: [] });

  const { data: candidates, error } = await supabase
    .from("shop_items")
    .select(PUBLIC_SHOP_ITEM_COLUMNS)
    .eq("status", "available")
    .not("image_url", "is", null)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Scored = Row & { score: number; matchReasons: string[] };
  const scored: Scored[] = [];
  for (const row of (candidates ?? []) as Row[]) {
    const matchReasons: string[] = [];
    let score = 0;
    if (categoryIds.has(row.category_id)) {
      score += 2;
      matchReasons.push("similar to items you've bought before");
    }
    if (row.size && sizes.has(row.size)) {
      score += 1;
      matchReasons.push(`matches your saved size (${row.size})`);
    }
    if (score > 0) scored.push({ ...row, score, matchReasons });
  }

  scored.sort((a, b) => b.score - a.score || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const top = scored.slice(0, MAX_RESULTS);

  return NextResponse.json({ items: groupShopItemsByProduct(top) });
}
