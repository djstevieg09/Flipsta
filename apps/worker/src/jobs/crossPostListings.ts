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
    .select("id, listing_id, channel, listings(id, price_gbp, product_id, auto_cross_post, products(title))")
    .in("status", ["pending", "failed"]);

  let retried = 0;
  let succeeded = 0;

  for (const post of pendingPosts ?? []) {
    const listing = Array.isArray(post.listings) ? post.listings[0] : post.listings;
    if (!listing || !listing.auto_cross_post) continue;
    const product = listing.products ? (Array.isArray(listing.products) ? listing.products[0] : listing.products) : null;
    const title = product?.title ?? "Flipsta listing";

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
