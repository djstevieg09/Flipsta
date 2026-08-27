import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";

// Force-dynamic — see the note on every other admin route reading live data.
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/wallet-credit — Section 12.1. Manually grants (or, with a
 * negative amount, removes) real spendable wallet credit for a specific
 * profile — Steven, 27 Aug 2026: "need the ability to add credit to people
 * to spend on the store for sorry's etc." Reuses the exact same
 * wallet_transactions ledger loyalty credit and referral credit already
 * write to (migration 0022 adds the 'goodwill_credit' kind), so it shows up
 * on /wallet and spends the same way as any other credit — no separate
 * "goodwill balance" to build or reconcile.
 *
 * Requires "admin" (not just "support") since, unlike a tier override, this
 * moves real money with no independent limit — a reason is mandatory and
 * goes into admin_audit_log alongside who granted it and when.
 */
export async function POST(req: NextRequest) {
  let auth;
  try {
    auth = await requireStaff("admin");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { profileId, amountGBP, reason } = await req.json();
  if (!profileId || typeof amountGBP !== "number" || amountGBP === 0) {
    return NextResponse.json({ error: "profileId and a non-zero amountGBP are required." }, { status: 400 });
  }
  if (!reason || !String(reason).trim()) {
    return NextResponse.json({ error: "A reason is required — it's recorded in the audit log." }, { status: 400 });
  }
  // A sanity ceiling, not a hard business rule — catches a stray extra zero
  // before it becomes a five-figure typo. Raise this (or remove it) if a
  // real goodwill case ever genuinely needs more.
  if (Math.abs(amountGBP) > 500) {
    return NextResponse.json({ error: "Amounts over £500 need a different process — check with Steven first." }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", profileId)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (!profile) return NextResponse.json({ error: "No such profile." }, { status: 404 });

  const { error: insertError } = await supabase.from("wallet_transactions").insert({
    profile_id: profileId,
    amount_gbp: amountGBP,
    kind: "goodwill_credit",
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: `goodwill credit: ${amountGBP >= 0 ? "+" : ""}£${amountGBP.toFixed(2)}`,
    targetType: "profile",
    targetId: profileId,
    reason,
  });

  return NextResponse.json({ ok: true, profileDisplayName: profile.display_name });
}
