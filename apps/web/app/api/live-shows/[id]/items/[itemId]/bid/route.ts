import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { requireTier, TierGuardError } from "@/lib/tierGuard";

export const dynamic = "force-dynamic";

/**
 * POST /api/live-shows/:id/items/:itemId/bid — a live ascending auction on
 * one show item, deliberately mirroring
 * api/opportunities/[id]/bid/route.ts's exact mechanic (bind the instant a
 * bid clears the current high bid; whoever's highest when the clock
 * expires wins — settled by the worker's closeExpiredLiveItems.ts) for
 * codebase consistency, since it's the same underlying idea: a live,
 * time-boxed ascending auction.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { itemId } = await params;
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  try {
    requireTier(auth.profile.subscriptionTier, "canBid");
  } catch (e) {
    if (e instanceof TierGuardError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const { amountGBP } = await req.json();
  if (typeof amountGBP !== "number" || amountGBP <= 0) {
    return NextResponse.json({ error: "amountGBP must be a positive number." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: item, error: itemError } = await supabase
    .from("live_show_items")
    .select("id, status, starting_bid_gbp, ends_at")
    .eq("id", itemId)
    .single();
  if (itemError || !item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  if (item.status !== "active") return NextResponse.json({ error: "This item isn't live for bidding right now." }, { status: 409 });
  if (item.ends_at && new Date(item.ends_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Bidding just closed on this item." }, { status: 409 });
  }

  const { data: highBid } = await supabase
    .from("live_bids")
    .select("amount_gbp")
    .eq("live_show_item_id", itemId)
    .order("amount_gbp", { ascending: false })
    .limit(1)
    .maybeSingle();

  const floor = highBid?.amount_gbp ?? item.starting_bid_gbp;
  if (amountGBP <= floor) {
    return NextResponse.json({ error: `Bid must be higher than the current bid of £${floor}.` }, { status: 409 });
  }

  const { error: insertError } = await supabase.from("live_bids").insert({
    live_show_item_id: itemId,
    bidder_id: auth.userId,
    amount_gbp: amountGBP,
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ ok: true, amountGBP });
}
