import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { TIER_ENTITLEMENTS } from "@/lib/tierGuard";

export const dynamic = "force-dynamic";

/**
 * GET /api/seller-stock — the caller's own stock catalog (migration 0029),
 * for the new /sell/stock page and for the "add item from stock" pickers
 * on the live-show pages.
 */
export async function GET() {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("seller_stock_items")
    .select("*, categories(name)")
    .eq("seller_id", auth.userId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ stock: data });
}

/**
 * POST /api/seller-stock — 28 Aug 2026, Steven: "need an option in the
 * sellers dashboard to add own stock they have for sale. have a tick box
 * if they want to save it for recurring stock." isRecurring is v1
 * informational/filterable only (see migration 0029's comment) — doesn't
 * drive any auto-restock behavior yet.
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!TIER_ENTITLEMENTS[auth.profile.subscriptionTier].canSell) {
    return NextResponse.json({ error: "Your current plan doesn't include selling." }, { status: 403 });
  }

  const { title, description, imageUrl, categoryId, condition, priceGBP, quantity, isRecurring } = await req.json();
  if (!title || typeof priceGBP !== "number" || priceGBP <= 0) {
    return NextResponse.json({ error: "title and a positive priceGBP are required." }, { status: 400 });
  }
  const qty = quantity !== undefined ? Number(quantity) : 1;
  if (!Number.isInteger(qty) || qty < 0) {
    return NextResponse.json({ error: "quantity must be zero or a positive whole number." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("seller_stock_items")
    .insert({
      seller_id: auth.userId,
      title,
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      image_url: typeof imageUrl === "string" && imageUrl.trim() ? imageUrl.trim() : null,
      category_id: categoryId ?? null,
      condition: condition || "used",
      price_gbp: priceGBP,
      quantity: qty,
      is_recurring: Boolean(isRecurring),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ stockItem: data }, { status: 201 });
}
