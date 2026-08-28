import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/subscription-grant — Steven, 27 Aug 2026: "we also need
 * an oppotunity to issue a free months subscription or mulitples of."
 * Confirmed as a general admin gifting tool. requireStaff("support") —
 * same bar as the existing tier-override button
 * (api/admin/sellers/[id]/route.ts), which this is conceptually the same
 * kind of action as (not money-moving, unlike wallet-credit's "admin" bar).
 *
 * See migration 0027's extensive comments for the full design and the
 * accepted Stripe-webhook-overwrite sharp edge this shares with the
 * pre-existing tier-override button.
 */
export async function POST(req: NextRequest) {
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { profileId, tier, months, reason } = await req.json();
  if (!profileId || !tier || !["standard", "pro", "elite"].includes(tier)) {
    return NextResponse.json({ error: "profileId and a tier (standard/pro/elite) are required." }, { status: 400 });
  }
  const numMonths = Number(months);
  if (!Number.isInteger(numMonths) || numMonths < 1 || numMonths > 24) {
    return NextResponse.json({ error: "months must be a whole number between 1 and 24." }, { status: 400 });
  }
  if (!reason || !String(reason).trim()) {
    return NextResponse.json({ error: "A reason is required — it's recorded in the audit log." }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, subscription_tier, subscription_tier_before_grant, subscription_tier_grant_expires_at")
    .eq("id", profileId)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (!profile) return NextResponse.json({ error: "No such profile." }, { status: 404 });

  // If a grant is already active on this profile, extend/replace it rather
  // than stacking — the "before grant" tier to restore to should always be
  // the tier from BEFORE the first grant in a chain, not whatever tier a
  // previous grant temporarily set.
  const tierBeforeGrant = profile.subscription_tier_grant_expires_at ? profile.subscription_tier_before_grant : profile.subscription_tier;

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + numMonths);

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({
      subscription_tier: tier,
      subscription_tier_before_grant: tierBeforeGrant,
      subscription_tier_grant_expires_at: expiresAt.toISOString(),
    })
    .eq("id", profileId)
    .select()
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: `subscription grant: ${tier} for ${numMonths} month(s), reverts to ${tierBeforeGrant} on ${expiresAt.toISOString().slice(0, 10)}`,
    targetType: "profile",
    targetId: profileId,
    reason,
  });

  return NextResponse.json({ profile: updated });
}
