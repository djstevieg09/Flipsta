import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { isBuybackClaimEligible, ticketSlaDueAt } from "@flipsta/shared";

/**
 * POST /api/buyback/claim — Section 11.6's anti-abuse-gated claim: only
 * payable once the item's been genuinely, actively listed for the real
 * proof-of-listing window, at or below the AI's estimate. The shopper
 * reports when they listed it and confirms both conditions; eligibility is
 * computed for real via isBuybackClaimEligible (packages/shared/src/pricing.ts,
 * already tested) rather than trusted blindly.
 *
 * A real payout is still a human decision, same discipline as goodwill
 * credit and every other action that moves real money in this app — an
 * eligible claim opens a real ticket (category "buyback_claim", already
 * existed as a category with nothing that ever created one) for staff to
 * verify and action via POST /api/admin/buyback-claims/[id]/resolve. A
 * not-yet-eligible claim is still saved (so the shopper doesn't have to
 * remember to come back) but doesn't open a ticket yet — nothing for staff
 * to action until the window's actually up.
 */
export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { policyId, listedAt, listedAtOrBelowEstimate, offeredAtCostAfterWindow } = await req.json();
  if (!policyId || !listedAt) {
    return NextResponse.json({ error: "policyId and listedAt are required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: policy, error: policyError } = await supabase
    .from("buyback_policies")
    .select("id, profile_id, item_price_gbp, opportunities(product_name)")
    .eq("id", policyId)
    .maybeSingle();
  if (policyError) return NextResponse.json({ error: policyError.message }, { status: 500 });
  if (!policy || policy.profile_id !== auth.userId) return NextResponse.json({ error: "No such policy." }, { status: 404 });

  const { data: existingClaim } = await supabase
    .from("buyback_claims")
    .select("id, status")
    .eq("policy_id", policyId)
    .in("status", ["pending_window", "eligible"])
    .maybeSingle();
  if (existingClaim) {
    return NextResponse.json({ error: "There's already an open claim on this policy." }, { status: 409 });
  }

  const listedAtDate = new Date(listedAt);
  if (Number.isNaN(listedAtDate.getTime())) {
    return NextResponse.json({ error: "listedAt must be a valid date." }, { status: 400 });
  }

  const now = new Date();
  const eligibility = isBuybackClaimEligible({
    listedAt: listedAtDate,
    now,
    listedAtOrBelowEstimate: Boolean(listedAtOrBelowEstimate),
    offeredAtCostAfterWindow: Boolean(offeredAtCostAfterWindow),
  });

  const { data: claim, error: claimError } = await supabase
    .from("buyback_claims")
    .insert({
      policy_id: policyId,
      status: eligibility.eligible ? "eligible" : "pending_window",
      listed_at: listedAtDate.toISOString(),
      listed_at_or_below_estimate: Boolean(listedAtOrBelowEstimate),
      offered_at_cost_after_window: Boolean(offeredAtCostAfterWindow),
    })
    .select()
    .single();
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });

  let ticketCreated = false;
  if (eligibility.eligible) {
    const productName = (policy as any).opportunities?.product_name ?? "an opportunity";
    await supabase.from("tickets").insert({
      category: "buyback_claim",
      priority: "medium",
      subject: `Buyback claim — ${productName}`,
      body: `Policy ${policyId}, claim ${claim.id}. Item price £${policy.item_price_gbp}, listed ${listedAtDate.toLocaleDateString("en-GB")}, confirmed listed at or below estimate. Review and resolve via /admin/buyback-claims.`,
      requester_id: auth.userId,
      sla_due_at: ticketSlaDueAt("medium", now).toISOString(),
    });
    ticketCreated = true;
  }

  return NextResponse.json({ claim, eligibility, ticketCreated }, { status: 201 });
}
