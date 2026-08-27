import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Force-dynamic — same reasoning as every other public data route here
// (see api/shop-items/route.ts): never let Next cache a stale response
// across a deploy or a sync run.
export const dynamic = "force-dynamic";

/**
 * GET /api/affiliate-products — 27 Aug 2026, Steven: "i need assistance
 * setting up Awin api to fill my store with goods." Public, no sign-in
 * required, same as /api/shop-items — powers /partner-deals. Only ever
 * populated by the worker's syncAwinProducts job; this route is read-only.
 */
export async function GET(req: NextRequest) {
  const categoryId = req.nextUrl.searchParams.get("categoryId");

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("affiliate_products")
    .select("id, advertiser_name, title, description, image_url, category_id, price_gbp, rrp_gbp, affiliate_url, categories(name)")
    .eq("in_stock", true)
    .order("last_synced_at", { ascending: false })
    .limit(200);
  if (categoryId) query = query.eq("category_id", categoryId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ products: data ?? [] });
}
