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
 * POST /api/listings — either a seller turns a won opportunity into a
 * marketplace listing (the original, still-unchanged path), OR — 28 Aug
 * 2026, Steven: "need an option in the sellers dashboard to add own stock
 * they have for sale" — lists straight from their own seller_stock_items
 * catalog (migration 0029), OR a fully freeform manual listing with no
 * opportunity/stock link at all. Exactly one of opportunityId / stockItemId
 * is expected; omit both for a freeform listing.
 *
 * This closes a real, pre-existing gap: before this, there was NO way for
 * a reseller to list something they sourced themselves — opportunityId was
 * always required. Honest limitation, unchanged from before: a listing
 * with no opportunity_id has no known cost basis, so it still can't
 * contribute to the public leaderboard's realized-profit calculation (see
 * api/leaderboard/route.ts's own comment) — that's a pre-existing
 * trade-off, not something this relaxation makes worse.
 *
 * "The AI is automatically filling out the listing" happens client-side
 * for the opportunity path (see /sell/new, which calls
 * suggestListingFromOpportunity) — this route just needs the final
 * title/price/condition — plus, if the seller flipped the auto-post
 * switch, the list of external channels to cross-post to (Section 7's
 * multi-platform listing entitlement, Pro/Elite only). Cross-posting is
 * attempted synchronously here, right as they submit;
 * apps/worker/src/jobs/crossPostListings.ts retries anything that didn't
 * succeed.
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!TIER_ENTITLEMENTS[auth.profile.subscriptionTier].canSell) {
    return NextResponse.json({ error: "Your current plan doesn't include selling on the marketplace." }, { status: 403 });
  }

  const body = await req.json();
  const { opportunityId, stockItemId, autoCrossPost, channels } = body;
  let { title, description, imageUrl, priceGBP, condition, categoryId, quantity } = body;

  const supabase = await createSupabaseServerClient();

  let sourceOpportunityCategoryId: string | undefined;

  if (opportunityId) {
    const { data: opportunity, error: oppError } = await supabase
      .from("opportunities")
      .select("id, won_by, category_id")
      .eq("id", opportunityId)
      .single();
    if (oppError || !opportunity) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
    if (opportunity.won_by !== auth.userId) {
      return NextResponse.json({ error: "You can only list an opportunity you won." }, { status: 403 });
    }

    // 26 Aug 2026: instant-win now auto-lists the moment a win is confirmed
    // (see lib/autoListOpportunity.ts), so by the time a seller could reach
    // this manual form for the same opportunity it may already be listed.
    // Without this guard that's a real duplicate listing, not just a
    // theoretical one — same opportunity_id traceability migration 0017 adds.
    const { data: existingListing } = await supabase
      .from("listings")
      .select("id")
      .eq("opportunity_id", opportunityId)
      .maybeSingle();
    if (existingListing) {
      return NextResponse.json({ error: "This opportunity has already been listed." }, { status: 409 });
    }
    sourceOpportunityCategoryId = opportunity.category_id;
  }

  // 28 Aug 2026 — the new "list from my own stock" path. Pulls the
  // catalog entry's own details as defaults; the seller can still override
  // priceGBP on the day (e.g. pricing differently for a live show) but
  // everything else comes straight from the stock item to keep this simple.
  let stockItem: { id: string; quantity: number; is_recurring: boolean } | null = null;
  if (stockItemId) {
    const { data: stock, error: stockError } = await supabase
      .from("seller_stock_items")
      .select("id, seller_id, title, description, image_url, condition, price_gbp, category_id, quantity, is_recurring")
      .eq("id", stockItemId)
      .single();
    if (stockError || !stock) return NextResponse.json({ error: "Stock item not found." }, { status: 404 });
    if (stock.seller_id !== auth.userId) return NextResponse.json({ error: "You can only list your own stock." }, { status: 403 });
    if (stock.quantity <= 0) return NextResponse.json({ error: "No quantity left on this stock item." }, { status: 409 });

    title = title ?? stock.title;
    description = description ?? stock.description;
    imageUrl = imageUrl ?? stock.image_url;
    condition = condition ?? stock.condition;
    categoryId = categoryId ?? stock.category_id;
    priceGBP = priceGBP ?? stock.price_gbp;
    stockItem = { id: stock.id, quantity: stock.quantity, is_recurring: stock.is_recurring };
  }

  if (!title || !priceGBP || !condition) {
    return NextResponse.json({ error: "title, priceGBP, and condition are required." }, { status: 400 });
  }
  const listedQuantity = quantity !== undefined ? Number(quantity) : 1;
  if (!Number.isInteger(listedQuantity) || listedQuantity < 1) {
    return NextResponse.json({ error: "quantity must be a positive whole number." }, { status: 400 });
  }
  if (stockItem && listedQuantity > stockItem.quantity) {
    return NextResponse.json({ error: `Only ${stockItem.quantity} left in stock.` }, { status: 400 });
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
        category_id: categoryId ?? sourceOpportunityCategoryId ?? null,
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
    .insert({
      product_id: productId,
      seller_id: auth.userId,
      price_gbp: priceGBP,
      quantity: listedQuantity,
      opportunity_id: opportunityId ?? null,
      auto_cross_post: wantsAutoCrossPost,
    })
    .select()
    .single();
  if (listingError) return NextResponse.json({ error: listingError.message }, { status: 500 });

  // 28 Aug 2026 — draw down the stock catalog entry by however much just
  // got listed. is_recurring items are still decremented (the checkbox is
  // about keeping the TEMPLATE around for next time, not about the
  // quantity being unlimited) — the seller just tops the quantity back up
  // themselves next time they restock, same as they'd manage any other
  // inventory count.
  if (stockItem) {
    await supabase
      .from("seller_stock_items")
      .update({ quantity: stockItem.quantity - listedQuantity })
      .eq("id", stockItem.id);
  }

  const crossPostResults: unknown[] = [];
  if (wantsAutoCrossPost && Array.isArray(channels)) {
    const validChannels = channels.filter(isValidSalesChannel);

    // A channel has to actually be connected (Section 7's real OAuth
    // account-link — see /settings/connections) before we ever attempt a
    // post to it. Previously every channel "succeeded" unconditionally,
    // which was honest about the post itself being a stub but glossed
    // over the fact there was no real seller account behind it at all.
    // 18 Sept 2026: now selecting the full token row, not just the channel
    // name — eBay's real implementation (ebayListing.ts) needs the actual
    // access/refresh token to call eBay's API with.
    const { data: connectedRows } = await supabase
      .from("channel_connections")
      .select("channel, access_token, refresh_token, token_expires_at")
      .eq("profile_id", auth.userId)
      .eq("status", "connected")
      .in("channel", validChannels);
    const connectionsByChannel = new Map((connectedRows ?? []).map((r) => [r.channel, r]));

    // auth.profile already carries the seller's signup address (migration
    // 0030) — that's exactly what eBay's merchant-location step needs, with
    // no extra query.
    const sellerContext = {
      businessName: auth.profile.businessName,
      displayName: auth.profile.displayName,
      addressLine1: auth.profile.addressLine1,
      addressLine2: auth.profile.addressLine2,
      city: auth.profile.city,
      postcode: auth.profile.postcode,
      country: auth.profile.country,
    };

    for (const channel of validChannels) {
      const connectionRow = connectionsByChannel.get(channel);
      const result = connectionRow
        ? await publishListingToChannel(
            channel,
            { id: listing.id, title, priceGBP, description, imageUrl, condition, quantity: listedQuantity },
            {
              accessToken: connectionRow.access_token,
              refreshToken: connectionRow.refresh_token,
              tokenExpiresAt: connectionRow.token_expires_at,
            },
            sellerContext,
          )
        : { channel, success: false, error: "Not connected — connect this account at /settings/connections first." };

      // eBay's implementation may have had to refresh the access token to
      // make this call at all — persist the new one now, or the very next
      // publish attempt (this listing or any other) would refresh again
      // using an access token that's about to go stale anyway, and once
      // eBay rotates the refresh_token itself, the old one on file stops
      // working entirely.
      if ("updatedTokens" in result && result.updatedTokens) {
        await supabase
          .from("channel_connections")
          .update({
            access_token: result.updatedTokens.accessToken,
            refresh_token: result.updatedTokens.refreshToken,
            token_expires_at: result.updatedTokens.tokenExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq("profile_id", auth.userId)
          .eq("channel", channel);
      }

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
