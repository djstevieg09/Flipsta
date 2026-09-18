import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

// Force-dynamic: every route here reads live application data (bids, wallet
// balances, opportunities, order status) straight from Supabase. Without this,
// Next.js's App Router can cache a GET route's first response (including the
// fetch calls a library like supabase-js makes under the hood) and keep
// serving that same stale response indefinitely, even after the database
// changes underneath it — exactly what caused real, freshly-discovered
// opportunities to not show up on /opportunities on 25 Aug 2026.
export const dynamic = "force-dynamic";

/**
 * GET /api/activity — the real version of the "community" bidding feed the
 * signed-off mockups faked with random names (see mockups/*: `addFeedItem`).
 * Reads the actual bids table — every real bid and instant-win already
 * lands there (see bid/route.ts and instant-win/route.ts) — and returns
 * only fields already public elsewhere on the platform: a bidder's display
 * name, the category, the amount, and whether it was an instant-win.
 *
 * bids' RLS policy is deliberately "only your own bids" (see
 * supabase/migrations/0001_init.sql), so this is the one place that reads
 * across bidders — via the service-role client, server-side only, never
 * exposed to the browser. It never reveals anything the blind-teaser
 * redaction (Section 5) is protecting, i.e. no source_retailer/source_url.
 */
export async function GET() {
  const supabase = createSupabaseServiceClient();

  const [{ data, error }, { data: slotData, error: slotError }] = await Promise.all([
    supabase
      .from("bids")
      .select("id, amount_gbp, is_instant_win, created_at, profiles(display_name), opportunities(urgency_tier, categories(name))")
      .order("created_at", { ascending: false })
      .limit(25),
    // 18 Sept 2026 — fixed-price deal slots (migration 0034) never insert
    // into `bids` at all (there's no auction to bid in), so without this
    // the live ticker would go quiet the moment discoverOpportunities.ts
    // stops creating auction-style rows.
    supabase
      .from("opportunity_slot_purchases")
      .select("id, price_coins, purchased_at, profiles(display_name), opportunities(urgency_tier, categories(name))")
      .order("purchased_at", { ascending: false })
      .limit(25),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (slotError) return NextResponse.json({ error: slotError.message }, { status: 500 });

  const bidActivity = (data ?? []).map((b: any) => ({
    id: b.id,
    displayName: b.profiles?.display_name ?? "A member",
    amountGBP: b.amount_gbp,
    isInstantWin: b.is_instant_win,
    categoryName: b.opportunities?.categories?.name ?? "an item",
    urgencyTier: b.opportunities?.urgency_tier ?? "standard",
    createdAt: b.created_at,
  }));

  // Coins display as the same numeric £ amount (1 coin = £1), same "WON"
  // badge treatment as an instant-win bid — buying a slot is just as
  // binding/immediate.
  const slotActivity = (slotData ?? []).map((s: any) => ({
    id: s.id,
    displayName: s.profiles?.display_name ?? "A member",
    amountGBP: s.price_coins,
    isInstantWin: true,
    categoryName: s.opportunities?.categories?.name ?? "an item",
    urgencyTier: s.opportunities?.urgency_tier ?? "standard",
    createdAt: s.purchased_at,
  }));

  const activity = [...bidActivity, ...slotActivity]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 25);

  return NextResponse.json({ activity });
}
