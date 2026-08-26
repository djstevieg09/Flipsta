import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { TIER_ENTITLEMENTS } from "@/lib/tierGuard";
import { isValidSalesChannel, publishListingToChannel, sortByPriceTimePriority } from "@flipsta/shared";

// Force-dynamic: every route here reads live application data (bids, wallet
// balances, opportunities, order status) straight from Supabase. Without this,
// Next.js's App Router can cache a GET route's first response (including the
// fetch calls a library like supabase-js makes under the hood) and keep
// serving that same stale response indefinitely, even after the database
// changes underneath it — exactly what caused real, freshly-discovered
// opportunities to not show up on /opportunities on 25 Aug 2026.
export const dynamic = "force-dynamic";

/**
 * GET /api/listings?productId=... — the pooled order book for a product
 * (Section 11.4): every seller's ask for the same SKU, lowest price first,
 * time as the tiebreaker. This is what makes the consumer marketplace and
 * the reseller's "Marketplace" tab both read the same underlying data.
 *
 * GET /api/listings?mine=true — a different mode: the caller's own listings
 * (open and sold), with cross-post channel status merged in. Powers
 * /portfolio's self-serve "my listings" view.
 */
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("mine") === "true") {
    const auth = await getCurrentProfile();
    if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("listings")
      .select("*, products(title, condition), listing_channel_posts(channel, status, external_url)")
      .eq("seller_id", auth.userId)
      .order("listed_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ listings: data });
  }

  const productId = req.nextUrl.searchParams.get("productId");
  if (!productId) return NextResponse.json({ error: "productId is required." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("listings")
    .select("id, seller_id, price_gbp, listed_at, quantity, profiles(display_name)")
    .eq("product_id", productId)
    .is("sold_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sorted = sortByPriceTimePriority(
    (data ?? []).map((l) => ({ id: l.id, sellerId: l.seller_id, priceGBP: l.price_gbp, listedAt: new Date(l.listed_at) })),
  );

  return NextResponse.json({ listings: sorted, raw: data });
}

/**
 * POST /api/listings — a seller turns a won opportunity into a marketplace
 * listing. "The AI is automatically filling out the listing" happens
 * client-side (see /sell/new, which calls suggestListingFromOpportunity),
 * this route just needs the final title/price/condition — plus, if the
 * seller flipped the auto-post switch, the list of external channels to
 * cross-post to (Section 7's multi-platform listing entitlement, Pro/Elite
 * only). Cross-posting is attempted synchronously here, right as they
 * submit; apps/worker/src/jobs/crossPostListings.ts retries anything that
 * didn't succeed.
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!TIER_ENTITLEMENTS[auth.profile.subscriptionTier].canSell) {
    return NextResponse.json({ error: "Your current plan doesn't include selling on the marketplace." }, { status: 403 });
  }

  const { opportunityId, title, description, imageUrl, priceGBP, condition, categoryId, autoCrossPost, channels } = await req.json();
  if (!opportunityId || !title || !priceGBP || !condition) {
    return NextResponse.json({ error: "opportunityId, title, priceGBP, and condition are required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: opportunity, error: oppError } = await supabase
    .from("opportunities")
    .select("id, won_by, category_id")
    .eq("id", opportunityId)
    .single();
  if (oppError || !opportunity) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  if (opportunity.won_by !== auth.userId) {
    return NextResponse.json({ error: "You can only list an opportunity you won." }, { status: 403 });
  }

  // Find-or-create the canonical product row this listing pools onto (Section 11.4).
  const { data: existingProduct } = await supabase
    .from("products")
    .select("id")
    .eq("title", title)
    .eq("condition", condition)
    .maybeSingle();

  let productId = existingProduct?.id as string | undefined;
  if (!productId) {
    const { data: newProduct, error: productError } = await supabase
      .from("products")
      .insert({
        title,
        condition,
        category_id: categoryId ?? opportunity.category_id,
        description: typeof description === "string" && description ? description : null,
        image_url: typeof imageUrl === "string" && imageUrl ? imageUrl : null,
      })
      .select("id")
      .single();
    if (productError) return NextResponse.json({ error: productError.message }, { status: 500 });
    productId = newProduct.id;
  }

  const wantsAutoCrossPost = Boolean(autoCrossPost);
  const canCrossPost = TIER_ENTITLEMENTS[auth.profile.subscriptionTier].multiPlatformListing;
  if (wantsAutoCrossPost && !canCrossPost) {
    return NextResponse.json({ error: "Multi-platform listing requires Pro or Elite." }, { status: 403 });
  }

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .insert({ product_id: productId, seller_id: auth.userId, price_gbp: priceGBP, auto_cross_post: wantsAutoCrossPost })
    .select()
    .single();
  if (listingError) return NextResponse.json({ error: listingError.message }, { status: 500 });

  const crossPostResults: unknown[] = [];
  if (wantsAutoCrossPost && Array.isArray(channels)) {
    const validChannels = channels.filter(isValidSalesChannel);

    // A channel has to actually be connected (Section 7's real OAuth
    // account-link — see /settings/connections) before we ever attempt a
    // post to it. Previously every channel "succeeded" unconditionally,
    // which was honest about the post itself being a stub but glossed
    // over the fact there was no real seller account behind it at all.
    const { data: connectedRows } = await supabase
      .from("channel_connections")
      .select("channel")
      .eq("profile_id", auth.userId)
      .eq("status", "connected")
      .in("channel", validChannels);
    const connectedChannels = new Set((connectedRows ?? []).map((r) => r.channel));

    for (const channel of validChannels) {
      const result = connectedChannels.has(channel)
        ? await publishListingToChannel(channel, { id: listing.id, title, priceGBP })
        : { channel, success: false, error: "Not connected — connect this account at /settings/connections first." };
      const { data: postRow } = await supabase
        .from("listing_channel_posts")
        .insert({
          listing_id: listing.id,
          channel,
          status: result.success ? "posted" : "failed",
          external_url: (result as any).externalUrl ?? null,
          error: result.error ?? null,
          posted_at: result.success ? new Date().toISOString() : null,
        })
        .select()
        .single();
      crossPostResults.push(postRow ?? result);
    }
  }

  return NextResponse.json({ listing, crossPostResults }, { status: 201 });
}
