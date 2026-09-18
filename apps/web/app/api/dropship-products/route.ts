import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/dropship-products — 18 Sept 2026, Steven: "add ali express
 * products and add them into our shop with a 25% markup." Public catalogue
 * read for the /shop page's "AliExpress Finds" section — only ever
 * populated by staff via /api/admin/dropship-products (migration 0033),
 * so this is a plain public select, same discipline as
 * /api/shop-items and affiliate_products.
 */
export async function GET() {
  const supabase = createSupabaseServiceClient();

  const { data: products, error } = await supabase
    .from("dropship_products")
    .select("id, title, description, image_url, our_price_gbp, category_id, categories(name)")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ products: products ?? [] });
}
