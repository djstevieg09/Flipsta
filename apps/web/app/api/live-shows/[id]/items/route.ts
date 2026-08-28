import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";

export const dynamic = "force-dynamic";

/** GET /api/live-shows/:id/items — every item queued into a show, for /live/[id]. Public. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("live_show_items")
    .select("*, listings(id, price_gbp, products(title, condition, image_url))")
    .eq("live_show_id", id)
    .order("position", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data });
}

/**
 * POST /api/live-shows/:id/items — host queues one of their OWN, still-
 * unsold listings into the show (Section note in migration 0027: v1
 * deliberately reuses the existing listing model rather than a "type an
 * item in mid-stream" flow).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data: show, error: showError } = await supabase.from("live_shows").select("id, host_id, status").eq("id", id).single();
  if (showError || !show) return NextResponse.json({ error: "Show not found." }, { status: 404 });
  if (show.host_id !== auth.userId) return NextResponse.json({ error: "Only the host can add items to this show." }, { status: 403 });
  if (show.status === "ended" || show.status === "cancelled") {
    return NextResponse.json({ error: "This show has already ended." }, { status: 409 });
  }

  const { listingId, startingBidGBP, buyNowPriceGBP } = await req.json();
  if (!listingId || typeof startingBidGBP !== "number" || startingBidGBP <= 0) {
    return NextResponse.json({ error: "listingId and a positive startingBidGBP are required." }, { status: 400 });
  }
  if (buyNowPriceGBP !== undefined && buyNowPriceGBP !== null && buyNowPriceGBP <= startingBidGBP) {
    return NextResponse.json({ error: "buyNowPriceGBP must be higher than startingBidGBP." }, { status: 400 });
  }

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id, seller_id, sold_at")
    .eq("id", listingId)
    .single();
  if (listingError || !listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  if (listing.seller_id !== auth.userId) return NextResponse.json({ error: "You can only add your own listings." }, { status: 403 });
  if (listing.sold_at) return NextResponse.json({ error: "This listing has already sold." }, { status: 409 });

  const { count } = await supabase
    .from("live_show_items")
    .select("id", { count: "exact", head: true })
    .eq("live_show_id", id);

  const { data: item, error: itemError } = await supabase
    .from("live_show_items")
    .insert({
      live_show_id: id,
      listing_id: listingId,
      position: count ?? 0,
      starting_bid_gbp: startingBidGBP,
      buy_now_price_gbp: buyNowPriceGBP ?? null,
    })
    .select()
    .single();
  if (itemError) {
    // unique(live_show_id, listing_id) — the friendliest message for the
    // one realistic conflict case (adding the same listing twice).
    const message = itemError.message.includes("unique") ? "That listing is already queued in this show." : itemError.message;
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({ item }, { status: 201 });
}
