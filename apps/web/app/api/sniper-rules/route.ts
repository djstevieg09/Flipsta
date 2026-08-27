import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { requireTier, TierGuardError } from "@/lib/tierGuard";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/sniper-rules — Section 6.1/7's "set rules and opt into
 * fully automatic execution" — sniper_rules (migration 0001) has existed
 * since day one with real owner-only RLS ("sniper rules are owner-only",
 * `for all`), so a plain user-scoped client is enough here, same as
 * /api/wants — no service-role client needed.
 *
 * Execution itself is apps/worker/src/jobs/runSniperBids.ts, on the same
 * 30-second cadence as closeExpiredAuctions.
 */
export async function GET() {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sniper_rules")
    .select("*, categories(name)")
    .eq("profile_id", auth.userId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rules: data });
}

export async function POST(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  try {
    requireTier(auth.profile.subscriptionTier, "sniperMode");
  } catch (e) {
    if (e instanceof TierGuardError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const { categoryId, maxBudgetGBP, minMarginPct } = await req.json();
  if (typeof maxBudgetGBP !== "number" || maxBudgetGBP <= 0) {
    return NextResponse.json({ error: "maxBudgetGBP must be a positive number." }, { status: 400 });
  }
  if (typeof minMarginPct !== "number" || minMarginPct < 0 || minMarginPct > 1) {
    return NextResponse.json({ error: "minMarginPct must be between 0 and 1." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sniper_rules")
    .insert({
      profile_id: auth.userId,
      category_id: categoryId || null,
      max_budget_gbp: maxBudgetGBP,
      min_margin_pct: minMarginPct,
    })
    .select("*, categories(name)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rule: data }, { status: 201 });
}
