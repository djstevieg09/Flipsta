import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { createOrderForListing } from "@/lib/orderCreation";

// Force-dynamic: every route here reads live application data (bids, wallet
// balances, opportunities, order status) straight from Supabase. Without this,
// Next.js's App Router can cache a GET route's first response (including the
// fetch calls a library like supabase-js makes under the hood) and keep
// serving that same stale response indefinitely, even after the database
// changes underneath it — exactly what caused real, freshly-discovered
// opportunities to not show up on /opportunities on 25 Aug 2026.
export const dynamic = "force-dynamic";

/**
 * POST /api/orders — checkout (Section 6): creates the order, computes the
 * seller's tiered commission (Section 8.1), and opens a Stripe Connect
 * PaymentIntent with manual capture so funds sit in escrow until delivery
 * is confirmed (see apps/worker/src/jobs/releaseEscrow.ts).
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { listingId, courier, extendedHoldRequested } = await req.json();
  if (!listingId) return NextResponse.json({ error: "listingId is required." }, { status: 400 });

  const supabase = await createSupabaseServerClient();

  // 27 Aug 2026 — this now just calls the shared helper (lib/orderCreation.ts),
  // extracted so a live-show auction win creates an order the identical way.
  // No behavior change here versus before the extraction.
  const result = await createOrderForListing(supabase, {
    listingId,
    buyerId: auth.userId,
    courier,
    extendedHoldRequested,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ order: result.order, clientSecret: result.clientSecret }, { status: 201 });
}

/**
 * GET /api/orders — Section 12.1's "self-serving" ask made real: a user
 * can see their own orders both as a buyer and as a seller without any
 * admin involvement, which is what powers /portfolio.
 */
export async function GET() {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();

  const { data: asBuyer, error: buyerError } = await supabase
    .from("orders")
    .select("*, listings(product_id, products(title))")
    .eq("buyer_id", auth.userId)
    .order("created_at", { ascending: false });
  if (buyerError) return NextResponse.json({ error: buyerError.message }, { status: 500 });

  // No seller_id column on orders directly — sold via the listing, so this
  // goes listing -> seller rather than a direct foreign key.
  const { data: myListingIds } = await supabase.from("listings").select("id").eq("seller_id", auth.userId);
  const ids = (myListingIds ?? []).map((l) => l.id);

  let asSeller: unknown[] = [];
  if (ids.length > 0) {
    const { data, error: sellerError } = await supabase
      .from("orders")
      .select("*, listings(product_id, products(title))")
      .in("listing_id", ids)
      .order("created_at", { ascending: false });
    if (sellerError) return NextResponse.json({ error: sellerError.message }, { status: 500 });
    asSeller = data ?? [];
  }

  return NextResponse.json({ asBuyer, asSeller });
}
