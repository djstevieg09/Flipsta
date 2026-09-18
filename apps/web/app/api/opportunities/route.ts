import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { TIER_ENTITLEMENTS } from "@/lib/tierGuard";

// Force-dynamic: every route here reads live application data (bids, wallet
// balances, opportunities, order status) straight from Supabase. Without this,
// Next.js's App Router can cache a GET route's first response (including the
// fetch calls a library like supabase-js makes under the hood) and keep
// serving that same stale response indefinitely, even after the database
// changes underneath it — exactly what caused real, freshly-discovered
// opportunities to not show up on /opportunities on 25 Aug 2026.
export const dynamic = "force-dynamic";

/**
 * estimated_resale_price_gbp (0008_opportunity_lifecycle.sql) is only
 * populated going forward by discoverOpportunities.ts — any opportunity
 * created before that migration has it as null. Rather than leave those
 * showing a blank "Returns" figure until they cycle out of the feed,
 * reconstruct it from two fields that have always been there:
 * source_price_gbp + expected_margin_gbp ≈ the original resale estimate
 * (same arithmetic discoverOpportunities.ts used to derive the margin in
 * the first place, just run in reverse). source_price_gbp is only ever
 * read here server-side for this calculation — it's never included in
 * what gets returned to the caller unless they've already won it.
 */
function withEstimatedResale<T extends { estimated_resale_price_gbp?: number | null; source_price_gbp?: number | null; expected_margin_gbp?: number | null }>(
  o: T,
): number | null {
  if (typeof o.estimated_resale_price_gbp === "number") return o.estimated_resale_price_gbp;
  if (typeof o.source_price_gbp === "number" && typeof o.expected_margin_gbp === "number") {
    return Math.round((o.source_price_gbp + o.expected_margin_gbp) * 100) / 100;
  }
  return null;
}

/**
 * GET /api/opportunities — the live feed (Section 2 step 4, Section 5 blind teaser).
 * - Redacts source_retailer / source_url / source_price_gbp unless the caller won it.
 * - Enforces the Pro/Elite early-access window (Section 7): Standard tier
 *   doesn't see an opportunity until pro_early_access_until has passed.
 * - Strips ai_reasoning for tiers without AI explainability (Section 11.3 modal feature).
 *
 * GET /api/opportunities?won=true — a different mode entirely: the caller's
 * own won opportunities (any status), fields unredacted since they own
 * them. Powers /sell/new, where a seller turns a win into a listing.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const auth = await getCurrentProfile();

  if (req.nextUrl.searchParams.get("won") === "true") {
    if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const { data: auctionWins, error } = await supabase
      .from("opportunities")
      .select("*, categories(name, slug)")
      .eq("won_by", auth.userId)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 18 Sept 2026 — fixed-price deals (migration 0034) have no single
    // `won_by` (many people can each hold their own slot on the same
    // opportunity row), so "did I buy one of these" lives in
    // opportunity_slot_purchases instead. Folded into the same list here
    // so /portfolio and /sell/new see everything a user has bought either
    // way, without needing to know which pricing model each one used.
    const { data: slotPurchases, error: slotError } = await supabase
      .from("opportunity_slot_purchases")
      .select("purchased_at, opportunities(*, categories(name, slug))")
      .eq("profile_id", auth.userId)
      .order("purchased_at", { ascending: false });
    if (slotError) return NextResponse.json({ error: slotError.message }, { status: 500 });

    const fixedPriceWins = (slotPurchases ?? [])
      .map((row) => {
        const o = Array.isArray(row.opportunities) ? row.opportunities[0] : row.opportunities;
        // status here is purely a display label for THIS buyer's own slot —
        // the underlying row's real status ('live'/'sold_out') describes
        // the deal as a whole, which might still have slots open for
        // other people even though this buyer already has theirs.
        return o ? { ...o, won_by: auth.userId, status: "won", purchased_at: row.purchased_at } : null;
      })
      .filter((o): o is NonNullable<typeof o> => o !== null);

    const data = [...(auctionWins ?? []), ...fixedPriceWins].sort(
      (a, b) => new Date(b.purchased_at ?? b.created_at).getTime() - new Date(a.purchased_at ?? a.created_at).getTime(),
    );

    // 26 Aug 2026: instant-win now auto-lists the moment a win is confirmed
    // (see lib/autoListOpportunity.ts) — without this, /sell/new's dropdown
    // and /portfolio's "won and not listed yet" count both still offered
    // wins that were already listed, letting a seller create a real
    // duplicate listing for the same opportunity.
    const wonIds = (data ?? []).map((o) => o.id);
    let listedOpportunityIds = new Set<string>();
    if (wonIds.length > 0) {
      const { data: listedRows } = await supabase
        .from("listings")
        .select("opportunity_id")
        .in("opportunity_id", wonIds);
      listedOpportunityIds = new Set((listedRows ?? []).map((r) => r.opportunity_id).filter(Boolean));
    }

    const opportunities = (data ?? []).map((o) => ({
      ...o,
      estimated_resale_price_gbp: withEstimatedResale(o),
      alreadyListed: listedOpportunityIds.has(o.id),
    }));
    return NextResponse.json({ opportunities });
  }

  // 18 Sept 2026 — 'sold_out' (migration 0034) is a fixed-price deal that's
  // fully claimed for now but might reopen with another batch
  // (evaluateBatchRelisting.ts) — still worth showing (disabled, "sold
  // out") rather than vanishing the way a plain 'live' filter would. Never
  // set on legacy 'auction' rows, so this is a no-op for those.
  const { data, error } = await supabase
    .from("opportunities")
    .select("*, categories(name, slug)")
    .in("status", ["live", "sold_out"])
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tier = auth?.profile.subscriptionTier ?? "free";
  const entitlements = TIER_ENTITLEMENTS[tier];
  const now = Date.now();

  const visible = (data ?? []).filter((o) => {
    if (!o.pro_early_access_until) return true;
    const stillInEarlyAccess = new Date(o.pro_early_access_until).getTime() > now;
    return !stillInEarlyAccess || entitlements.earlyAccessSeconds > 0;
  });

  // Real slot counts for every fixed-price deal on this page, in one query
  // rather than one round-trip per card.
  const fixedPriceIds = visible.filter((o) => o.pricing_mode === "fixed_price").map((o) => o.id);
  const slotsTakenById = new Map<string, number>();
  const myPurchasedIds = new Set<string>();
  if (fixedPriceIds.length > 0) {
    const { data: slotRows } = await supabase
      .from("opportunity_slot_purchases")
      .select("opportunity_id, profile_id")
      .in("opportunity_id", fixedPriceIds);
    for (const row of slotRows ?? []) {
      slotsTakenById.set(row.opportunity_id, (slotsTakenById.get(row.opportunity_id) ?? 0) + 1);
      if (auth && row.profile_id === auth.userId) myPurchasedIds.add(row.opportunity_id);
    }
  }

  const redacted = visible.map((o) => {
    const wonByMe = auth && o.won_by === auth.userId;
    const estimatedResalePriceGBP = withEstimatedResale(o);
    // 26 Aug 2026: product_name/image_url join the existing blind-teaser
    // reveal-on-win set (source_retailer/source_url/source_price_gbp) — a
    // specific product name or photo is identifying enough to make the
    // source guessable, same reasoning as the fields already here.
    const { source_retailer, source_url, source_price_gbp, product_name, image_url, ai_reasoning, ...teaser } = o;
    const revealFixedPriceDeal = o.pricing_mode === "fixed_price" && myPurchasedIds.has(o.id);
    return {
      ...teaser,
      slots_taken: slotsTakenById.get(o.id) ?? 0,
      already_purchased_slot: myPurchasedIds.has(o.id),
      estimated_resale_price_gbp: estimatedResalePriceGBP,
      ...(revealFixedPriceDeal ? { source_retailer, source_url, source_price_gbp, product_name, image_url } : {}),
      ...(wonByMe ? { source_retailer, source_url, source_price_gbp, product_name, image_url } : {}),
      ai_reasoning: entitlements.aiExplainability ? ai_reasoning : null,
    };
  });

  return NextResponse.json({ opportunities: redacted });
}
