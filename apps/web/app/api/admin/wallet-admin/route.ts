import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/wallet-admin — 18 Sept 2026, Steven: "i need to be able to
 * add flippy coins to peoples flip wallet... add a tab wallet admin. In
 * there should be everyone thats signed up. i should be able to search via
 * email address or username (avatar name)." Every profile plus its email
 * (profiles has no email column — it lives on the auth user, so this joins
 * it in via auth.admin.listUsers, paginating until every user's covered)
 * and its real Flippy Coin balance. Search itself happens client-side
 * against this full list (same pattern as /api/admin/sellers), not a
 * server query param.
 */
export async function GET() {
  try {
    await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supabase = createSupabaseServiceClient();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, display_name, subscription_tier, flippy_coin_balance, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const emailById = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data: userPage, error: userError } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (userError) break; // Best-effort — a listUsers hiccup shouldn't block seeing the profile list, just the email column.
    for (const u of userPage?.users ?? []) {
      if (u.email) emailById.set(u.id, u.email);
    }
    if (!userPage?.users || userPage.users.length < 1000) break;
  }

  const users = (profiles ?? []).map((p: any) => ({
    id: p.id,
    displayName: p.display_name,
    email: emailById.get(p.id) ?? null,
    subscriptionTier: p.subscription_tier,
    flippyCoinBalance: p.flippy_coin_balance ?? 0,
    createdAt: p.created_at,
  }));

  return NextResponse.json({ users });
}

/**
 * POST /api/admin/wallet-admin — grants (or, with a negative amount,
 * removes) Flippy Coins for a specific profile. Requires "admin" (not just
 * "support") since, like the existing GBP goodwill credit route, this
 * moves real value with no independent limit — a reason is mandatory and
 * goes into admin_audit_log. Always routed through credit_flippy_coins()
 * (migration 0031_flippy_coins.sql) — the only path allowed to move
 * flippy_coin_balance — never a direct profiles update.
 */
export async function POST(req: NextRequest) {
  let auth;
  try {
    auth = await requireStaff("admin");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { profileId, amountCoins, reason } = await req.json();
  if (!profileId || typeof amountCoins !== "number" || !Number.isInteger(amountCoins) || amountCoins === 0) {
    return NextResponse.json({ error: "profileId and a non-zero whole number of coins are required." }, { status: 400 });
  }
  if (!reason || !String(reason).trim()) {
    return NextResponse.json({ error: "A reason is required — it's recorded in the audit log." }, { status: 400 });
  }
  // A sanity ceiling, not a hard business rule — same purpose as the £500
  // cap on the GBP goodwill-credit route: catches a stray extra zero
  // before it becomes a five-figure typo. Do it in two grants if a real
  // case genuinely needs more.
  if (Math.abs(amountCoins) > 1000) {
    return NextResponse.json({ error: "Amounts over 1,000 coins need a different process — check with Steven first." }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, flippy_coin_balance")
    .eq("id", profileId)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (!profile) return NextResponse.json({ error: "No such profile." }, { status: 404 });
  if (amountCoins < 0 && profile.flippy_coin_balance + amountCoins < 0) {
    return NextResponse.json({ error: `${profile.display_name} only has ${profile.flippy_coin_balance} coins — can't remove more than that.` }, { status: 400 });
  }

  const { data: newBalance, error: rpcError } = await supabase.rpc("credit_flippy_coins", {
    p_profile_id: profileId,
    p_amount: amountCoins,
    p_kind: "admin_grant",
    p_note: reason,
  });
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: `flippy coin grant: ${amountCoins >= 0 ? "+" : ""}${amountCoins} coins`,
    targetType: "profile",
    targetId: profileId,
    reason,
  });

  return NextResponse.json({ ok: true, profileDisplayName: profile.display_name, newBalance });
}
