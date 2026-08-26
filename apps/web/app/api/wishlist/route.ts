import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";

// Force-dynamic: same reasoning as every other route here — reads live
// application data straight from Supabase.
export const dynamic = "force-dynamic";

/**
 * GET /api/wishlist — 26 Aug 2026, Steven: "wishlist / save for later"
 * (confirmed via AskUserQuestion). Availability is re-derived here rather
 * than trusted from the snapshot: shop_items rows are ephemeral per-unit
 * (0013/0014's comments), so a saved item might have sold out entirely
 * since it was saved — isAvailable tells the page whether to still offer a
 * Buy Now/Add to basket action or just show it as "no longer available".
 */
export async function GET() {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data: saved, error } = await supabase
    .from("wishlist_items")
    .select("id, item_type, reference_shop_item_id, reference_product_id, product_name, image_url, price_gbp, created_at")
    .eq("profile_id", auth.userId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = await Promise.all(
    (saved ?? []).map(async (w) => {
      if (w.item_type === "shop_item") {
        const { count } = await supabase
          .from("shop_items")
          .select("id", { count: "exact", head: true })
          .eq("product_name", w.product_name)
          .eq("our_price_gbp", w.price_gbp)
          .eq("status", "available")
          .not("image_url", "is", null);
        return { ...w, isAvailable: (count ?? 0) > 0 };
      }
      if (w.reference_product_id) {
        const { data: openListing } = await supabase
          .from("listings")
          .select("id")
          .eq("product_id", w.reference_product_id)
          .is("sold_at", null)
          .limit(1)
          .maybeSingle();
        return { ...w, isAvailable: Boolean(openListing) };
      }
      return { ...w, isAvailable: false };
    }),
  );

  return NextResponse.json({ items });
}

/**
 * POST /api/wishlist — save an item. Snapshots product_name/image_url/
 * price_gbp at save time (0014's migration comment explains why) rather
 * than relying only on the live reference, which can vanish (shop_items)
 * or change price (products).
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { itemType, shopItemId, productId, productName, imageUrl, priceGBP } = await req.json();
  if (itemType !== "shop_item" && itemType !== "product") {
    return NextResponse.json({ error: 'itemType must be "shop_item" or "product".' }, { status: 400 });
  }
  if (!productName || typeof priceGBP !== "number") {
    return NextResponse.json({ error: "productName and priceGBP are required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("wishlist_items")
    .insert({
      profile_id: auth.userId,
      item_type: itemType,
      reference_shop_item_id: itemType === "shop_item" ? shopItemId ?? null : null,
      reference_product_id: itemType === "product" ? productId ?? null : null,
      product_name: productName,
      image_url: imageUrl ?? null,
      price_gbp: priceGBP,
    })
    .select()
    .single();
  if (error) {
    // Unique constraint hit (0014's migration) — this exact item is already
    // saved, which isn't really an error from the caller's point of view.
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("wishlist_items")
        .select()
        .eq("profile_id", auth.userId)
        .eq("item_type", itemType)
        .eq("product_name", productName)
        .eq("price_gbp", priceGBP)
        .maybeSingle();
      return NextResponse.json({ item: existing }, { status: 200 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data }, { status: 201 });
}
