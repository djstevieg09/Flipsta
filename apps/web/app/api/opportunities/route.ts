import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { TIER_ENTITLEMENTS } from "@/lib/tierGuard";

/**
 * GET /api/opportunities — the live feed (Section 2 step 4, Section 5 blind teaser).
 * - Redacts source_retailer / source_url / source_price_gbp unless the caller won it.
 * - Enforces the Pro/Elite early-access window (Section 7): Standard tier
 *   doesn't see an opportunity until pro_early_access_until has passed.
 * - Strips ai_reasoning for tiers without AI explainability (Section 11.3 modal feature).
 *
 * GET /api/opportunities?won=true — a different mode entirely: the caller's
 * own won opportunities (any status), fields unredacted since they own
 * them. Powers /sell/new, where a seller turns a win into a listing.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const auth = await getCurrentProfile();

  if (req.nextUrl.searchParams.get("won") === "true") {
    if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const { data, error } = await supabase
      .from("opportunities")
      .select("*, categories(name, slug)")
      .eq("won_by", auth.userId)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ opportunities: data });
  }

  const { data, error } = await supabase
    .from("opportunities")
    .select("*, categories(name, slug)")
    .eq("status", "live")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tier = auth?.profile.subscriptionTier ?? "free";
  const entitlements = TIER_ENTITLEMENTS[tier];
  const now = Date.now();

  const visible = (data ?? []).filter((o) => {
    if (!o.pro_early_access_until) return true;
    const stillInEarlyAccess = new Date(o.pro_early_access_until).getTime() > now;
    return !stillInEarlyAccess || entitlements.earlyAccessSeconds > 0;
  });

  const redacted = visible.map((o) => {
    const wonByMe = auth && o.won_by === auth.userId;
    const { source_retailer, source_url, source_price_gbp, ai_reasoning, ...teaser } = o;
    return {
      ...teaser,
      ...(wonByMe ? { source_retailer, source_url, source_price_gbp } : {}),
      ai_reasoning: entitlements.aiExplainability ? ai_reasoning : null,
    };
  });

  return NextResponse.json({ opportunities: redacted });
}
