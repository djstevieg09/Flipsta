import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";

/**
 * POST /api/admin/buyback-claims/[id]/resolve — a staff member approving or
 * rejecting an eligible claim. Approving pays out real money — payout_pct
 * (70% by default, see Section 8.3) of the real item_price_gbp captured on
 * the policy at purchase time — via the same wallet_transactions ledger
 * everything else in this app pays out through (kind: 'buyback_payout',
 * already existed as a valid kind since migration 0001, just never used).
 * Requires "admin" like every other action that moves real money.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let auth;
  try {
    auth = await requireStaff("admin");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { approve, reason } = await req.json();
  if (typeof approve !== "boolean") {
    return NextResponse.json({ error: "approve (boolean) is required." }, { status: 400 });
  }
  if (!reason || !String(reason).trim()) {
    return NextResponse.json({ error: "A reason is required — it's recorded in the audit log." }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();

  const { data: claim, error: claimError } = await supabase
    .from("buyback_claims")
    .select("id, status, policy_id, buyback_policies(profile_id, item_price_gbp, payout_pct)")
    .eq("id", id)
    .maybeSingle();
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  if (!claim) return NextResponse.json({ error: "No such claim." }, { status: 404 });
  if (claim.status !== "eligible") {
    return NextResponse.json({ error: `Only an "eligible" claim can be resolved (this one is "${claim.status}").` }, { status: 409 });
  }

  const policy = (claim as any).buyback_policies;
  const now = new Date().toISOString();

  if (approve) {
    const payoutGBP = Math.round(policy.item_price_gbp * policy.payout_pct * 100) / 100;
    const { error: payoutError } = await supabase.from("wallet_transactions").insert({
      profile_id: policy.profile_id,
      amount_gbp: payoutGBP,
      kind: "buyback_payout",
    });
    if (payoutError) return NextResponse.json({ error: payoutError.message }, { status: 500 });

    await supabase.from("buyback_claims").update({ status: "paid", resolved_at: now }).eq("id", id);
    await logAdminAction(supabase, {
      adminId: auth.userId,
      action: `buyback claim approved: £${payoutGBP.toFixed(2)} paid`,
      targetType: "buyback_claim",
      targetId: id,
      reason,
    });
    return NextResponse.json({ ok: true, payoutGBP });
  }

  await supabase.from("buyback_claims").update({ status: "rejected", resolved_at: now }).eq("id", id);
  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: "buyback claim rejected",
    targetType: "buyback_claim",
    targetId: id,
    reason,
  });
  return NextResponse.json({ ok: true });
}
