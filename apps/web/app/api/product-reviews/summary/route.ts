import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { averageRating } from "@flipsta/shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/product-reviews/summary — every reviewed product's average
 * rating + count in one call, keyed by product_name, so a listing page
 * (e.g. /shop) can show a star rating on each card without one request per
 * product. Fine at Flipsta's current scale (a handful of reviews); worth
 * paginating or scoping to visible products only if the review volume
 * ever gets large.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("product_reviews").select("product_name, rating");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byProduct = new Map<string, number[]>();
  for (const row of data ?? []) {
    const list = byProduct.get(row.product_name) ?? [];
    list.push(row.rating);
    byProduct.set(row.product_name, list);
  }

  const summary: Record<string, { averageRating: number | null; count: number }> = {};
  for (const [productName, ratings] of byProduct) {
    summary[productName] = { averageRating: averageRating(ratings), count: ratings.length };
  }

  return NextResponse.json({ summary });
}
