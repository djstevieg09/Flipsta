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
  const { data, error } = await supabase.from("profiles").select("notify_deal_matches").eq("id", auth.userId).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notifyDealMatches: data.notify_deal_matches });
}

export async function PATCH(req: NextRequest) {
  const auth = await getCurrentProfile();
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { notifyDealMatches } = await req.json();
  if (typeof notifyDealMatches !== "boolean") {
    return NextResponse.json({ error: "notifyDealMatches must be true or false." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("profiles").update({ notify_deal_matches: notifyDealMatches }).eq("id", auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, notifyDealMatches });
}
