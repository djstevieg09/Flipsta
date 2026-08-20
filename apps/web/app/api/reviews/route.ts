import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { averageRating, isValidRating } from "@flipsta/shared";

/**
 * GET /api/reviews?sellerId= — public trust signal (Section 12.4), readable
 * by anyone browsing a seller before they bid or buy.
 * POST /api/reviews — a buyer leaves a rating on a completed order. Gated
 * here (not just in RLS) on the buyer actually owning a delivered order for
 * that seller that hasn't already been reviewed — prevents drive-by reviews
 * and double-reviewing the same order.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sellerId = searchParams.get("sellerId");
  if (!sellerId) return NextResponse.json({ error: "sellerId is required." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ratings = (data ?? []).map((r) => r.rating);
  return NextResponse.json({ reviews: data, averageRating: averageRating(ratings), count: ratings.length });
}

export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { orderId, rating, comment } = await req.json();
  if (!orderId || rating === undefined) {
    return NextResponse.json({ error: "orderId and rating are required." }, { status: 400 });
  }
  if (!isValidRating(rating)) {
    return NextResponse.json({ error: "rating must be a whole number from 1 to 5." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, buyer_id, status, listings(seller_id)")
    .eq("id", orderId)
    .single();
  if (orderError || !order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.buyer_id !== auth.userId) return NextResponse.json({ error: "This isn't your order." }, { status: 403 });
  if (order.status !== "delivered") {
    return NextResponse.json({ error: "You can only review an order once it's been delivered." }, { status: 409 });
  }

  const listing = Array.isArray(order.listings) ? order.listings[0] : order.listings;
  const sellerId = listing?.seller_id;
  if (!sellerId) return NextResponse.json({ error: "Could not resolve the seller for this order." }, { status: 500 });

  const { data, error } = await supabase
    .from("reviews")
    .insert({ order_id: orderId, buyer_id: auth.userId, seller_id: sellerId, rating, comment: comment ?? null })
    .select()
    .single();
  if (error) {
    // The `reviews.order_id` unique constraint (0002_admin_ops.sql) is what
    // actually stops a second review on the same order — surface that as a
    // friendly conflict rather than a raw Postgres error.
    if (error.code === "23505") return NextResponse.json({ error: "You've already reviewed this order." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ review: data }, { status: 201 });
}
