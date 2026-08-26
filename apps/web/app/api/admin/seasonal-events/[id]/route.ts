import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, AdminGuardError } from "@/lib/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";

export const dynamic = "force-dynamic";

/** PATCH /api/admin/seasonal-events/[id] — edit an existing calendar entry (dates, categories, name). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const body = await req.json();
  const update: Record<string, unknown> = {};
  if ("name" in body) {
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "name cannot be blank." }, { status: 400 });
    }
    update.name = body.name.trim();
  }
  if ("categorySlugs" in body) update.category_slugs = Array.isArray(body.categorySlugs) ? body.categorySlugs : [];
  if ("searchStartsOn" in body) update.search_starts_on = body.searchStartsOn;
  if ("searchEndsOn" in body) update.search_ends_on = body.searchEndsOn;
  if ("expireStockAfter" in body) update.expire_stock_after = body.expireStockAfter;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No recognised fields to update." }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.from("seasonal_events").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: `seasonal event updated: "${data.name}"`,
    targetType: "seasonal_event",
    targetId: id,
  });

  return NextResponse.json({ event: data });
}

/** DELETE /api/admin/seasonal-events/[id] — remove a calendar entry entirely
 * (e.g. added by mistake). Existing shop_items keep their seasonal_event_id
 * reference nulled via the FK's default behaviour is NOT set here — the
 * column has no ON DELETE clause, so Postgres will refuse the delete while
 * any shop_items row still references this event; that's the right
 * behaviour (surfaces the conflict rather than silently orphaning stock)
 * and the error message says so plainly. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let auth;
  try {
    auth = await requireStaff("support");
  } catch (e) {
    if (e instanceof AdminGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supabase = createSupabaseServiceClient();
  const { data: existing } = await supabase.from("seasonal_events").select("name").eq("id", id).single();
  const { error } = await supabase.from("seasonal_events").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: `${error.message} — if this is a foreign key violation, shop items are still tagged to this event; wait for them to sell or expire first.` },
      { status: 500 },
    );
  }

  await logAdminAction(supabase, {
    adminId: auth.userId,
    action: `seasonal event deleted: "${existing?.name ?? id}"`,
    targetType: "seasonal_event",
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}
