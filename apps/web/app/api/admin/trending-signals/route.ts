import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/admin/trending-signals — 18 Sept 2026, Steven, after
 * asking what's hottest on TikTok right now: "yes add this to make the
 * bot clever." Backed by migration 0036's trending_signals table, same
 * "admin edits the real thing, nothing hardcoded" pattern as
 * /api/admin/seasonal-events. Reads flow into claudeSearchAdapter.ts's
 * search prompt while a row is unexpired (see discoverOpportunities.ts's
 * loadDiscoveryContext) — a trend fades on its own once expiresOn passes,
 * no separate cleanup job needed.
 */
export async function GET() {
  try {
    await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("trending_signals")
    .select("*")
    .order("added_on", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    signals: (data ?? []).map((s: any) => ({
      id: s.id,
      keyword: s.keyword,
      categorySlugs: s.category_slugs ?? [],
      note: s.note,
      source: s.source,
      addedOn: s.added_on,
      expiresOn: s.expires_on,
    })),
  });
}

export async function POST(req: NextRequest) {
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { keyword, categorySlugs, note, source, expiresOn } = await req.json();
  if (!keyword || typeof keyword !== "string" || !keyword.trim()) {
    return NextResponse.json({ error: "keyword is required." }, { status: 400 });
  }
  if (!note || typeof note !== "string" || !note.trim()) {
    return NextResponse.json({ error: "note is required — say why this is trending and where the figures came from." }, { status: 400 });
  }
  if (!expiresOn) {
    return NextResponse.json({ error: "expiresOn is required (YYYY-MM-DD) — a trend needs a hard expiry, unlike a seasonal calendar date." }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("trending_signals")
    .insert({
      keyword: keyword.trim(),
      category_slugs: Array.isArray(categorySlugs) ? categorySlugs : [],
      note: note.trim(),
      source: typeof source === "string" && source.trim() ? source.trim() : "tiktok",
      expires_on: expiresOn,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: `trending signal added: "${keyword.trim()}"`,
    targetType: "trending_signal",
    targetId: data.id,
  });

  return NextResponse.json({ signal: data }, { status: 201 });
}
