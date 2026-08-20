import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** GET /api/products — catalogue with each product's pooled lowest ask (Section 11.4). */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: products, error } = await supabase
    .from("products")
    .select("id, title, condition, category_id, categories(name), listings(price_gbp, sold_at)");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withPricing = (products ?? []).map((p) => {
    const openListings = (p.listings ?? []).filter((l: any) => !l.sold_at);
    const lowest = openListings.length ? Math.min(...openListings.map((l: any) => l.price_gbp)) : null;
    return { ...p, lowestPriceGBP: lowest, sellerCount: openListings.length };
  });

  return NextResponse.json({ products: withPricing });
}
