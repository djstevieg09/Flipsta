import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { TIER_ENTITLEMENTS } from "@/lib/tierGuard";
import { canClaimAnotherFulfillmentJob, fulfillmentClaimDeadline } from "@flipsta/shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/fulfillment — the Pro/Elite job board. Steven: "the order is
 * then passed onto the pro and elite opptunites as a free button to press
 * to fulfill the order." Two lists: open jobs anyone entitled can claim,
 * and this caller's own claims (which is where source_retailer/source_url
 * — Flipsta's actual sourcing info — get revealed, same reveal-on-claim
 * pattern as opportunities' reveal-on-win).
 */
export async function GET() {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!TIER_ENTITLEMENTS[auth.profile.subscriptionTier].canFulfill) {
    return NextResponse.json({ error: "Fulfilling shop orders requires Pro or Elite." }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();

  // Fairness (Steven: "make sure this is fair so one person isnt bashing
  // all the orders as they come in"): oldest-paid-first ordering, not
  // newest-first, so a job that's been waiting isn't perpetually buried
  // under fresher ones for whoever's fastest to refresh the page.
  const { data: claimable, error: claimableError } = await supabase
    .from("shop_items")
    .select("id, product_name, description, image_url, our_price_gbp, fulfillment_reward_gbp, fulfiller_reimbursement_gbp, estimated_stock_units, paid_at, categories(name)")
    .eq("status", "sold_awaiting_fulfillment")
    .order("paid_at", { ascending: true });
  if (claimableError) return NextResponse.json({ error: claimableError.message }, { status: 500 });

  const { data: myClaims, error: myClaimsError } = await supabase
    .from("shop_items")
    .select(
      "id, product_name, description, image_url, source_retailer, source_url, source_price_gbp, fulfillment_reward_gbp, fulfiller_reimbursement_gbp, status, fulfillment_claimed_at, fulfillment_deadline_at, shipped_at, delivered_at",
    )
    .eq("fulfiller_id", auth.userId)
    .in("status", ["fulfillment_claimed", "shipped", "delivered"])
    .order("fulfillment_claimed_at", { ascending: false });
  if (myClaimsError) return NextResponse.json({ error: myClaimsError.message }, { status: 500 });

  return NextResponse.json({ claimable, myClaims });
}

/**
 * POST /api/fulfillment — claim an open job. Steven's fairness ask, made
 * real: a per-user concurrent-claim cap (canClaimAnotherFulfillmentJob) on
 * top of RLS's own "unclaimed only" guard (migration 0013), plus a claim
 * deadline (fulfillmentClaimDeadline) that the worker's
 * releaseExpiredFulfillmentClaims.ts job auto-releases if it's blown past
 * with nothing shipped.
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!TIER_ENTITLEMENTS[auth.profile.subscriptionTier].canFulfill) {
    return NextResponse.json({ error: "Fulfilling shop orders requires Pro or Elite." }, { status: 403 });
  }

  const { itemId } = await req.json();
  if (!itemId) return NextResponse.json({ error: "itemId is required." }, { status: 400 });

  const supabase = await createSupabaseServerClient();

  const { count: activeClaims, error: countError } = await supabase
    .from("shop_items")
    .select("id", { count: "exact", head: true })
    .eq("fulfiller_id", auth.userId)
    .in("status", ["fulfillment_claimed", "shipped"]);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
  if (!canClaimAnotherFulfillmentJob(activeClaims ?? 0)) {
    return NextResponse.json(
      { error: `You already have ${activeClaims} job(s) claimed — ship those before claiming another.` },
      { status: 409 },
    );
  }

  const claimedAt = new Date();
  const deadline = fulfillmentClaimDeadline(claimedAt);

  // Same optimistic-concurrency + "a row actually came back" check as
  // Instant Win's migration-0011 fix — RLS's "claim an open fulfillment
  // job" policy (migration 0013) only matches an unclaimed, paid-for item,
  // so two fulfillers racing the same job correctly leaves one of them
  // with zero rows back instead of a false "you claimed it."
  const { data: updated, error: updateError } = await supabase
    .from("shop_items")
    .update({
      status: "fulfillment_claimed",
      fulfiller_id: auth.userId,
      fulfillment_claimed_at: claimedAt.toISOString(),
      fulfillment_deadline_at: deadline.toISOString(),
    })
    .eq("id", itemId)
    .eq("status", "sold_awaiting_fulfillment")
    .is("fulfiller_id", null)
    .select("id, product_name, source_retailer, source_url, source_price_gbp")
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!updated) {
    return NextResponse.json({ error: "This job was just claimed by someone else." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, item: updated });
}
