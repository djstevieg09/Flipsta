import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Force-dynamic: same reasoning as every other route here — categories
// rarely change, but this keeps Next.js from ever caching a stale list
// across a deploy (see shop-items/route.ts's comment for the full story).
export const dynamic = "force-dynamic";

/**
 * GET /api/categories — 26 Aug 2026, Steven: "now you need to build all the
 * features people have come to expect from an online store. like catagories
 * and basket and all that jazz." The categories table (0001_init.sql) has
 * existed since the very first migration with no RLS — every category is
 * public by design, this route just exposes it for filter UI on /shop.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("categories").select("id, name, slug").order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categories: data ?? [] });
}
