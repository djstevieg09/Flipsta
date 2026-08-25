import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

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

  const { data, error } = await supabase
    .from("bids")
    .select("id, amount_gbp, is_instant_win, created_at, profiles(display_name), opportunities(urgency_tier, categories(name))")
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const activity = (data ?? []).map((b: any) => ({
    id: b.id,
    displayName: b.profiles?.display_name ?? "A member",
    amountGBP: b.amount_gbp,
    isInstantWin: b.is_instant_win,
    categoryName: b.opportunities?.categories?.name ?? "an item",
    urgencyTier: b.opportunities?.urgency_tier ?? "standard",
    createdAt: b.created_at,
  }));

  return NextResponse.json({ activity });
}
