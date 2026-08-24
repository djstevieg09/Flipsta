import { SALES_CHANNELS, publishListingToChannel } from "@flipsta/shared";
import { createDb } from "../db.js";

/**
 * Retry sweep for cross-posting (Section 7 multi-platform listing, made
 * real). The seller's submit handler (apps/web/app/api/listings/route.ts)
 * already tries to publish to every requested channel synchronously the
 * moment they click submit — this job is the safety net for whatever
 * didn't succeed then (a channel outage, a transient error), re-attempting
 * anything still `pending` or `failed` for a listing that opted in.
 */
export async function crossPostListings() {
  const db = createDb();

  const { data: pendingPosts } = await db
    .from("listing_channel_posts")
    .select("id, listing_id, channel, listings(id, price_gbp, product_id, auto_cross_post, seller_id, products(title))")
    .in("status", ["pending", "failed"]);

  let retried = 0;
  let succeeded = 0;

  for (const post of pendingPosts ?? []) {
    const listing = Array.isArray(post.listings) ? post.listings[0] : post.listings;
    if (!listing || !listing.auto_cross_post) continue;
    const product = listing.products ? (Array.isArray(listing.products) ? listing.products[0] : listing.products) : null;
    const title = product?.title ?? "Flipsta listing";

    // Same rule as the seller's initial submit (apps/web/app/api/listings
    // POST): never retry a post into a channel the seller hasn't actually
    // connected their own account to (Section 7 / /settings/connections) —
    // otherwise this sweep would keep re-succeeding a post that was
    // correctly marked failed for having no real account behind it at all.
    const { data: connection } = await db
      .from("channel_connections")
      .select("status")
      .eq("profile_id", listing.seller_id)
      .eq("channel", post.channel)
      .eq("status", "connected")
      .maybeSingle();
    if (!connection) continue;

    retried++;
    const result = await publishListingToChannel(post.channel as any, { id: listing.id, title, priceGBP: listing.price_gbp });

    await db
      .from("listing_channel_posts")
      .update({
        status: result.success ? "posted" : "failed",
        external_url: result.externalUrl ?? null,
        error: result.error ?? null,
        posted_at: result.success ? new Date().toISOString() : null,
      })
      .eq("id", post.id);

    if (result.success) succeeded++;
  }

  return { channelsSupported: SALES_CHANNELS.length, retried, succeeded };
}
