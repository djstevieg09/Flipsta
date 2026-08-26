import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/admin/seasonal-events — the "Full calendar" option Steven
 * picked for seasonal AI awareness: "look at the time of year and think
 * for instance Halloween coming up then start looking for Halloween
 * goods... needs to remove Halloween stuff after its past and then start
 * looking for the next big holiday." Backed by migration 0019's
 * seasonal_events table. Reads flow into claudeSearchAdapter.ts's search
 * prompt while an event is inside its search window (see
 * discoverOpportunities.ts's loadDiscoveryContext), and expireSeasonalStock.ts
 * (apps/worker) auto-clears unsold matching shop_items once expire_stock_after
 * passes — nothing hardcoded, an admin edits the actual calendar here.
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
    .from("seasonal_events")
    .select("*")
    .order("search_starts_on", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    events: (data ?? []).map((e: any) => ({
      id: e.id,
      name: e.name,
      categorySlugs: e.category_slugs ?? [],
      searchStartsOn: e.search_starts_on,
      searchEndsOn: e.search_ends_on,
      expireStockAfter: e.expire_stock_after,
      createdAt: e.created_at,
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

  const { name, categorySlugs, searchStartsOn, searchEndsOn, expireStockAfter } = await req.json();
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }
  if (!searchStartsOn || !searchEndsOn || !expireStockAfter) {
    return NextResponse.json({ error: "searchStartsOn, searchEndsOn, and expireStockAfter are all required (YYYY-MM-DD)." }, { status: 400 });
  }
  if (searchEndsOn < searchStartsOn) {
    return NextResponse.json({ error: "searchEndsOn must be on or after searchStartsOn." }, { status: 400 });
  }
  if (expireStockAfter < searchEndsOn) {
    return NextResponse.json({ error: "expireStockAfter should be on or after searchEndsOn — stock shouldn't expire before the search window even ends." }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("seasonal_events")
    .insert({
      name: name.trim(),
      category_slugs: Array.isArray(categorySlugs) ? categorySlugs : [],
      search_starts_on: searchStartsOn,
      search_ends_on: searchEndsOn,
      expire_stock_after: expireStockAfter,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: `seasonal event created: "${name.trim()}"`,
    targetType: "seasonal_event",
    targetId: data.id,
  });

  return NextResponse.json({ event: data }, { status: 201 });
}
