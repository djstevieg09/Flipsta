import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { averageRating, isValidRating } from "@flipsta/shared";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/product-reviews — product-level trust signal on Flipsta's
 * own sourced purchases (shop_items, opportunities), where there's no peer
 * seller to rate via the existing /api/reviews (see migration 0021's
 * comment for why this is a separate table from that one).
 *
 * GET ?productName=X — public: every review left for that exact product
 * name, plus the average rating, for display on /shop and anywhere else a
 * shopper is deciding whether to buy.
 * GET ?mine=true — the signed-in user's own reviews, so a page can show
 * "already reviewed" instead of the form again.
 *
 * POST — a buyer leaves a rating on a specific purchase. Gated here (not
 * just in RLS — see migration 0021's comment on why a single RLS policy
 * can't express this) on the reviewer actually owning a completed
 * purchase matching (sourceType, sourceId): queried with their own
 * request-scoped Supabase client, filtered to their own profile_id, so a
 * row only comes back if it's genuinely theirs.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const supabase = await createSupabaseServerClient();

  if (searchParams.get("mine") === "true") {
    const auth = await getCurrentProfile();
    if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const { data, error } = await supabase.from("product_reviews").select("*").eq("reviewer_id", auth.userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ reviews: data });
  }

  const productName = searchParams.get("productName");
  if (!productName) return NextResponse.json({ error: "productName is required." }, { status: 400 });

  const { data, error } = await supabase
    .from("product_reviews")
    .select("*")
    .eq("product_name", productName)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ratings = (data ?? []).map((r) => r.rating);
  return NextResponse.json({ reviews: data, averageRating: averageRating(ratings), count: ratings.length });
}

export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { sourceType, sourceId, rating, body } = await req.json();
  if (!sourceType || !sourceId || rating === undefined) {
    return NextResponse.json({ error: "sourceType, sourceId and rating are required." }, { status: 400 });
  }
  if (sourceType !== "shop_item" && sourceType !== "opportunity") {
    return NextResponse.json({ error: "sourceType must be shop_item or opportunity." }, { status: 400 });
  }
  if (!isValidRating(rating)) {
    return NextResponse.json({ error: "rating must be a whole number from 1 to 5." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  let productName: string | null = null;
  if (sourceType === "shop_item") {
    const { data: item } = await supabase
      .from("shop_items")
      .select("product_name, status, buyer_id")
      .eq("id", sourceId)
      .eq("buyer_id", auth.userId)
      .maybeSingle();
    if (!item) return NextResponse.json({ error: "That purchase wasn't found on your account." }, { status: 404 });
    if (item.status !== "delivered") {
      return NextResponse.json({ error: "You can only review an item once it's been delivered." }, { status: 409 });
    }
    productName = item.product_name;
  } else {
    const { data: opp } = await supabase
      .from("opportunities")
      .select("product_name, status, won_by")
      .eq("id", sourceId)
      .eq("won_by", auth.userId)
      .maybeSingle();
    if (!opp) return NextResponse.json({ error: "That purchase wasn't found on your account." }, { status: 404 });
    productName = opp.product_name;
  }
  if (!productName) return NextResponse.json({ error: "Could not resolve a product name for this purchase." }, { status: 500 });

  const { data, error } = await supabase
    .from("product_reviews")
    .insert({ reviewer_id: auth.userId, source_type: sourceType, source_id: sourceId, product_name: productName, rating, body: body ?? null })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "You've already reviewed this purchase." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ review: data }, { status: 201 });
}
