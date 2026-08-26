import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseSizesParam, sizeOrFilter } from "@/lib/sizeFilter";

// Force-dynamic: every route here reads live application data (bids, wallet
// balances, opportunities, order status) straight from Supabase. Without this,
// Next.js's App Router can cache a GET route's first response (including the
// fetch calls a library like supabase-js makes under the hood) and keep
// serving that same stale response indefinitely, even after the database
// changes underneath it — exactly what caused real, freshly-discovered
// opportunities to not show up on /opportunities on 25 Aug 2026.
export const dynamic = "force-dynamic";

/**
 * GET /api/products — catalogue with each product's pooled lowest ask
 * (Section 11.4). ?category=slug filters to one category, matching
 * /api/shop-items so /shop can use the same query param for both sections.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();

  const categorySlug = req.nextUrl.searchParams.get("category");
  let categoryId: string | null = null;
  if (categorySlug) {
    const { data: category } = await supabase.from("categories").select("id").eq("slug", categorySlug).maybeSingle();
    if (!category) return NextResponse.json({ products: [] });
    categoryId = category.id;
  }

  let query = supabase
    .from("products")
    // listings.id added 26 Aug 2026 for the basket — "Add to basket" needs a
    // specific listingId to hand to POST /api/orders later (each listing is
    // a distinct seller's ask, unlike shop_items' grouped-by-product rows).
    .select("id, title, condition, description, image_url, category_id, categories(name), listings(id, price_gbp, sold_at), size");
  if (categoryId) query = query.eq("category_id", categoryId);

  // 26 Aug 2026: "who are you shopping for" — see lib/sizeFilter.ts for why
  // an unset size always passes rather than getting hidden.
  const sizes = parseSizesParam(req.nextUrl.searchParams.get("sizes"));
  if (sizes.length > 0) query = query.or(sizeOrFilter(sizes));

  const { data: products, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withPricing = (products ?? []).map((p) => {
    const openListings = (p.listings ?? []).filter((l: any) => !l.sold_at);
    const lowest = openListings.length
      ? openListings.reduce((best: any, l: any) => (l.price_gbp < best.price_gbp ? l : best))
      : null;
    return {
      ...p,
      lowestPriceGBP: lowest ? lowest.price_gbp : null,
      cheapestListingId: lowest ? lowest.id : null,
      sellerCount: openListings.length,
    };
  });

  return NextResponse.json({ products: withPricing });
}
