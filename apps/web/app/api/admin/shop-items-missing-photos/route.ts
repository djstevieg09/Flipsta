import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";

// Force-dynamic: same reasoning as every other route here — this reads live
// application data straight from Supabase.
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/shop-items-missing-photos — 26 Aug 2026, Steven: "if any
 * pictures missing from listings it goes to admin dashboard to add a
 * picture before its uploaded to shop." A shop_items row with no image_url
 * (the AI sometimes can't find a usable product photo when it sources a
 * candidate — see claudeSearchAdapter.ts) is created exactly as normal, but
 * GET /api/shop-items excludes it from the public feed until a photo is
 * added here. Scoped to status='available' — once bought/shipped/etc it's
 * no longer a "still needs to go on the shop" item.
 */
export async function GET() {
  try {
    await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("shop_items")
    .select("id, product_name, description, rrp_gbp, our_price_gbp, source_retailer, source_url, created_at, categories(name)")
    .eq("status", "available")
    .is("image_url", null)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data ?? [] });
}
