import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";
import { isAwinConfigured, fetchJoinedProgrammes } from "@/lib/awin";

export const dynamic = "force-dynamic";

/**
 * GET/POST/DELETE /api/admin/awin-sync — 27 Aug 2026, Steven: "i need
 * assistance setting up Awin api to fill my store with goods... this is
 * seperate from our core buisness." Backed by migration 0025's
 * awin_sync_config (which advertisers actually get synced — Steven's
 * explicit "small pilot — 2-3 merchants first" scope, made a real admin
 * choice rather than "sync everything approved") and affiliate_products
 * (the synced rows, upserted by apps/worker/src/jobs/syncAwinProducts.ts).
 *
 * Same "support" staff level as discovery-focus/seasonal-events — this is
 * a content-curation control, not a money-moving action (contrast with
 * wallet-credit/buyback-claims, which require "admin").
 */
export async function GET() {
  try {
    await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supabase = createSupabaseServiceClient();
  const [{ data: configRows, error: configError }, { data: categories }] = await Promise.all([
    supabase.from("awin_sync_config").select("id, advertiser_id, advertiser_name, category_id, active, added_at").order("added_at", { ascending: false }),
    supabase.from("categories").select("id, name").order("name"),
  ]);
  if (configError) return NextResponse.json({ error: configError.message }, { status: 500 });

  // A live product count per advertiser tells the admin whether a pilot
  // merchant is actually syncing anything yet, without calling Awin again —
  // affiliate_products is the real, already-synced state.
  const advertiserIds = (configRows ?? []).map((r: any) => r.advertiser_id);
  const counts = new Map<string, number>();
  if (advertiserIds.length > 0) {
    const { data: productRows } = await supabase
      .from("affiliate_products")
      .select("advertiser_id")
      .in("advertiser_id", advertiserIds);
    for (const row of productRows ?? []) counts.set(row.advertiser_id, (counts.get(row.advertiser_id) ?? 0) + 1);
  }

  const syncConfig = (configRows ?? []).map((r: any) => ({
    id: r.id,
    advertiserId: r.advertiser_id,
    advertiserName: r.advertiser_name,
    categoryId: r.category_id,
    active: r.active,
    addedAt: r.added_at,
    productCount: counts.get(r.advertiser_id) ?? 0,
  }));

  // Awin itself is only queried if credentials are actually set — an admin
  // still sees their pilot list and product counts either way, just
  // without the "pick from your approved programmes" convenience until
  // Steven has a token. A live-lookup failure (Awin outage, bad token)
  // shouldn't break the whole page either.
  let joinedProgrammes: { id: string; name: string; status: string }[] = [];
  let programmesError: string | null = null;
  if (isAwinConfigured()) {
    try {
      joinedProgrammes = await fetchJoinedProgrammes();
    } catch (err) {
      programmesError = (err as Error).message;
    }
  }

  return NextResponse.json({
    awinConfigured: isAwinConfigured(),
    joinedProgrammes,
    programmesError,
    syncConfig,
    categories: categories ?? [],
  });
}

/** Adds one advertiser to the pilot sync list. */
export async function POST(req: NextRequest) {
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { advertiserId, advertiserName, categoryId } = await req.json();
  if (!advertiserId || typeof advertiserId !== "string") {
    return NextResponse.json({ error: "advertiserId is required." }, { status: 400 });
  }
  if (!advertiserName || typeof advertiserName !== "string") {
    return NextResponse.json({ error: "advertiserName is required." }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("awin_sync_config")
    .upsert(
      { advertiser_id: advertiserId, advertiser_name: advertiserName, category_id: categoryId || null, active: true, added_by: auth.userId },
      { onConflict: "advertiser_id" },
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: `added Awin advertiser "${advertiserName}" (${advertiserId}) to the sync pilot`,
    targetType: "awin_sync_config",
    targetId: data.id,
  });

  return NextResponse.json({ config: data }, { status: 201 });
}

/**
 * Removes an advertiser from the pilot — deletes both the sync config row
 * and its already-synced products, deliberately, rather than leaving stale
 * affiliate listings on /partner-deals for a merchant relationship that's
 * no longer being tracked. Pass ?advertiserId=... instead of a body, so
 * this stays a plain DELETE with no request body to parse.
 */
export async function DELETE(req: NextRequest) {
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const advertiserId = req.nextUrl.searchParams.get("advertiserId");
  if (!advertiserId) return NextResponse.json({ error: "advertiserId is required." }, { status: 400 });

  const supabase = createSupabaseServiceClient();
  const { error: deleteConfigError } = await supabase.from("awin_sync_config").delete().eq("advertiser_id", advertiserId);
  if (deleteConfigError) return NextResponse.json({ error: deleteConfigError.message }, { status: 500 });

  await supabase.from("affiliate_products").delete().eq("network", "awin").eq("advertiser_id", advertiserId);

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: `removed Awin advertiser (${advertiserId}) from the sync pilot`,
    targetType: "awin_sync_config",
    targetId: advertiserId,
  });

  return NextResponse.json({ ok: true });
}
