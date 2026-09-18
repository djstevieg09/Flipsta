import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";

export const dynamic = "force-dynamic";

/**
 * GET/PATCH /api/account/notification-prefs — 27 Aug 2026: the opt-out
 * side of deal-drop notifications (see notifyDealMatches.ts). On by
 * default, one click off from /account — deliberately as easy to switch
 * off as it was to be on by default, given the CMA/ICO scrutiny on
 * one-sided opt-out flows called out in the research write-up
 * (claude/deployment-checklist.md's #-5 section).
 */
export async function GET() {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("notify_deal_matches, notify_promotions")
    .eq("id", auth.userId)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notifyDealMatches: data.notify_deal_matches, notifyPromotions: data.notify_promotions });
}

export async function PATCH(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { notifyDealMatches, notifyPromotions } = await req.json();
  const update: Record<string, boolean> = {};
  if (notifyDealMatches !== undefined) {
    if (typeof notifyDealMatches !== "boolean") {
      return NextResponse.json({ error: "notifyDealMatches must be true or false." }, { status: 400 });
    }
    update.notify_deal_matches = notifyDealMatches;
  }
  // 18 Sept 2026 — the opt-out side of promo_broadcasts (migration 0037),
  // same "on by default, one click off" pattern as notify_deal_matches
  // above.
  if (notifyPromotions !== undefined) {
    if (typeof notifyPromotions !== "boolean") {
      return NextResponse.json({ error: "notifyPromotions must be true or false." }, { status: 400 });
    }
    update.notify_promotions = notifyPromotions;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No recognised fields to update." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("profiles").update(update).eq("id", auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...update });
}
