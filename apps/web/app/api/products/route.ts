import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Force-dynamic: every route here reads live application data (bids, wallet
// balances, opportunities, order status) straight from Supabase. Without this,
// Next.js's App Router can cache a GET route's first response (including the
// fetch calls a library like supabase-js makes under the hood) and keep
// serving that same stale response indefinitely, even after the database
// changes underneath it — exactly what caused real, freshly-discovered
// opportunities to not show up on /opportunities on 25 Aug 2026.
export const dynamic = "force-dynamic";

/** GET /api/products — catalogue with each product's pooled lowest ask (Section 11.4). */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: products, error } = await supabase
    .from("products")
    .select("id, title, condition, description, image_url, category_id, categories(name), listings(price_gbp, sold_at)");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withPricing = (products ?? []).map((p) => {
    const openListings = (p.listings ?? []).filter((l: any) => !l.sold_at);
    const lowest = openListings.length ? Math.min(...openListings.map((l: any) => l.price_gbp)) : null;
    return { ...p, lowestPriceGBP: lowest, sellerCount: openListings.length };
  });

  return NextResponse.json({ products: withPricing });
}
