/**
 * 18 Sept 2026 — the real half of Section 7's eBay cross-posting. Until now
 * `publishListingToChannel()` in salesChannels.ts simulated a successful
 * post for every channel (INFRASTRUCTURE_TODO.md #9 says this outright:
 * "connecting the account and posting the listing are two separate pieces
 * of work, and only the first is done"). apps/web/lib/channelOAuth.ts +
 * the channel-connections API routes are that first piece — a real, working
 * OAuth "connect your eBay account" flow. This file is the second piece: an
 * actual call to eBay's Sell API to create and publish a live listing using
 * the access token that flow obtained.
 *
 * Deliberately self-contained rather than importing anything from
 * apps/web/lib/channelOAuth.ts — that file lives in apps/web and the worker
 * (apps/worker) can't reach it, but the worker's retry sweep
 * (crossPostListings.ts) needs to be able to publish too. So this reads
 * CHANNEL_EBAY_CLIENT_ID/_CLIENT_SECRET straight from env, same as
 * channelOAuth.ts does independently — meaning both `flipsta-web` AND
 * `flipsta-worker` need those two env vars set on Render, not just web.
 *
 * NOT yet tested against a real eBay account — there's nothing to test
 * against until Steven registers an eBay Developer app (see
 * INFRASTRUCTURE_TODO.md #9's eBay bullet for the exact steps) and sets
 * CHANNEL_EBAY_CLIENT_ID/_CLIENT_SECRET/_RUNAME. Every eBay endpoint and
 * request shape below is written straight from eBay's own Sell API docs
 * (developer.ebay.com/api-docs/sell/inventory and .../account), but the
 * first real connected seller is the first real test — errors from eBay are
 * deliberately surfaced verbatim into listing_channel_posts.error rather
 * than swallowed, so anything wrong is visible and fixable rather than a
 * silent stub-like "success".
 */

const EBAY_API_ROOT = "https://api.ebay.com";
const EBAY_MARKETPLACE_ID = "EBAY_GB"; // Flipsta is UK-only for now — see profiles.country default 'GB'.
const EBAY_MERCHANT_LOCATION_KEY = "flipsta-seller-location";

export interface EbayConnectionTokens {
  accessToken: string;
  refreshToken: string | null;
  /** ISO timestamp, or null if unknown (treated as "refresh before use"). */
  tokenExpiresAt: string | null;
}

export interface EbaySellerAddress {
  businessName?: string | null;
  displayName?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postcode?: string | null;
  /** ISO 3166-1 alpha-2, e.g. "GB" — profiles.country defaults to this already. */
  country?: string | null;
}

export interface EbayListingInput {
  id: string;
  title: string;
  priceGBP: number;
  description?: string | null;
  imageUrl?: string | null;
  /** Flipsta's own freeform condition strings — see sell/new/page.tsx's <select>. */
  condition?: string | null;
  quantity?: number;
}

export interface EbayPublishResult {
  success: boolean;
  externalUrl?: string;
  error?: string;
  /**
   * Set only when this call refreshed the seller's access token. This
   * module has no DB access of its own — the caller (apps/web's listings
   * POST route, apps/worker's crossPostListings job) must persist this back
   * to channel_connections, or the next call will refresh again needlessly
   * (harmless, just wasteful) or — once the refresh_token itself has been
   * rotated by eBay — fail outright using the now-stale one.
   */
  updatedTokens?: EbayConnectionTokens;
}

/** Whether Flipsta itself has an eBay Developer app registered yet (see channelOAuth.ts's matching check). */
export function isEbayConfigured(): boolean {
  return Boolean(process.env.CHANNEL_EBAY_CLIENT_ID && process.env.CHANNEL_EBAY_CLIENT_SECRET);
}

function ebayAuthHeader(): string {
  const id = process.env.CHANNEL_EBAY_CLIENT_ID;
  const secret = process.env.CHANNEL_EBAY_CLIENT_SECRET;
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

/**
 * eBay access tokens last ~2 hours; refresh tokens last ~18 months. Called
 * proactively (5-minute buffer) rather than reactively on a 401, since a
 * 401 mid-multi-step-publish would be awkward to recover from cleanly.
 */
async function refreshEbayAccessToken(refreshToken: string): Promise<EbayConnectionTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: "https://api.ebay.com/oauth/api_scope/sell.inventory",
  });
  const res = await fetch(`${EBAY_API_ROOT}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: ebayAuthHeader() },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`eBay rejected the token refresh (HTTP ${res.status}). ${detail}`.trim());
  }
  const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    tokenExpiresAt: new Date(Date.now() + (data.expires_in ?? 7200) * 1000).toISOString(),
  };
}

/** Returns a definitely-usable access token, refreshing first if it's expired or expiring within 5 minutes. */
async function getFreshAccessToken(
  connection: EbayConnectionTokens,
): Promise<{ accessToken: string; updatedTokens?: EbayConnectionTokens }> {
  const expiresAt = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() : 0;
  const needsRefresh = !connection.tokenExpiresAt || expiresAt - Date.now() < 5 * 60 * 1000;
  if (!needsRefresh) return { accessToken: connection.accessToken };
  if (!connection.refreshToken) {
    // No refresh token on file and the access token is expired/unknown — nothing to do but
    // try the existing access token as-is and let the caller see eBay's own error.
    return { accessToken: connection.accessToken };
  }
  const updatedTokens = await refreshEbayAccessToken(connection.refreshToken);
  return { accessToken: updatedTokens.accessToken, updatedTokens };
}

async function ebayFetch(path: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${EBAY_API_ROOT}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Content-Language": "en-GB",
      "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE_ID,
      ...init.headers,
    },
  });
}

async function ebayJson<T>(res: Response, action: string): Promise<T> {
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`eBay ${action} failed (HTTP ${res.status}). ${detail}`.trim());
  }
  // A couple of eBay endpoints (e.g. inventory_item PUT) return 200/204 with no body.
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * Maps Flipsta's freeform condition text (sell/new/page.tsx's <select>: New
 * / Like new / Used, plus whatever seller_stock_items rows carry from
 * before that was locked down) onto eBay's fixed condition enum. Falls back
 * to USED_GOOD, the safest generic "used" bucket, for anything unrecognized
 * rather than rejecting the listing outright.
 */
function mapConditionToEbay(condition?: string | null): string {
  const normalized = (condition ?? "").trim().toLowerCase();
  if (normalized === "new") return "NEW";
  if (normalized === "like new") return "LIKE_NEW";
  if (normalized === "used") return "USED_GOOD";
  return "USED_GOOD";
}

/** eBay's SKU field is capped at 50 chars; a UUID-based one comfortably fits. */
function skuFor(listingId: string): string {
  return `flipsta-${listingId}`;
}

let cachedCategoryTreeId: string | null = null;
async function getCategoryTreeId(accessToken: string): Promise<string> {
  if (cachedCategoryTreeId) return cachedCategoryTreeId;
  const res = await ebayFetch(
    `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${EBAY_MARKETPLACE_ID}`,
    accessToken,
  );
  const data = await ebayJson<{ categoryTreeId: string }>(res, "category tree lookup");
  cachedCategoryTreeId = data.categoryTreeId;
  return cachedCategoryTreeId;
}

/** Real category IDs beat a hardcoded guess and don't require the seller to pick one themselves. */
async function suggestCategoryId(accessToken: string, title: string): Promise<string> {
  const treeId = await getCategoryTreeId(accessToken);
  const res = await ebayFetch(
    `/commerce/taxonomy/v1/category_tree/${treeId}/get_category_suggestions?q=${encodeURIComponent(title)}`,
    accessToken,
  );
  const data = await ebayJson<{ categorySuggestions?: { category: { categoryId: string } }[] }>(
    res,
    "category suggestion",
  );
  const first = data.categorySuggestions?.[0]?.category.categoryId;
  if (!first) throw new Error("eBay couldn't suggest a category for this listing's title — try a more specific title.");
  return first;
}

/**
 * eBay requires a registered "merchant location" (ship-from address) before
 * any offer can be published. One shared location per seller, keyed the
 * same every time (EBAY_MERCHANT_LOCATION_KEY) — created once, reused after
 * that. Built from the seller's own profile address (profiles.address_line1
 * etc., collected at signup since migration 0030) rather than asking them
 * to enter it again just for this.
 */
async function ensureMerchantLocation(accessToken: string, seller: EbaySellerAddress): Promise<void> {
  const existing = await ebayFetch(`/sell/inventory/v1/location/${EBAY_MERCHANT_LOCATION_KEY}`, accessToken);
  if (existing.ok) return;
  if (existing.status !== 404) {
    const detail = await existing.text().catch(() => "");
    throw new Error(`eBay location lookup failed (HTTP ${existing.status}). ${detail}`.trim());
  }

  if (!seller.addressLine1 || !seller.city || !seller.postcode) {
    throw new Error(
      "Your Flipsta account is missing a ship-from address — add your address on /account before eBay listings can publish (eBay requires one on file).",
    );
  }

  const createRes = await ebayFetch(`/sell/inventory/v1/location/${EBAY_MERCHANT_LOCATION_KEY}`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      name: seller.businessName || seller.displayName || "Flipsta seller",
      merchantLocationStatus: "ENABLED",
      locationTypes: ["WAREHOUSE"],
      location: {
        address: {
          addressLine1: seller.addressLine1,
          addressLine2: seller.addressLine2 || undefined,
          city: seller.city,
          postalCode: seller.postcode,
          country: seller.country || "GB",
        },
      },
    }),
  });
  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => "");
    throw new Error(`eBay location creation failed (HTTP ${createRes.status}). ${detail}`.trim());
  }
}

interface EbayListingPolicies {
  fulfillmentPolicyId: string;
  paymentPolicyId: string;
  returnPolicyId: string;
}

/**
 * Business Policies (payment/return/fulfillment terms) are set up by the
 * seller on eBay's own side (Seller Hub > Account > Business Policies) —
 * standard eBay seller setup, not something Flipsta creates on their behalf
 * (those are real commercial terms — postage cost, return window — that
 * should be the seller's own decision, made on eBay directly). This just
 * reads whichever ones they already have and uses the first of each.
 */
async function getSellerListingPolicies(accessToken: string): Promise<EbayListingPolicies> {
  const [fulfillment, payment, returns] = await Promise.all([
    ebayFetch(`/sell/account/v1/fulfillment_policy?marketplace_id=${EBAY_MARKETPLACE_ID}`, accessToken),
    ebayFetch(`/sell/account/v1/payment_policy?marketplace_id=${EBAY_MARKETPLACE_ID}`, accessToken),
    ebayFetch(`/sell/account/v1/return_policy?marketplace_id=${EBAY_MARKETPLACE_ID}`, accessToken),
  ]);
  const [fulfillmentData, paymentData, returnData] = await Promise.all([
    ebayJson<{ fulfillmentPolicies?: { fulfillmentPolicyId: string }[] }>(fulfillment, "fulfillment policy lookup"),
    ebayJson<{ paymentPolicies?: { paymentPolicyId: string }[] }>(payment, "payment policy lookup"),
    ebayJson<{ returnPolicies?: { returnPolicyId: string }[] }>(returns, "return policy lookup"),
  ]);

  const fulfillmentPolicyId = fulfillmentData.fulfillmentPolicies?.[0]?.fulfillmentPolicyId;
  const paymentPolicyId = paymentData.paymentPolicies?.[0]?.paymentPolicyId;
  const returnPolicyId = returnData.returnPolicies?.[0]?.returnPolicyId;
  if (!fulfillmentPolicyId || !paymentPolicyId || !returnPolicyId) {
    throw new Error(
      "Your eBay account needs Business Policies turned on with at least one payment, return, and postage policy set up — do this once at ebay.co.uk (Seller Hub → Account → Business Policies), then try publishing again.",
    );
  }
  return { fulfillmentPolicyId, paymentPolicyId, returnPolicyId };
}

/** Finds an existing offer for this SKU (from an earlier attempt) rather than erroring on a duplicate create. */
async function findExistingOfferId(accessToken: string, sku: string): Promise<string | null> {
  const res = await ebayFetch(`/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`, accessToken);
  if (!res.ok) return null;
  const data = await ebayJson<{ offers?: { offerId: string }[] }>(res, "existing offer lookup");
  return data.offers?.[0]?.offerId ?? null;
}

/**
 * The full create-and-publish sequence: inventory item → merchant location →
 * business policies → category → offer (create or update) → publish.
 * Any step failing surfaces a specific, actionable error rather than a
 * generic one, since a seller (or Steven, debugging) needs to know exactly
 * which of several independent eBay-side prerequisites is missing.
 */
export async function publishListingToEbay(
  listing: EbayListingInput,
  connection: EbayConnectionTokens,
  seller: EbaySellerAddress,
): Promise<EbayPublishResult> {
  try {
    const { accessToken, updatedTokens } = await getFreshAccessToken(connection);
    const sku = skuFor(listing.id);

    const inventoryRes = await ebayFetch(`/sell/inventory/v1/inventory_item/${sku}`, accessToken, {
      method: "PUT",
      body: JSON.stringify({
        availability: { shipToLocationAvailability: { quantity: listing.quantity ?? 1 } },
        condition: mapConditionToEbay(listing.condition),
        product: {
          title: listing.title.slice(0, 80), // eBay's own title cap
          description: listing.description || listing.title,
          imageUrls: listing.imageUrl ? [listing.imageUrl] : undefined,
        },
      }),
    });
    if (!inventoryRes.ok) {
      const detail = await inventoryRes.text().catch(() => "");
      throw new Error(`eBay inventory item failed (HTTP ${inventoryRes.status}). ${detail}`.trim());
    }

    await ensureMerchantLocation(accessToken, seller);
    const policies = await getSellerListingPolicies(accessToken);
    const categoryId = await suggestCategoryId(accessToken, listing.title);

    const offerBody = {
      sku,
      marketplaceId: EBAY_MARKETPLACE_ID,
      format: "FIXED_PRICE",
      availableQuantity: listing.quantity ?? 1,
      categoryId,
      merchantLocationKey: EBAY_MERCHANT_LOCATION_KEY,
      listingDescription: listing.description || listing.title,
      listingPolicies: {
        fulfillmentPolicyId: policies.fulfillmentPolicyId,
        paymentPolicyId: policies.paymentPolicyId,
        returnPolicyId: policies.returnPolicyId,
      },
      pricingSummary: { price: { value: listing.priceGBP.toFixed(2), currency: "GBP" } },
    };

    let offerId = await findExistingOfferId(accessToken, sku);
    if (offerId) {
      const updateRes = await ebayFetch(`/sell/inventory/v1/offer/${offerId}`, accessToken, {
        method: "PUT",
        body: JSON.stringify(offerBody),
      });
      if (!updateRes.ok) {
        const detail = await updateRes.text().catch(() => "");
        throw new Error(`eBay offer update failed (HTTP ${updateRes.status}). ${detail}`.trim());
      }
    } else {
      const createRes = await ebayFetch(`/sell/inventory/v1/offer`, accessToken, {
        method: "POST",
        body: JSON.stringify(offerBody),
      });
      const created = await ebayJson<{ offerId: string }>(createRes, "offer creation");
      offerId = created.offerId;
    }

    const publishRes = await ebayFetch(`/sell/inventory/v1/offer/${offerId}/publish`, accessToken, {
      method: "POST",
    });
    if (!publishRes.ok) {
      const detail = await publishRes.text().catch(() => "");
      // Republishing an already-live offer is a real, harmless case (e.g. a
      // retry after the DB write for a previous success failed) — treat
      // eBay's "already published"-shaped error as success rather than a
      // failure, since the listing genuinely is live either way.
      if (!/already.*publish/i.test(detail)) {
        throw new Error(`eBay offer publish failed (HTTP ${publishRes.status}). ${detail}`.trim());
      }
    }
    const published = (await publishRes
      .clone()
      .json()
      .catch(() => null)) as { listingId?: string } | null;
    const listingId = published?.listingId;

    return {
      success: true,
      externalUrl: listingId ? `https://www.ebay.co.uk/itm/${listingId}` : undefined,
      updatedTokens,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
