import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { TIER_ENTITLEMENTS } from "@/lib/tierGuard";

/**
 * estimated_resale_price_gbp (0008_opportunity_lifecycle.sql) is only
 * populated going forward by discoverOpportunities.ts — any opportunity
 * created before that migration has it as null. Rather than leave those
 * showing a blank "Returns" figure until they cycle out of the feed,
 * reconstruct it from two fields that have always been there:
 * source_price_gbp + expected_margin_gbp ≈ the original resale estimate
 * (same arithmetic discoverOpportunities.ts used to derive the margin in
 * the first place, just run in reverse). source_price_gbp is only ever
 * read here server-side for this calculation — it's never included in
 * what gets returned to the caller unless they've already won it.
 */
function withEstimatedResale<T extends { estimated_resale_price_gbp?: number | null; source_price_gbp?: number | null; expected_margin_gbp?: number | null }>(
  o: T,
): number | null {
  if (typeof o.estimated_resale_price_gbp === "number") return o.estimated_resale_price_gbp;
  if (typeof o.source_price_gbp === "number" && typeof o.expected_margin_gbp === "number") {
    return Math.round((o.source_price_gbp + o.expected_margin_gbp) * 100) / 100;
  }
  return null;
}

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
    const opportunities = (data ?? []).map((o) => ({ ...o, estimated_resale_price_gbp: withEstimatedResale(o) }));
    return NextResponse.json({ opportunities });
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
    const estimatedResalePriceGBP = withEstimatedResale(o);
    const { source_retailer, source_url, source_price_gbp, ai_reasoning, ...teaser } = o;
    return {
      ...teaser,
      estimated_resale_price_gbp: estimatedResalePriceGBP,
      ...(wonByMe ? { source_retailer, source_url, source_price_gbp } : {}),
      ai_reasoning: entitlements.aiExplainability ? ai_reasoning : null,
    };
  });

  return NextResponse.json({ opportunities: redacted });
}
